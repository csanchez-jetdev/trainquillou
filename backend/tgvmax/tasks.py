# Django Tasks has no scheduler through 6.1: it enqueues, it does not decide when. So a run
# arms the next one through `run_after`, before doing its own work — a run that fails still
# leaves tomorrow armed. `manage.py fetch_tgvmax` re-arms a chain that broke.

import logging
from datetime import datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.tasks import task
from django.utils import timezone
from django_tasks.base import TaskResultStatus
from django_tasks_db.models import DBTaskResult

from . import backup, ingest
from .models import Offer

logger = logging.getLogger(__name__)

# SNCF republishes the dataset around 04:30 UTC.
RUN_AT = time(5, 15)

# RUNNING counts: a deployment landing mid-ingestion would arm a second, lasting chain.
LIVE = (TaskResultStatus.READY, TaskResultStatus.RUNNING)


@task
def refresh_dataset() -> dict[str, int | str]:
    """Fetch the day's export, reconcile the stored offers, then back the database up."""
    schedule_next()
    stats = ingest.run().as_dict()

    database = Path(settings.DATABASES["default"]["NAME"])
    written = backup.write(database, backup_dir(), on=timezone.localdate())
    return {**stats, "backup": written.name}


def backup_dir() -> Path:
    return Path(settings.BACKUP_DIR)


def next_run(after: datetime) -> datetime:
    """The next RUN_AT strictly after `after`. UTC throughout, so no daylight saving."""
    candidate = after.replace(hour=RUN_AT.hour, minute=RUN_AT.minute, second=0, microsecond=0)
    return candidate if candidate > after else candidate + timedelta(days=1)


def schedule_next(*, run_after: datetime | None = None) -> datetime:
    when = run_after or next_run(timezone.now())
    refresh_dataset.using(run_after=when).enqueue()
    logger.info("prochaine ingestion programmée pour %s", when.isoformat())
    return when


def ensure_scheduled() -> datetime | None:
    """Arm the chain unless it already is. `None` when it already was."""
    # `task_path` and not `task_name`: the latter is a derived property, not a column, and
    # filtering on it raises.
    armed = DBTaskResult.objects.filter(task_path=refresh_dataset.module_path, status__in=LIVE)
    if armed.exists():
        return None

    now = timezone.now()
    return schedule_next(run_after=now if not Offer.objects.exists() else next_run(now))
