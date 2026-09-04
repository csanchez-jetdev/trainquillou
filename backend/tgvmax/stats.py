from datetime import date as Date

from django.db.models import Count, F, Max, Min, Q, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay

from .catalog import station_labels
from .models import AvailabilityChange, AxisStation, Coverage, Ingestion, Offer
from .stations import lookup_coords

TOP_STATIONS = 10

# Busiest links drawn on the map. Beyond this the country turns into a hairball.
MAPPED_LINKS = 400

# Upper bound of each band, in minutes. Must match the client's `DURATION_BANDS` scale.
DURATION_BANDS = ((90, "t1"), (180, "t2"), (270, "t3"), (None, "t4"))

# The dataset's `axe` values are inconsistently cased and separated (`SUD EST`,
# `OUIGO_sud-est`, `IC ARO`); an unknown one falls back to its raw form.
AXIS_LABELS = {
    "ATLANTIQUE": "Atlantique",
    "AUTOCAR SNCF": "Autocar SNCF",
    "EST": "Est",
    "IC ARO": "Intercités ARO",
    "IC NUIT": "Intercités de nuit",
    "IC SRO": "Intercités SRO",
    "INTERNATIONAL": "International",
    "NORD": "Nord",
    "OUIGO_TC": "Ouigo classique",
    "OUIGO_atlantique": "Ouigo Atlantique",
    "OUIGO_est": "Ouigo Est",
    "OUIGO_nord": "Ouigo Nord",
    "OUIGO_sud-est": "Ouigo Sud-Est",
    "SUD EST": "Sud-Est",
}


def axis_label(raw: str) -> str:
    return AXIS_LABELS.get(raw, raw)


def bookable(origin: str | None = None):
    """The legs every figure on the page is counted from."""
    legs = Offer.objects.filter(bookable=True)
    return legs.filter(origin=origin) if origin else legs


def served_stations(origin: str | None = None) -> int:
    """How many stations have a bookable leg at either end — fewer than the dataset names."""
    legs = bookable(origin)
    if origin:
        return legs.exclude(destination=origin).values("destination").distinct().count()
    ends = set(legs.values_list("origin", flat=True).distinct())
    ends |= set(legs.values_list("destination", flat=True).distinct())
    return len(ends)


def durations(origin: str | None = None) -> list[dict[str, int | str]]:
    """Bookable legs per duration band."""
    # Subtracted in Python: an arrival earlier than its departure wraps past midnight, which
    # the ORM cannot express cheaply.
    counts = dict.fromkeys((band for _, band in DURATION_BANDS), 0)
    for departure, arrival in bookable(origin).values_list("departure", "arrival"):
        minutes = (arrival.hour * 60 + arrival.minute) - (departure.hour * 60 + departure.minute)
        if minutes <= 0:
            minutes += 24 * 60
        for ceiling, band in DURATION_BANDS:
            if ceiling is None or minutes <= ceiling:
                counts[band] += 1
                break
    return [
        {"band": band, "max": ceiling or 0, "offers": counts[band]}
        for ceiling, band in DURATION_BANDS
    ]


def _rounded(coords: tuple[float, float]) -> list[float]:
    """Four decimals, about 10 m: the payload carries 600 pairs and a map needs no more."""
    return [round(value, 4) for value in coords]


def network(origin: str | None = None) -> dict[str, object]:
    """Stations and links to draw, both ends resolved to coordinates."""
    # Links are undirected: kept apart, Paris–Lyon and Lyon–Paris draw twice at half weight.
    legs = bookable(origin).exclude(origin=F("destination"))

    undirected: dict[tuple[str, str], int] = {}
    for row in legs.values("origin", "destination").annotate(offers=Count("id")):
        ends = (row["origin"], row["destination"])
        key = (min(ends), max(ends))
        undirected[key] = undirected.get(key, 0) + row["offers"]

    ranked = sorted(undirected.items(), key=lambda item: (-item[1], item[0]))
    links = []
    for (start, end), offers in ranked[:MAPPED_LINKS]:
        from_coords, to_coords = lookup_coords(start), lookup_coords(end)
        if from_coords is None or to_coords is None:
            continue
        links.append(
            {
                "from": start,
                "to": end,
                "fromCoords": _rounded(from_coords),
                "toCoords": _rounded(to_coords),
                "offers": offers,
            }
        )

    # Departure stations on the whole network, reached ones when scoped to one.
    end = "destination" if origin else "origin"

    # Empty until a second ingestion has something to compare against.
    flips = AvailabilityChange.objects.filter(bookable=False)
    if origin:
        flips = flips.filter(offer__origin=origin)
    lost = dict(flips.values_list(f"offer__{end}").annotate(flips=Count("id")))

    stations = []
    for row in legs.values(end).annotate(offers=Count("id")).order_by("-offers"):
        coords = lookup_coords(row[end])
        if coords is None:
            continue
        stations.append(
            {
                "label": row[end],
                "coords": _rounded(coords),
                "offers": row["offers"],
                "soldOut": lost.get(row[end], 0),
            }
        )

    return {"stations": stations, "links": links, "linkCount": len(undirected)}


def axis_footprints() -> dict[str, list[list[float]]]:
    """Where each axis leaves from, as coordinates. Unresolved labels are simply not drawn."""
    footprints: dict[str, list[list[float]]] = {}
    for axis, label in AxisStation.objects.values_list("axis", "label"):
        coords = lookup_coords(label)
        if coords is not None:
            footprints.setdefault(axis, []).append(_rounded(coords))
    return footprints


def eligible_share() -> float | None:
    """What share of the published offer is eligible. `None` while the aggregate is missing."""
    totals = Coverage.objects.aggregate(total=Sum("total"), eligible=Sum("eligible"))
    if not totals["total"]:
        return None
    return round(totals["eligible"] / totals["total"], 4)


def coverage(updated_on: Date) -> dict[str, object] | None:
    """What share of the published offer is TGVmax-eligible, per day and per axis."""
    # `None` when the aggregate is older than the offers: a share read on one window and dated
    # by another is a mix, not a figure.
    rows = list(Coverage.objects.values("date", "axis", "total", "eligible"))
    if not rows:
        return None
    observed_on = Coverage.objects.aggregate(last=Max("observed_on"))["last"]
    if observed_on is None or observed_on < updated_on:
        return None

    by_axis: dict[str, list[int]] = {}
    by_day: dict[Date, list[int]] = {}
    for row in rows:
        for bucket, key in ((by_axis, row["axis"]), (by_day, row["date"])):
            entry = bucket.setdefault(key, [0, 0])
            entry[0] += row["total"]
            entry[1] += row["eligible"]

    footprints = axis_footprints()

    # Axes with no eligible seat are what TGVmax does not cover: Ouigo, IC SRO, the coaches.
    eligible_axes = [
        {
            "label": axis_label(axis),
            "total": total,
            "eligible": eligible,
            "stations": footprints.get(axis, []),
        }
        for axis, (total, eligible) in by_axis.items()
        if eligible
    ]
    excluded = [
        {"label": axis_label(axis), "total": total}
        for axis, (total, eligible) in by_axis.items()
        if not eligible
    ]

    return {
        "observedOn": observed_on.isoformat(),
        "total": sum(total for total, _ in by_axis.values()),
        "eligible": sum(eligible for _, eligible in by_axis.values()),
        "axes": sorted(eligible_axes, key=lambda a: -a["eligible"] / a["total"]),
        "excluded": sorted(excluded, key=lambda a: -a["total"]),
        "daily": [
            {"date": day.isoformat(), "total": total, "eligible": eligible}
            for day, (total, eligible) in sorted(by_day.items())
        ],
    }


def weekly_grid(origin: str | None = None) -> list[dict[str, int]]:
    """Bookable legs per weekday and departure hour. Empty cells are left out."""
    # `days` travels with each cell: a 30-day window holds four of some weekdays and five of
    # others, so only an average per day compares.
    legs = bookable(origin)
    days: dict[int, int] = {}
    for row in (
        legs.annotate(weekday=ExtractIsoWeekDay("date"))
        .values("weekday")
        .annotate(days=Count("date", distinct=True))
    ):
        days[row["weekday"]] = row["days"]

    return [
        {
            "weekday": row["weekday"],
            "hour": row["hour"],
            "offers": row["offers"],
            "days": days.get(row["weekday"], 0),
        }
        for row in legs.annotate(weekday=ExtractIsoWeekDay("date"), hour=ExtractHour("departure"))
        .values("weekday", "hour")
        .annotate(offers=Count("id"))
        .order_by("weekday", "hour")
    ]


def runs() -> list[dict[str, int | str]]:
    """What each recorded ingestion moved, oldest first."""
    return [
        {
            "date": run["observed_on"].isoformat(),
            "observed": run["observed"],
            "created": run["created"],
            "reappeared": run["reappeared"],
            "vanished": run["vanished"],
        }
        for run in Ingestion.objects.values(
            "observed_on", "observed", "created", "reappeared", "vanished"
        )
    ]


def lead_times(origin: str | None = None) -> list[dict[str, int]]:
    """How many days before departure the offers that stopped being bookable did so."""
    counts: dict[int, int] = {}
    flips = AvailabilityChange.objects.filter(bookable=False)
    if origin:
        flips = flips.filter(offer__origin=origin)
    for row in flips.values("offer__date", "seen_on").annotate(flips=Count("id")):
        days = (row["offer__date"] - row["seen_on"]).days
        if days < 0:
            continue
        counts[days] = counts.get(days, 0) + row["flips"]
    return [{"days": days, "soldOut": counts[days]} for days in sorted(counts)]


def snapshot(origin: str | None = None) -> dict | None:
    """Every number the page shows, or None while the scope holds no offer."""
    legs = bookable(origin)
    window = legs.aggregate(first=Min("date"), last=Max("date"))
    if window["first"] is None:
        return None

    # Over the whole table, not the window: this dates the first ingestion ever.
    watched = Offer.objects.aggregate(since=Min("first_seen"), until=Max("last_seen"))
    flips = (
        AvailabilityChange.objects.filter(offer__origin=origin)
        if origin
        else (AvailabilityChange.objects.all())
    )
    changes = flips.aggregate(
        sold_out=Count("id", filter=Q(bookable=False)),
        reopened=Count("id", filter=Q(bookable=True)),
    )

    # Some rows leave and reach the same label: real trains, never a destination.
    routes = legs.exclude(origin=F("destination"))
    graph = network(origin)

    return {
        "origin": origin,
        "updatedOn": watched["until"].isoformat(),
        "window": {"first": window["first"].isoformat(), "last": window["last"].isoformat()},
        "offers": legs.count(),
        "routes": graph["linkCount"],
        # The autocomplete's list: it drops the mis-encoded label duplicating a counted station.
        "stations": {"served": served_stations(origin), "known": len(station_labels())},
        "daily": [
            {"date": row["date"].isoformat(), "offers": row["offers"]}
            for row in legs.values("date").annotate(offers=Count("id")).order_by("date")
        ],
        "hourly": [
            {"hour": row["hour"], "offers": row["offers"]}
            for row in legs.annotate(hour=ExtractHour("departure"))
            .values("hour")
            .annotate(offers=Count("id"))
            .order_by("hour")
        ],
        # Days per weekday alongside the count: a 30-day window holds four of some and five
        # of others, so only the average per day compares.
        "weekdays": [
            {"weekday": row["weekday"], "offers": row["offers"], "days": row["days"]}
            for row in legs.annotate(weekday=ExtractIsoWeekDay("date"))
            .values("weekday")
            .annotate(offers=Count("id"), days=Count("date", distinct=True))
            .order_by("weekday")
        ],
        "weeklyGrid": weekly_grid(origin),
        "durations": durations(origin),
        # Empty when scoped: a station at the top of a list of itself says nothing.
        "topOrigins": (
            []
            if origin
            else [
                {"label": row["origin"], "offers": row["offers"], "destinations": row["reaches"]}
                for row in routes.values("origin")
                .annotate(offers=Count("id"), reaches=Count("destination", distinct=True))
                .order_by("-offers", "origin")[:TOP_STATIONS]
            ]
        ),
        "topDestinations": [
            {"label": row["destination"], "offers": row["offers"], "origins": row["reaches"]}
            for row in routes.values("destination")
            .annotate(offers=Count("id"), reaches=Count("origin", distinct=True))
            .order_by("-offers", "destination")[:TOP_STATIONS]
        ],
        "network": {
            "stations": graph["stations"],
            "links": graph["links"],
            "linkCount": graph["linkCount"],
        },
        "coverage": None if origin else coverage(watched["until"]),
        # `since` dates the first offer stored; `runs` starts at the first ingestion recorded,
        # a later day on an instance older than that table.
        "history": {
            "since": watched["since"].isoformat(),
            "soldOut": changes["sold_out"],
            "reopened": changes["reopened"],
            "runs": runs(),
            "leadTimes": lead_times(origin),
        },
    }
