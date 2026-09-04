import logging

import requests

logger = logging.getLogger(__name__)

BASE = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"

# The export endpoint, not `records`: same `where` and `select`, no offset ceiling. `records`
# refuses an offset past 10 000 and would need a hundred pages.
EXPORT_URL = f"{BASE}/exports/json"

# Only reservable MAX JEUNE seats; without it the dataset is twelve times bigger.
WHERE_BOOKABLE = 'od_happy_card="OUI"'

FIELDS = ("date", "train_no", "origine", "destination", "heure_depart", "heure_arrivee")

# Connect, then read: the read budget is what keeps a stalled upstream off the worker.
TIMEOUT = (10, 120)


def fetch_station_labels() -> list[str]:
    """Every station label in the dataset, bookable or not."""
    # `group_by` and never the `facets` endpoint: facets silently caps at 100 values and hid
    # 238 stations, Amiens and Angoulême among them.
    labels: set[str] = set()
    for field in ("origine", "destination"):
        response = requests.get(
            f"{BASE}/records",
            params={"select": field, "group_by": field, "limit": -1},
            timeout=TIMEOUT,
            headers={"accept": "application/json"},
        )
        response.raise_for_status()
        for row in response.json().get("results") or []:
            value = row.get(field)
            if value:
                labels.add(value)
    logger.info("libellés de gares : %d", len(labels))
    return sorted(labels)


def fetch_coverage() -> list[dict[str, str | int]]:
    """Row counts per day, axis and eligibility flag — the denominator the export cannot give."""
    response = requests.get(
        f"{BASE}/records",
        params={
            "select": "count(*) as rows",
            "group_by": "date,axe,od_happy_card",
            "limit": -1,
        },
        timeout=TIMEOUT,
        headers={"accept": "application/json"},
    )
    response.raise_for_status()
    rows = response.json().get("results") or []
    logger.info("couverture SNCF: %d agrégats", len(rows))
    return rows


def fetch_axis_stations() -> list[dict[str, str | int]]:
    """Which stations each commercial axis leaves from; the export carries no `axe` column."""
    response = requests.get(
        f"{BASE}/records",
        params={"select": "count(*) as rows", "group_by": "axe,origine", "limit": -1},
        timeout=TIMEOUT,
        headers={"accept": "application/json"},
    )
    response.raise_for_status()
    rows = response.json().get("results") or []
    logger.info("gares par axe : %d couples", len(rows))
    return rows


def fetch_bookable_offers() -> list[dict[str, str]]:
    """Every bookable leg of the current 30-day window, one HTTP call."""
    response = requests.get(
        EXPORT_URL,
        params={"where": WHERE_BOOKABLE, "select": ",".join(FIELDS)},
        timeout=TIMEOUT,
        headers={"accept": "application/json"},
    )
    response.raise_for_status()
    rows = response.json()
    logger.info("export SNCF: %d lignes", len(rows))
    return rows
