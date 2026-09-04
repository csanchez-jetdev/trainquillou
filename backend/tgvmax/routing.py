from dataclasses import dataclass, field
from datetime import date as Date
from datetime import time

from .models import Offer
from .normalize import clean_string, same_station

MINUTES_PER_DAY = 1440

# TGVmax bookings are independent of each other, so nothing protects a connection.
MIN_TRANSFER = 10

# Cities the dataset names as one label while they hold several stations.
# ponytail: worst case per city, since the label never says which station the train uses —
# a Nord → Nord connection pays the cross-Paris margin too. Refine when the dataset does.
CITY_TRANSFER = {"PARIS (intramuros)": 45, "LYON (intramuros)": 30, "LILLE (intramuros)": 20}

MAX_STOPS = 3
FRONTIER_CAP = 12
MAX_ITINERARIES = 40
SUGGESTED_DAYS = 3


@dataclass(frozen=True)
class Leg:
    origin: str
    destination: str
    departure: str
    arrival: str
    train_no: str | None
    dep_min: int
    arr_min: int


@dataclass
class PartialPath:
    node: str
    arr_min: int
    legs: list[Leg]
    visited: set[str] = field(default_factory=set)


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _leg(offer: Offer) -> Leg:
    dep = _minutes(offer.departure)
    arr = _minutes(offer.arrival)
    if arr < dep:
        arr += MINUTES_PER_DAY  # arrival past midnight
    return Leg(
        origin=offer.origin,
        destination=offer.destination,
        departure=offer.departure.strftime("%H:%M"),
        arrival=offer.arrival.strftime("%H:%M"),
        train_no=offer.train_no or None,
        dep_min=dep,
        arr_min=arr,
    )


def transfer_margin(station: str) -> int:
    """Minutes to allow for a connection at `station`."""
    return CITY_TRANSFER.get(station, MIN_TRANSFER)


def connects(prev_arr_min: int, leg: Leg) -> bool:
    """Valid connection: departure far enough after arrival, on the same day."""
    return prev_arr_min < MINUTES_PER_DAY and leg.dep_min >= prev_arr_min + transfer_margin(
        leg.origin
    )


def day_legs(date: Date) -> list[Leg]:
    """Every bookable leg of one day."""
    # Total order: an unspecified one hands two equally fast itineraries a different winner
    # between two identical requests.
    return [
        _leg(offer)
        for offer in Offer.objects.filter(date=date, bookable=True).order_by(
            "departure", "arrival", "train_no"
        )
    ]


def _index_by_origin(legs: list[Leg]) -> dict[str, list[Leg]]:
    index: dict[str, list[Leg]] = {}
    for leg in legs:
        index.setdefault(leg.origin, []).append(leg)
    return index


def find_itineraries(origin: str, destination: str, date: Date, max_stops: int) -> list[dict]:
    """A → B on `date`, with at most `max_stops` intermediate stations."""
    stops = max(0, min(MAX_STOPS, max_stops))
    legs = day_legs(date)
    by_origin = _index_by_origin(legs)

    completed: list[list[Leg]] = []
    from_legs = by_origin.get(origin, [])

    for leg in from_legs:
        if same_station(leg.destination, destination):
            completed.append([leg])

    if stops >= 1:
        # Index of Y → B legs by Y, so the last hop resolves without exploring further.
        inbound_by_node: dict[str, list[Leg]] = {}
        for leg in legs:
            if leg.destination == destination:
                inbound_by_node.setdefault(clean_string(leg.origin), []).append(leg)

        def close_towards_b(path: list[Leg], node: str, arr_min: int) -> None:
            for last in inbound_by_node.get(clean_string(node), []):
                if connects(arr_min, last):
                    completed.append([*path, last])

        frontier = [
            PartialPath(
                node=leg.destination,
                arr_min=leg.arr_min,
                legs=[leg],
                visited={clean_string(origin), clean_string(leg.destination)},
            )
            for leg in from_legs
            if not same_station(leg.destination, destination)
            and not same_station(leg.destination, origin)
        ]

        for state in frontier:
            close_towards_b(state.legs, state.node, state.arr_min)

        for _ in range(1, stops):
            following: list[PartialPath] = []
            for state in frontier:
                for leg in by_origin.get(state.node, []):
                    if not connects(state.arr_min, leg):
                        continue
                    node_key = clean_string(leg.destination)
                    if node_key in state.visited:
                        continue
                    path = [*state.legs, leg]
                    if same_station(leg.destination, destination):
                        completed.append(path)
                        continue
                    close_towards_b(path, leg.destination, leg.arr_min)
                    following.append(
                        PartialPath(
                            node=leg.destination,
                            arr_min=leg.arr_min,
                            legs=path,
                            visited={*state.visited, node_key},
                        )
                    )
            # Dominance pruning: earliest arrival per station, then cap the frontier.
            best_by_node: dict[str, PartialPath] = {}
            for state in following:
                key = clean_string(state.node)
                known = best_by_node.get(key)
                if known is None or state.arr_min < known.arr_min:
                    best_by_node[key] = state
            frontier = sorted(best_by_node.values(), key=lambda s: s.arr_min)[:FRONTIER_CAP]

    # Keyed on the departure and not the stations: the latter collapsed a whole day of trains
    # into a single "via Paris" and hid every afternoon departure.
    best_by_departure: dict[str, dict] = {}
    for path in completed:
        duration = path[-1].arr_min - path[0].dep_min
        itinerary = {
            "legs": [
                {
                    "from": leg.origin,
                    "to": leg.destination,
                    "fromCoords": None,
                    "toCoords": None,
                    "departure": leg.departure,
                    "arrival": leg.arrival,
                    "trainNumber": leg.train_no,
                }
                for leg in path
            ],
            "stops": len(path) - 1,
            "departure": path[0].departure,
            "arrival": path[-1].arrival,
            "durationMin": duration,
        }
        previous = best_by_departure.get(path[0].departure)
        if previous is None or duration < previous["durationMin"]:
            best_by_departure[path[0].departure] = itinerary

    return sorted(best_by_departure.values(), key=lambda i: i["departure"])[:MAX_ITINERARIES]


def feasible_next_days(
    origin: str, destination: str, base_date: Date, limit: int = SUGGESTED_DAYS
) -> list[str]:
    """The earliest `limit` days after `base_date` offering an A → B trip in one connection."""
    # Departures of the second leg, per day and connecting station.
    onward: dict[tuple[Date, str], list[int]] = {}
    inbound = Offer.objects.filter(bookable=True, destination=destination, date__gt=base_date)
    for day, node, departure in inbound.values_list("date", "origin", "departure"):
        onward.setdefault((day, clean_string(node)), []).append(_minutes(departure))

    days: set[Date] = set()
    outbound = Offer.objects.filter(bookable=True, origin=origin, date__gt=base_date)
    for day, node, dep, arr in outbound.values_list("date", "destination", "departure", "arrival"):
        if day in days:
            continue
        if same_station(node, destination):
            days.add(day)
            continue
        arr_min = _minutes(arr)
        # An arrival past midnight closes the day: `connects` refuses it too.
        if arr_min < _minutes(dep):
            continue
        margin = arr_min + transfer_margin(node)
        if any(d >= margin for d in onward.get((day, clean_string(node)), ())):
            days.add(day)

    return sorted(day.isoformat() for day in days)[:limit]
