# A destination with no known slug or popularity omits the key entirely: the client reads
# the absence, not a null.

from datetime import date as Date
from datetime import time

from .lookups import booking_slug, popularity
from .models import Offer
from .normalize import clean_string, collation_key
from .stations import lookup_coords, station_key

MODES = ("from", "to", "range", "roundtrip")
NEEDS_SECOND_DATE = ("range", "roundtrip")


def hhmm(value: time) -> str:
    return value.strftime("%H:%M")


def _train(offer: Offer) -> dict:
    return {
        "departure": hhmm(offer.departure),
        "arrival": hhmm(offer.arrival),
        "trainNumber": offer.train_no or None,
    }


def _chronological(train: dict) -> tuple:
    """Total order on a train, so equal departure times never shuffle between requests."""
    return (train["departure"], train["arrival"], train["trainNumber"] or "")


def _sorted_by_label(destinations: list[dict]) -> list[dict]:
    """Ordering that stands in for the JavaScript `localeCompare`."""
    return sorted(destinations, key=lambda d: collation_key(d["label"]))


def _group(offers: list[Offer], field: str) -> list[dict]:
    """Bookable trains grouped by the station at the other end of the leg."""
    trains_by_label: dict[str, list[dict]] = {}
    for offer in offers:
        trains_by_label.setdefault(getattr(offer, field), []).append(_train(offer))
    return _sorted_by_label(
        [
            {
                "label": label,
                "coords": None,
                "trains": sorted(trains, key=_chronological),
            }
            for label, trains in trains_by_label.items()
        ]
    )


def _group_by_date(offers: list[Offer]) -> list[dict]:
    """Destinations over a range, each carrying the days it can be reached on."""
    dates_by_label: dict[str, set[str]] = {}
    for offer in offers:
        dates_by_label.setdefault(offer.destination, set()).add(offer.date.isoformat())
    destinations = [
        {
            "label": label,
            "coords": None,
            "trains": [],
            "availableDates": sorted(dates),
        }
        for label, dates in dates_by_label.items()
    ]
    # Most robust first: reachable on the largest number of days.
    return sorted(
        destinations,
        key=lambda d: (-len(d["availableDates"]), collation_key(d["label"])),
    )


def _group_round_trip(outbound: list[Offer], inbound: list[Offer]) -> list[dict]:
    """Destinations whose outbound and return legs are both bookable."""
    # Keyed on the normalised label: the two directions do not always spell a station alike.
    out_by_key: dict[str, list[dict]] = {}
    label_by_key: dict[str, str] = {}
    for offer in outbound:
        key = clean_string(offer.destination)
        if not key:
            continue
        label_by_key[key] = offer.destination
        out_by_key.setdefault(key, []).append(_train(offer))

    back_by_key: dict[str, list[dict]] = {}
    for offer in inbound:
        key = clean_string(offer.origin)
        if not key or key not in out_by_key:
            continue
        back_by_key.setdefault(key, []).append(_train(offer))

    by_departure = lambda trains: sorted(trains, key=_chronological)  # noqa: E731
    return _sorted_by_label(
        [
            {
                "label": label_by_key[key],
                "coords": None,
                "trains": by_departure(out_by_key[key]),
                "returnTrains": by_departure(returns),
            }
            for key, returns in back_by_key.items()
        ]
    )


def _bookable(**filters) -> list[Offer]:
    # Total order: on departure alone, two trains leaving the same minute come back in the
    # order the storage engine feels like, and the response differs between identical requests.
    return list(
        Offer.objects.filter(bookable=True, **filters).order_by(
            "date", "departure", "arrival", "train_no"
        )
    )


def _enrich(destination: dict) -> dict:
    """Coordinates, notoriety and booking slug — keys absent when there is nothing to say."""
    label = destination["label"]
    enriched = {**destination, "coords": lookup_coords(label)}
    score = popularity(label)
    if score is not None:
        enriched["popularity"] = score
    slug = booking_slug(label)
    if slug is not None:
        enriched["slug"] = slug
    return enriched


def search(origin: str, date: Date, mode: str, date_to: Date | None) -> dict:
    if mode == "to":
        destinations = _group(_bookable(destination=origin, date=date), "origin")
    elif mode == "range":
        destinations = _group_by_date(_bookable(origin=origin, date__range=(date, date_to)))
    elif mode == "roundtrip":
        destinations = _group_round_trip(
            _bookable(origin=origin, date=date),
            _bookable(destination=origin, date=date_to),
        )
    else:
        destinations = _group(_bookable(origin=origin, date=date), "destination")

    # The dataset links a city to itself when it holds several stations: Part-Dieu → Perrache
    # both carry "LYON (intramuros)". A real train, not a destination.
    hub = station_key(origin)
    destinations = [d for d in destinations if station_key(d["label"]) != hub]

    result = {
        "origin": {"label": origin, "coords": lookup_coords(origin)},
        "date": date.isoformat(),
    }
    slug = booking_slug(origin)
    if slug is not None:
        result["origin"]["slug"] = slug
    if mode in NEEDS_SECOND_DATE:
        # The clamped date: the client displays the range actually explored.
        result["dateTo"] = date_to.isoformat() if date_to else None
    result["mode"] = mode
    result["destinations"] = [_enrich(d) for d in destinations]
    return result


def return_dates(origin: str, destination: str, since: Date) -> list[str]:
    """Days the return leg is bookable, from `since` onwards."""
    dates = (
        Offer.objects.filter(bookable=True, origin=origin, destination=destination, date__gte=since)
        .values_list("date", flat=True)
        .distinct()
    )
    return sorted({d.isoformat() for d in dates})
