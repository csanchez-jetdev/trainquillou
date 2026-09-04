# Never match a label as a substring: "ur" is a syllable of "frankfurt", "rai" of
# "lorraine", "issy" of "roissy". An unresolved label yields None, never a wrong point, and
# a new SNCF label goes into LABEL_ALIASES or EXTRA_STATIONS rather than loosening this.

import json
import logging
from functools import cache
from pathlib import Path

from django.conf import settings

from .normalize import clean_string

logger = logging.getLogger(__name__)

Coords = tuple[float, float]  # (lat, lon)
CoordsIndex = dict[str, Coords]

# Tokens TGVmax adds and the reference ignores: "PARIS (intramuros)" names the city.
NOISE_TOKENS = frozenset({"intramuros"})

# The reference abbreviates what TGVmax spells out: "Angers-St-Laud" / "ANGERS SAINT LAUD".
ABBREVIATIONS = {"saint": "st", "sainte": "ste"}

# Below this length a word matches by accident.
MIN_MATCH_LEN = 3

# Stations `gares.json` misses. The reference knows only the Chessy in the Rhône, 358 km
# from Marne-la-Vallée, which put Disneyland next to Lyon.
EXTRA_STATIONS: dict[str, Coords] = {
    # France
    "marne la vallee chessy": (48.8699134, 2.7821727),
    "arcachon": (44.6589798, -1.1653219),
    "la teste": (44.6368737, -1.1431389),
    "lacanau ocean": (45.0014797, -1.1962844),
    "bourcefranc le chapus": (45.8469846, -1.1466191),
    "dolus d oleron": (45.9112189, -1.2619116),
    "marennes": (45.8224965, -1.112795),
    "st martin de re": (46.2016893, -1.3681861),
    "ste marie de re": (46.1491638, -1.3115373),
    "loix": (46.2240177, -1.4364756),
    "rivedoux plage": (46.1568361, -1.2748439),
    "les portes en re": (46.250833, -1.497222),
    "st pierre d oleron": (45.9437695, -1.3061227),
    "la noue": (48.742849, 3.6108789),
    "fresnes au mont": (48.89702, 5.44048),
    "pierrefitte sur aire": (48.9003286, 5.3299107),
    "souilly": (49.027658, 5.285761),
    "l hospitalet pres l and": (42.587865, 1.7980639),
    # Germany
    "frankfurt hbf": (50.107145, 8.663789),
    "frankfurt main hbf": (50.107145, 8.663789),
    "frankfurt am main hbf": (50.107145, 8.663789),
    "karlsruhe": (48.9931106, 8.4022064),
    "karlsruhe hbf": (48.9931106, 8.4022064),
    "mannheim": (49.4796632, 8.4698178),
    "mannheim hbf": (49.4796632, 8.4698178),
    "freiburg": (47.9977919, 7.8426094),
    "freiburg breisgau": (47.9977919, 7.8426094),
    "freiburg breisgau hbf": (47.9977919, 7.8426094),
    "freiburg hbf": (47.9977919, 7.8426094),
    "offenburg": (48.47302, 7.9455),
    "stuttgart hbf": (48.783615, 9.182902),
    "augsburg hbf": (48.3656702, 10.8862827),
    "baden baden": (48.7895302, 8.1909158),
    "berlin hbf": (52.5250175, 13.369448),
    "berlin sudkreuz": (52.4759806, 13.3650726),
    "berlin gesundbrunnen": (52.5486453, 13.3902169),
    "erfurt hbf": (50.9727731, 11.0378865),
    "esslingen neckar": (48.7397667, 9.3002039),
    "halle saale hbf": (51.4774872, 11.9872964),
    "kaiserslautern hbf": (49.4359636, 7.7680865),
    "lahr schwarzw": (48.3418287, 7.8360637),
    "munchen hbf": (48.1407253, 11.5569426),
    "ringsheim europa park": (48.2483367, 7.7732483),
    "saarbruecken sarrebruck": (49.2411972, 6.990794),
    "ulm hbf": (48.3994159, 9.9826024),
    "vaihingen enz": (48.9461895, 8.9586162),
    # Switzerland
    "geneve": (46.210017, 6.142738),
    "geneva": (46.210017, 6.142738),
    "geneve cornavin": (46.2081688, 6.1424953),
    "zurich": (47.378177, 8.540192),
    "zurich hb": (47.378177, 8.540192),
    "zurich hbf": (47.378177, 8.540192),
    "basel sbb": (47.54747, 7.58913),
    "lausanne": (46.516003, 6.629634),
    "bern": (46.94809, 7.439116),
    "sion": (46.223098, 7.357765),
    "vallorbe": (46.712326, 6.377928),
    # Belgium, Luxembourg
    "bruxelles": (50.846733, 4.35706),
    "bruxelles central": (50.846733, 4.35706),
    "bruxelles midi": (50.835694, 4.336934),
    "brussels": (50.846733, 4.35706),
    "luxembourg": (49.5996198, 6.1348882),
    # Italy, Spain, Austria
    "milano centrale": (45.485051, 9.204158),
    "milan centrale": (45.485051, 9.204158),
    "milano porta garibaldi": (45.4849, 9.1878),
    "torino porta susa": (45.07343, 7.659258),
    "oux cesana clav sestriere": (45.038731, 6.831411),
    "barcelona sants": (41.379128, 2.140478),
    "girona": (41.9791657, 2.8162865),
    "figueres vilafant": (42.2646953, 2.9426836),
    "vienna hbf": (48.18575, 16.376973),
}

# TGVmax labels matching no reference key: without this, "LORRAINE TGV" landed in Rai, Normandy.
LABEL_ALIASES = {
    "aeroport roissy cdg 2 tgv": "roissy aeroport charles de gaulle 2 tgv rer",
    "lorraine tgv": "lorraine louvigny tgv",
    "valence tgv auvergne rhone alpes": "valence tgv",
    "nimes centre": "nimes",
    "caussade tarn et garonne": "caussade",
    # "st" is two letters, so "die" was the sole hook: Saint-Dié landed in Die, in the Drôme.
    "st die": "st die des vosges",
    # The département qualifier became a hook: "sevres" tied Saint-Maixent to Sèvres.
    "st maixent deux sevres": "st maixent l ecole",
    # A mis-encoded label duplicating "ANGOULEME"; normalisation leaves "angoula me".
    "angoula me": "angouleme",
}


# The dataset's longest label is 32 characters, over letters, digits, spaces and `- ( ) ' . /`.
MAX_LABEL = 64
_PUNCTUATION = frozenset(" '()./-")


def is_station_label(value: str) -> bool:
    """Could this string be a station label at all?"""
    return 1 <= len(value) <= MAX_LABEL and all(c.isalnum() or c in _PUNCTUATION for c in value)


def tokenize(label: str) -> list[str]:
    return [
        ABBREVIATIONS.get(token, token)
        for token in clean_string(label).split(" ")
        if token and token not in NOISE_TOKENS
    ]


def station_key(label: str) -> str:
    """Comparison key for a label, shared by the TGVmax dataset and the reference."""
    return " ".join(tokenize(label))


def build_coords_index(records: list[dict]) -> CoordsIndex:
    """Index the SNCF station reference by comparison key."""
    # Insertion order matters: `best_partial_match` breaks ties on the first candidate met.
    index: CoordsIndex = {}
    for record in records:
        lon = record.get("x_wgs84")
        lat = record.get("y_wgs84")
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            continue
        coords: Coords = (float(lat), float(lon))
        libelle = record.get("libelle")
        if libelle:
            index[station_key(libelle)] = coords
        commune = record.get("commune")
        if commune:
            # A commune never overwrites a station carrying the same key.
            index.setdefault(station_key(commune), coords)
    return index


def best_partial_match(index: CoordsIndex, tokens: list[str]) -> Coords | None:
    """Fallback for a label no table covers. Returns nothing rather than a doubtful match."""
    wanted = {token for token in tokens if len(token) >= MIN_MATCH_LEN}
    if not wanted:
        return None

    best: Coords | None = None
    best_hits = 0
    best_parts = float("inf")

    for candidate, coords in index.items():
        parts = candidate.split(" ")
        hits = 0
        contained = True
        for part in parts:
            if len(part) < MIN_MATCH_LEN:
                continue
            if part in wanted:
                hits += 1
            else:
                contained = False
                break
        if not contained or not hits:
            continue
        # At equal word count, the shorter label is the more specific one.
        if hits > best_hits or (hits == best_hits and len(parts) < best_parts):
            best = coords
            best_hits = hits
            best_parts = len(parts)
    return best


def resolve_coords(index: CoordsIndex, label: str) -> tuple[Coords | None, str]:
    """Coordinates for a label, and how they were found."""
    key = station_key(label)
    if not key:
        return None, "none"

    aliased = LABEL_ALIASES.get(key)
    lookup_key = aliased or key

    extra = EXTRA_STATIONS.get(lookup_key)
    if extra:
        return extra, "extra"

    exact = index.get(lookup_key)
    if exact:
        return exact, "alias" if aliased else "exact"

    partial = best_partial_match(index, lookup_key.split(" "))
    return (partial, "partial") if partial else (None, "none")


@cache
def coords_index() -> CoordsIndex:
    """The reference index, built once per process."""
    path = Path(settings.REFERENCE_DATA_DIR) / "gares.json"
    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.exception("référentiel des gares illisible : %s", path)
        return {}
    return build_coords_index(records)


def lookup_coords(label: str) -> Coords | None:
    return resolve_coords(coords_index(), label)[0]
