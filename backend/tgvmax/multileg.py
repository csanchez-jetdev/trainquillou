# ponytail: direct hops only. A hop with no direct train is reported as such rather than
# expanded into connections; add a per-hop lookup here if that turns out too strict.

from dataclasses import dataclass
from datetime import date as Date
from datetime import datetime, time, timedelta

from .catalog import label_index
from .models import Offer
from .stations import lookup_coords, station_key

FULL_DAY = timedelta(days=1)


@dataclass(frozen=True)
class Hop:
    origin: str
    destination: str
    date: Date
    departure: time
    arrival: time
    train_no: str

    @property
    def departs_at(self) -> datetime:
        return datetime.combine(self.date, self.departure)

    @property
    def arrives_at(self) -> datetime:
        """Arrival earlier than departure means the train runs past midnight."""
        arrival = datetime.combine(self.date, self.arrival)
        return arrival + FULL_DAY if self.arrival < self.departure else arrival

    def as_dict(self) -> dict:
        return {
            "from": self.origin,
            "to": self.destination,
            "date": self.date.isoformat(),
            "departure": self.departure.strftime("%H:%M"),
            "arrival": self.arrival.strftime("%H:%M"),
            "trainNumber": self.train_no or None,
        }


def resolve_stops(requested: list[str]) -> tuple[list[str], list[str]]:
    """Canonical labels for the requested stops, and those the dataset never names."""
    # Every stored label, not only the bookable ones: a station full today is not unknown.
    known = label_index()
    resolved: list[str] = []
    unknown: list[str] = []
    for label in requested:
        canonical = known.get(station_key(label))
        if canonical is None:
            unknown.append(label)
        else:
            resolved.append(canonical)
    return resolved, unknown


def hop_options(origin: str, destination: str, window: tuple[Date, Date]) -> list[Hop]:
    rows = Offer.objects.filter(
        origin=origin, destination=destination, date__range=window, bookable=True
    ).order_by("date", "departure")
    return [
        Hop(
            origin=row.origin,
            destination=row.destination,
            date=row.date,
            departure=row.departure,
            arrival=row.arrival,
            train_no=row.train_no,
        )
        for row in rows
    ]


def plan(stops: list[str], window: tuple[Date, Date], min_stay_hours: int = 0) -> dict:
    """Per-hop availability, plus the itinerary that arrives soonest."""
    # Earliest arrival at every step is optimal: arriving sooner only widens the departures
    # left for the next hop.
    stay = timedelta(hours=min_stay_hours)
    legs: list[dict] = []
    itinerary: list[Hop] = []
    not_before: datetime | None = None
    blocked_at: int | None = None

    for index, (origin, destination) in enumerate(zip(stops, stops[1:], strict=False)):
        options = hop_options(origin, destination, window)
        legs.append(
            {
                "from": origin,
                "to": destination,
                "days": sorted({hop.date.isoformat() for hop in options}),
                "options": len(options),
            }
        )

        if blocked_at is not None:
            continue

        reachable = [hop for hop in options if not_before is None or hop.departs_at >= not_before]
        if not reachable:
            blocked_at = index
            continue

        chosen = min(reachable, key=lambda hop: hop.arrives_at)
        itinerary.append(chosen)
        not_before = chosen.arrives_at + stay

    return {
        "stops": [{"label": label, "coords": lookup_coords(label)} for label in stops],
        "window": {"from": window[0].isoformat(), "to": window[1].isoformat()},
        "minStayHours": min_stay_hours,
        "directOnly": True,
        "legs": legs,
        "itinerary": [hop.as_dict() for hop in itinerary] if blocked_at is None else None,
        "blockedAt": blocked_at,
    }
