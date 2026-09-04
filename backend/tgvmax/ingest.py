# Upstream is a rolling 30-day window refreshed once a day, so this runs once a day and is
# idempotent: a second pass on the same export changes nothing.

import logging
from dataclasses import asdict, dataclass
from datetime import date as Date
from datetime import time
from itertools import batched

from django.db import transaction
from django.utils import timezone

from .models import AvailabilityChange, AxisStation, Coverage, Ingestion, Offer, Station
from .sncf import (
    fetch_axis_stations,
    fetch_bookable_offers,
    fetch_coverage,
    fetch_station_labels,
)

logger = logging.getLogger(__name__)

Identity = tuple[Date, str, str, str, time, time]

BATCH = 2000


@dataclass(frozen=True)
class Stats:
    rows: int
    skipped: int
    observed: int
    created: int
    reappeared: int
    vanished: int
    stations: int

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def parse_identity(row: dict[str, str]) -> Identity | None:
    """The six fields that identify an offer, or None if the row is unusable."""
    try:
        return (
            Date.fromisoformat(row["date"]),
            row["train_no"],
            row["origine"],
            row["destination"],
            time.fromisoformat(row["heure_depart"]),
            time.fromisoformat(row["heure_arrivee"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


def sync_stations(labels: list[str], *, observed_on: Date) -> int:
    """Record every station the dataset names. Returns how many were new."""
    # Stations that leave the dataset are kept: a dropped label breaks a shared link.
    known = set(Station.objects.values_list("label", flat=True))
    fresh = [label for label in labels if label not in known]
    Station.objects.bulk_create(
        [Station(label=label, first_seen=observed_on, last_seen=observed_on) for label in fresh],
        batch_size=BATCH,
    )
    Station.objects.filter(label__in=labels).update(last_seen=observed_on)
    return len(fresh)


@transaction.atomic
def sync(
    rows: list[dict[str, str]], *, observed_on: Date, labels: list[str] | None = None
) -> Stats:
    """Reconcile the stored offers with one export."""
    # The export is already filtered on bookable rows, so disappearing from it is the only
    # sold-out signal there is — but only inside the window it covers: a past date leaves
    # the dataset because it is past, not because it sold out.
    seen: set[Identity] = set()
    skipped = 0
    for row in rows:
        identity = parse_identity(row)
        if identity is None:
            skipped += 1
            continue
        seen.add(identity)

    # A failed export parsing as an empty list would mark every stored offer sold out, and
    # that write lands in a history no later run can rebuild.
    if not seen:
        raise ValueError("export vide : aucune offre à ingérer, rien n'est modifié")
    if skipped:
        logger.warning("%d lignes illisibles ignorées", skipped)

    window = (min(i[0] for i in seen), max(i[0] for i in seen))
    stored: dict[Identity, tuple[int, bool]] = {}
    for pk, *fields, bookable in Offer.objects.filter(date__range=window).values_list(
        "id", "date", "train_no", "origin", "destination", "departure", "arrival", "bookable"
    ):
        stored[tuple(fields)] = (pk, bookable)

    fresh = [i for i in seen if i not in stored]
    Offer.objects.bulk_create(
        [
            Offer(
                date=date,
                train_no=train_no,
                origin=origin,
                destination=destination,
                departure=departure,
                arrival=arrival,
                bookable=True,
                first_seen=observed_on,
                last_seen=observed_on,
            )
            for date, train_no, origin, destination, departure, arrival in fresh
        ],
        batch_size=BATCH,
    )

    known = [i for i in seen if i in stored]
    reappeared = [stored[i][0] for i in known if not stored[i][1]]
    # strict=False: the last batch is short whenever the count is not a multiple.
    for chunk in batched((stored[i][0] for i in known), BATCH, strict=False):
        Offer.objects.filter(id__in=chunk).update(last_seen=observed_on, bookable=True)

    vanished = [
        pk for identity, (pk, bookable) in stored.items() if bookable and identity not in seen
    ]
    for chunk in batched(vanished, BATCH, strict=False):
        Offer.objects.filter(id__in=chunk).update(bookable=False)

    AvailabilityChange.objects.bulk_create(
        [AvailabilityChange(offer_id=pk, seen_on=observed_on, bookable=True) for pk in reappeared]
        + [AvailabilityChange(offer_id=pk, seen_on=observed_on, bookable=False) for pk in vanished],
        batch_size=BATCH,
    )

    # Falling back to the offers alone would drop every station with no seat left.
    station_labels = (
        labels
        if labels is not None
        else sorted({identity[2] for identity in seen} | {identity[3] for identity in seen})
    )

    stats = Stats(
        rows=len(rows),
        skipped=skipped,
        observed=len(seen),
        created=len(fresh),
        reappeared=len(reappeared),
        vanished=len(vanished),
        stations=sync_stations(station_labels, observed_on=observed_on),
    )

    # A second pass on the same day adds its movements and overwrites its sizes: movements
    # are flows two passes both contribute to, sizes describe one export and do not add up.
    run, fresh = Ingestion.objects.get_or_create(
        observed_on=observed_on,
        defaults={
            "rows": stats.rows,
            "observed": stats.observed,
            "created": stats.created,
            "reappeared": stats.reappeared,
            "vanished": stats.vanished,
        },
    )
    if not fresh:
        run.rows = stats.rows
        run.observed = stats.observed
        run.created += stats.created
        run.reappeared += stats.reappeared
        run.vanished += stats.vanished
        run.save()

    logger.info("ingestion %s: %s", observed_on, stats.as_dict())
    return stats


@transaction.atomic
def sync_coverage(rows: list[dict[str, object]], *, observed_on: Date) -> int:
    """Replace the eligibility totals with one aggregate. Returns how many pairs were written."""
    # Replaced, not updated: the window slides, and an update would leave its far edge behind.
    totals: dict[tuple[Date, str], list[int]] = {}
    for row in rows:
        day, axis, count = row.get("date"), row.get("axe"), row.get("rows")
        if not isinstance(day, str) or not isinstance(axis, str) or not isinstance(count, int):
            continue
        try:
            date = Date.fromisoformat(day[:10])
        except ValueError:
            continue
        entry = totals.setdefault((date, axis), [0, 0])
        entry[0] += count
        if row.get("od_happy_card") == "OUI":
            entry[1] += count

    if not totals:
        raise ValueError("agrégat de couverture vide : rien n'est modifié")

    Coverage.objects.all().delete()
    Coverage.objects.bulk_create(
        [
            Coverage(date=date, axis=axis, total=total, eligible=eligible, observed_on=observed_on)
            for (date, axis), (total, eligible) in totals.items()
        ],
        batch_size=BATCH,
    )
    logger.info("couverture %s : %d couples (date, axe)", observed_on, len(totals))
    return len(totals)


@transaction.atomic
def sync_axis_stations(rows: list[dict[str, object]]) -> int:
    """Replace the axis footprints with one aggregate. Returns how many pairs were written."""
    pairs = {
        (row["axe"], row["origine"])
        for row in rows
        if isinstance(row.get("axe"), str) and isinstance(row.get("origine"), str)
    }
    if not pairs:
        raise ValueError("agrégat des gares par axe vide : rien n'est modifié")

    AxisStation.objects.all().delete()
    AxisStation.objects.bulk_create(
        [AxisStation(axis=axis, label=label) for axis, label in pairs], batch_size=BATCH
    )
    return len(pairs)


def run(observed_on: Date | None = None) -> Stats:
    """Fetch the export and the station list, then reconcile. The daily entry point."""
    day = observed_on or timezone.localdate()
    stats = sync(
        fetch_bookable_offers(),
        observed_on=day,
        labels=fetch_station_labels(),
    )
    # Never fatal: a failure here leaves the previous totals, which `stats.py` then ignores
    # for being older than the offers.
    try:
        sync_coverage(fetch_coverage(), observed_on=day)
        sync_axis_stations(fetch_axis_stations())
    except Exception:
        logger.exception("couverture non mise à jour")
    return stats
