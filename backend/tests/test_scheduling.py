"""The chain that keeps the ingestion running without anything scheduling it from outside."""

import gzip
import sqlite3
from datetime import UTC, date, datetime

import pytest
from django.core.management import call_command
from django.utils import timezone
from django_tasks.base import TaskResultStatus
from django_tasks_db.models import DBTaskResult

from tgvmax import backup, tasks
from tgvmax.models import Offer, Station


def at(year, month, day, hour, minute) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


class TestNextRun:
    def test_the_same_day_when_the_hour_is_still_ahead(self):
        assert tasks.next_run(at(2026, 8, 9, 3, 0)) == at(2026, 8, 9, 5, 15)

    def test_tomorrow_once_the_hour_has_passed(self):
        assert tasks.next_run(at(2026, 8, 9, 6, 0)) == at(2026, 8, 10, 5, 15)

    def test_the_boundary_never_schedules_a_run_onto_itself(self):
        """Exactly RUN_AT means the run happening now, so the next one is tomorrow."""
        assert tasks.next_run(at(2026, 8, 9, 5, 15)) == at(2026, 8, 10, 5, 15)

    def test_a_month_boundary_is_the_timedelta_s_problem_not_ours(self):
        assert tasks.next_run(at(2026, 8, 31, 23, 0)) == at(2026, 9, 1, 5, 15)


@pytest.mark.django_db
class TestEnsureScheduled:
    def test_an_empty_database_ingests_immediately(self):
        when = tasks.ensure_scheduled()

        # Waiting for tomorrow morning would serve an empty map until then.
        assert when is not None
        assert when <= timezone.now()
        assert DBTaskResult.objects.count() == 1

    def test_a_populated_database_waits_for_the_next_window(self):
        Offer.objects.create(
            date=date(2026, 8, 12),
            train_no="6601",
            origin="PARIS (intramuros)",
            destination="LYON (intramuros)",
            departure="08:00",
            arrival="10:00",
            first_seen=date(2026, 8, 9),
            last_seen=date(2026, 8, 9),
        )

        when = tasks.ensure_scheduled()

        assert when is not None
        assert (when.hour, when.minute) == (tasks.RUN_AT.hour, tasks.RUN_AT.minute)

    def test_calling_it_twice_arms_one_chain(self):
        """Every deployment calls this. A second chain would double the daily fetch."""
        tasks.ensure_scheduled()

        assert tasks.ensure_scheduled() is None
        assert DBTaskResult.objects.count() == 1

    def test_a_run_in_flight_counts_as_armed(self):
        tasks.ensure_scheduled()
        DBTaskResult.objects.update(status=TaskResultStatus.RUNNING)

        assert tasks.ensure_scheduled() is None
        assert DBTaskResult.objects.count() == 1

    def test_a_finished_run_does_not_hold_the_chain_open(self):
        tasks.ensure_scheduled()
        DBTaskResult.objects.update(status=TaskResultStatus.SUCCESSFUL)

        assert tasks.ensure_scheduled() is not None
        assert DBTaskResult.objects.count() == 2

    def test_a_failed_run_lets_the_chain_be_re_armed(self):
        tasks.ensure_scheduled()
        DBTaskResult.objects.update(status=TaskResultStatus.FAILED)

        assert tasks.ensure_scheduled() is not None


@pytest.mark.django_db
def test_the_command_is_idempotent(capsys):
    call_command("fetch_tgvmax")
    call_command("fetch_tgvmax")

    assert "déjà programmée" in capsys.readouterr().out
    assert DBTaskResult.objects.count() == 1


@pytest.mark.django_db
def test_the_task_arms_the_next_run_before_doing_any_work(monkeypatch):
    """
    The order is the whole point: an ingestion that raises must not take the chain with it.
    """

    def explode():
        raise RuntimeError("export indisponible")

    monkeypatch.setattr(tasks.ingest, "run", explode)

    with pytest.raises(RuntimeError):
        tasks.refresh_dataset.call()

    assert DBTaskResult.objects.filter(status=TaskResultStatus.READY).count() == 1


class TestBackup:
    def test_it_writes_a_readable_gzipped_database(self, tmp_path):
        source = tmp_path / "source.sqlite3"
        connection = sqlite3.connect(source)
        connection.execute("CREATE TABLE gare (nom TEXT)")
        connection.execute("INSERT INTO gare VALUES ('PARIS (intramuros)')")
        connection.commit()
        connection.close()

        written = backup.write(source, tmp_path / "sauvegardes", on=date(2026, 8, 9))

        assert written.name == "2026-08-09.sqlite3.gz"
        restored = tmp_path / "restored.sqlite3"
        with gzip.open(written, "rb") as compressed:
            restored.write_bytes(compressed.read())
        rows = sqlite3.connect(restored).execute("SELECT nom FROM gare").fetchall()
        assert rows == [("PARIS (intramuros)",)]

    def test_it_leaves_no_partial_file_behind(self, tmp_path):
        source = tmp_path / "source.sqlite3"
        sqlite3.connect(source).close()
        directory = tmp_path / "sauvegardes"

        backup.write(source, directory, on=date(2026, 8, 9))

        assert list(directory.glob("*.partial")) == []

    def test_it_keeps_only_the_newest_copies(self, tmp_path):
        directory = tmp_path / "sauvegardes"
        directory.mkdir()
        for day in range(1, 8):
            (directory / f"2026-08-{day:02d}.sqlite3.gz").write_bytes(b"x")

        dropped = backup.prune(directory, keep=3)

        assert [p.name for p in dropped] == [
            "2026-08-01.sqlite3.gz",
            "2026-08-02.sqlite3.gz",
            "2026-08-03.sqlite3.gz",
            "2026-08-04.sqlite3.gz",
        ]
        assert sorted(p.name for p in directory.glob("*.gz")) == [
            "2026-08-05.sqlite3.gz",
            "2026-08-06.sqlite3.gz",
            "2026-08-07.sqlite3.gz",
        ]

    def test_fewer_copies_than_the_limit_drops_nothing(self, tmp_path):
        directory = tmp_path / "sauvegardes"
        directory.mkdir()
        (directory / "2026-08-09.sqlite3.gz").write_bytes(b"x")

        assert backup.prune(directory, keep=30) == []


@pytest.mark.django_db
def test_a_full_run_ingests_backs_up_and_re_arms(monkeypatch, tmp_path, settings):
    """One pass end to end, network stubbed: rows land, a copy exists, tomorrow is armed."""
    settings.BACKUP_DIR = tmp_path / "sauvegardes"
    Station.objects.create(
        label="PARIS (intramuros)", first_seen=date(2026, 8, 9), last_seen=date(2026, 8, 9)
    )

    class Fake:
        def as_dict(self):
            return {
                "rows": 1,
                "skipped": 0,
                "created": 1,
                "reappeared": 0,
                "vanished": 0,
                "stations": 1,
            }

    monkeypatch.setattr(tasks.ingest, "run", lambda: Fake())

    result = tasks.refresh_dataset.call()

    assert result["created"] == 1
    assert result["backup"].endswith(".sqlite3.gz")
    assert (settings.BACKUP_DIR / result["backup"]).exists()
    assert DBTaskResult.objects.filter(status=TaskResultStatus.READY).count() == 1
