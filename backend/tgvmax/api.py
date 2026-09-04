from datetime import date as Date
from hashlib import sha1
from typing import Annotated, Literal

from django.core.cache import cache
from django.db import connections
from django.http import HttpRequest
from ninja import NinjaAPI, Query, Schema
from ninja.errors import ValidationError
from pydantic import AfterValidator, Field

from . import multileg, routing, search, stats
from .catalog import bookable_window, canonical, last_ingested, station_labels
from .stations import is_station_label, lookup_coords, station_key

# The Swagger page pulls its assets from a CDN the site's CSP forbids; the schema stays served.
api = NinjaAPI(
    title="Trainquillou",
    version="1.0.0",
    description="Disponibilités TGVmax / MAX JEUNE. Lecture seule, sans clé, sans compte.",
    docs_url=None,
)


def _label(value: str) -> str:
    label = value.strip()
    if not is_station_label(label):
        raise ValueError("libellé de gare invalide")
    return label


StationLabel = Annotated[str, AfterValidator(_label)]

NEEDS_SECOND_DATE = ("range", "roundtrip")
MAX_STOPS_IN_CHAIN = 6


@api.exception_handler(ValidationError)
def on_invalid_parameters(request: HttpRequest, exc: ValidationError):
    """Refuse in French, naming the parameter at fault."""
    messages = []
    for error in exc.errors:
        location = error.get("loc") or ["?"]
        name = str(location[-1])
        if error.get("type") == "value_error":
            messages.append(f"{name} : {error.get('ctx', {}).get('error', 'valeur invalide')}")
        else:
            messages.append(f"paramètre invalide : {name}")
    return api.create_response(request, {"detail": " ; ".join(messages)}, status=400)


def _refuse(request: HttpRequest, message: str, status: int = 400, **extra):
    return api.create_response(request, {"detail": message, **extra}, status=status)


def _unknown(request: HttpRequest, *labels: str):
    return _refuse(
        request, "gares inconnues du jeu de données", unknown=[label for label in labels]
    )


class SearchParams(Schema):
    origin: StationLabel
    date: Date
    mode: Literal["from", "to", "range", "roundtrip"] = "from"
    dateTo: Date | None = None  # noqa: N815 — the query parameter is named that way


class ReturnsParams(Schema):
    origin: StationLabel
    dest: StationLabel
    since: Date = Field(alias="from")


class RouteParams(Schema):
    origin: StationLabel = Field(alias="from")
    destination: StationLabel = Field(alias="to")
    date: Date
    stops: int = 2


class MultilegParams(Schema):
    stops: str
    date: Date
    dateTo: Date | None = None  # noqa: N815
    minStay: int = Field(0, ge=0, le=72)  # noqa: N815

    @property
    def labels(self) -> list[str]:
        return [part.strip() for part in self.stops.split("|") if part.strip()]


@api.get("/health")
def health(request: HttpRequest):
    """Liveness for the container healthcheck; touches the database on purpose."""
    try:
        connections["default"].ensure_connection()
    except Exception:
        return _refuse(request, "database unavailable", status=503)
    return {"status": "ok"}


@api.get("/stations")
def stations(request: HttpRequest):
    """Distinct station labels, for the autocomplete."""
    return station_labels()


@api.get("/updated")
def updated(request: HttpRequest):
    """Day the stored data was last refreshed, and the headline eligibility share."""
    day = cache.get_or_set("updated:day", last_ingested, 600)
    share = cache.get_or_set("updated:share", stats.eligible_share, 600)
    return {"updatedOn": day.isoformat() if day else None, "eligibleShare": share}


@api.get("/stats")
def statistics(request: HttpRequest, origin: str | None = None):
    """What the stored offers say about the current window, narrowed to `origin` if given."""
    label = None
    if origin is not None:
        label = canonical(origin)
        if label is None:
            return _unknown(request, origin)

    # Digested: a station label carries spaces and parentheses, which a memcached key refuses.
    scope = sha1(label.encode(), usedforsecurity=False).hexdigest()[:16] if label else "all"
    snapshot = cache.get_or_set(f"stats:snapshot:{scope}", lambda: stats.snapshot(label), 600)
    if snapshot is None:
        return _refuse(request, "aucune donnée disponible pour le moment", status=503)
    return snapshot


@api.get("/search")
def search_destinations(request: HttpRequest, params: Query[SearchParams]):
    window = bookable_window()
    if window is None:
        return _refuse(request, "aucune donnée disponible pour le moment", status=503)
    first, last = window

    if params.mode in NEEDS_SECOND_DATE and params.dateTo is None:
        return _refuse(request, f"dateTo est requis en mode {params.mode}")
    if params.mode == "roundtrip" and params.dateTo < params.date:
        return _refuse(request, "la date de retour ne peut pas précéder l'aller")
    if params.date > last:
        return _refuse(
            request, f"date au-delà de l'horizon réservable (dernier jour : {last.isoformat()})"
        )

    origin = canonical(params.origin)
    if origin is None:
        return _unknown(request, params.origin)

    # Clamped to the stored window: the client displays the range actually explored.
    date_to = min(max(params.dateTo, first), last) if params.dateTo else None
    return search.search(origin, params.date, params.mode, date_to)


@api.get("/returns")
def return_dates(request: HttpRequest, params: Query[ReturnsParams]):
    origin = canonical(params.origin)
    destination = canonical(params.dest)
    if origin is None or destination is None:
        return _unknown(
            request,
            *[
                label
                for label, resolved in ((params.origin, origin), (params.dest, destination))
                if resolved is None
            ],
        )
    return {
        "origin": origin,
        "destination": destination,
        "dates": search.return_dates(origin, destination, params.since),
    }


@api.get("/route")
def itineraries(request: HttpRequest, params: Query[RouteParams]):
    window = bookable_window()
    if window is None:
        return _refuse(request, "aucune donnée disponible pour le moment", status=503)
    _, last = window

    if station_key(params.origin) == station_key(params.destination):
        return _refuse(request, "le départ et l'arrivée doivent différer")
    if params.date > last:
        return _refuse(
            request, f"date au-delà de l'horizon réservable (dernier jour : {last.isoformat()})"
        )

    origin = canonical(params.origin)
    destination = canonical(params.destination)
    if origin is None or destination is None:
        return _unknown(
            request,
            *[
                label
                for label, resolved in (
                    (params.origin, origin),
                    (params.destination, destination),
                )
                if resolved is None
            ],
        )

    max_stops = max(0, min(routing.MAX_STOPS, params.stops))
    found = routing.find_itineraries(origin, destination, params.date, max_stops)
    for itinerary in found:
        for leg in itinerary["legs"]:
            leg["fromCoords"] = lookup_coords(leg["from"])
            leg["toCoords"] = lookup_coords(leg["to"])

    return {
        "from": {"label": origin, "coords": lookup_coords(origin)},
        "to": {"label": destination, "coords": lookup_coords(destination)},
        "date": params.date.isoformat(),
        "maxStops": max_stops,
        "itineraries": found,
        "alsoAvailable": routing.feasible_next_days(origin, destination, params.date),
        # Kept for the client, always false: nothing bounds the exploration any more.
        "truncated": False,
    }


@api.get("/multileg")
def multileg_plan(request: HttpRequest, params: Query[MultilegParams]):
    """A → B → C, loops and day trips over the bookable window."""
    labels = params.labels
    if len(labels) < 2:
        return _refuse(request, "il faut au moins deux gares, séparées par « | »")
    if len(labels) > MAX_STOPS_IN_CHAIN:
        return _refuse(request, f"{MAX_STOPS_IN_CHAIN} gares au maximum")
    for label in labels:
        if not is_station_label(label):
            return _refuse(request, f"libellé de gare invalide : {label}")
    for current, following in zip(labels, labels[1:], strict=False):
        if current == following:
            return _refuse(request, f"deux arrêts identiques d'affilée : {current}")
    if params.dateTo and params.dateTo < params.date:
        return _refuse(request, "dateTo ne peut pas précéder date")

    window = bookable_window()
    if window is None:
        return _refuse(request, "aucune donnée disponible pour le moment", status=503)
    first, last = window

    stops, unknown = multileg.resolve_stops(labels)
    if unknown:
        return _unknown(request, *unknown)
    if params.date > last:
        return _refuse(
            request, f"date au-delà de l'horizon réservable (dernier jour : {last.isoformat()})"
        )

    start = max(params.date, first)
    end = max(min(params.dateTo or last, last), start)
    return multileg.plan(stops, (start, end), params.minStay)
