# Two tables keyed by normalised label, generated offline by `scripts/build-*.py`.

import json
import logging
from functools import cache
from pathlib import Path

from django.conf import settings

from .normalize import clean_string

logger = logging.getLogger(__name__)


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.exception("table de référence illisible : %s", path)
        return {}


@cache
def _popularity() -> dict[str, int]:
    return _load(Path(settings.REFERENCE_DATA_DIR) / "popularity.json")


@cache
def _booking() -> dict[str, dict]:
    return _load(Path(settings.BOOKING_DATA_DIR) / "booking.json")


def popularity(label: str) -> int | None:
    """Tourist notoriety: how many Wikipedia language editions the city has."""
    return _popularity().get(clean_string(label))


def booking_slug(label: str) -> str | None:
    """City slug the booking sites use: `marseille-st-charles` 404s where `marseille` works."""
    entry = _booking().get(clean_string(label))
    return entry.get("slug") if entry else None
