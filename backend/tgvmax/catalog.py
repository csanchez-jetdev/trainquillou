from datetime import date as Date

from django.db.models import Max, Min

from .models import Offer, Station
from .normalize import collation_key
from .stations import station_key


def all_labels() -> set[str]:
    # Not derived from the offers: those hold bookable legs only, so a station with no seat
    # left would disappear from the autocomplete.
    return set(Station.objects.values_list("label", flat=True))


def label_index() -> dict[str, str]:
    """Comparison key to the exact label the dataset uses."""
    return {station_key(label): label for label in all_labels()}


def canonical(label: str) -> str | None:
    return label_index().get(station_key(label))


def _is_mangled(label: str) -> bool:
    """C1 control characters. The dataset holds one such label, duplicating a listed station."""
    return any(0x80 <= ord(c) <= 0x9F for c in label)


def station_labels() -> list[str]:
    """Distinct labels for the autocomplete, ordered as French collation would."""
    return sorted((label for label in all_labels() if not _is_mangled(label)), key=collation_key)


def last_ingested() -> Date | None:
    # Read from the stations, not the offers: same day, without an unindexed scan of the history.
    return Station.objects.aggregate(last=Max("last_seen"))["last"]


def bookable_window() -> tuple[Date, Date] | None:
    """The days the stored data actually covers."""
    span = Offer.objects.filter(bookable=True).aggregate(first=Min("date"), last=Max("date"))
    if span["first"] is None:
        return None
    return span["first"], span["last"]
