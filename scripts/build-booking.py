# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
Construit shared/booking.json : pour chaque gare TGVmax, le slug de ville
utilisé par les sites de réservation dans leurs URL de pages horaires.

Pourquoi un slug de ville et pas le libellé de la gare : les deux sites construisent
leurs pages horaires sur des noms de ville, pas sur des libellés de gare.
`marseille-st-charles` renvoie 404, `marseille` fonctionne.

Vérification : chaque slug candidat est testé contre Trainline, dont le robots.txt
autorise /fr/horaires-train/ et qui renvoie des statuts HTTP fiables. SNCF Connect
protège son site par un défi anti-bot (403 DataDome) et ne peut pas être vérifié
automatiquement ; on réutilise le slug validé chez Trainline, les deux sites
employant les mêmes noms de ville.

Le slug sert ensuite à construire, côté application :
  SNCF Connect  https://www.sncf-connect.com/train/horaires/{a}/{b}
  Trainline     https://www.thetrainline.com/fr/horaires-train/{a}-a-{b}

Usage : uv run scripts/build-booking.py
À relancer ponctuellement (les libellés SNCF et les slugs évoluent lentement).
"""
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

SNCF = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"
TRAINLINE = "https://www.thetrainline.com/fr/horaires-train"
UA = "trainquillou-build/1.0 (+https://github.com/csanchez-jetdev/trainquillou)"

ASSETS_DIR = Path(__file__).parent.parent / "shared"
CACHE = Path(__file__).parent / ".booking-cache.json"

# Délai entre requêtes : on interroge un site tiers, on reste discret.
DELAY_S = 0.5

# Villes hors de France, dont les sites français utilisent le nom francisé.
FOREIGN_HINTS = {
    "frankfurt": ["francfort", "francfort-sur-le-main"],
    "karlsruhe": ["karlsruhe"],
    "mannheim": ["mannheim"],
    "freiburg": ["fribourg-en-brisgau", "fribourg"],
    "offenburg": ["offenbourg", "offenburg"],
    "stuttgart": ["stuttgart"],
    "basel": ["bale", "basel"],
    "geneve": ["geneve"],
    "zurich": ["zurich"],
    "lausanne": ["lausanne"],
    "bern": ["berne"],
    "sion": ["sion"],
    "vallorbe": ["vallorbe"],
    "milano": ["milan"],
    "milan": ["milan"],
    "torino": ["turin"],
    "barcelona": ["barcelone"],
    "vienna": ["vienne"],
    "bruxelles": ["bruxelles"],
    "brussels": ["bruxelles"],
    "luxembourg": ["luxembourg"],
}


def clean(s: str) -> str:
    if not s:
        return ""
    normalized = unicodedata.normalize("NFD", s)
    no_diacritics = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", no_diacritics.lower()).strip()


def station_labels() -> list[str]:
    labels: set[str] = set()
    for field in ("origine", "destination"):
        res = requests.get(
            f"{SNCF}/records",
            params={"select": field, "group_by": field, "limit": -1},
            timeout=30,
        ).json()
        for row in res.get("results", []):
            v = row.get(field)
            if v:
                labels.add(v)
    return sorted(labels)


def candidates(label: str) -> list[str]:
    """Slugs à essayer, du plus spécifique au plus général."""
    tokens = clean(label).split()
    if not tokens:
        return []

    out: list[str] = []

    # Nom francisé pour les villes étrangères : le plus fiable, donc en premier.
    for hint_key, hints in FOREIGN_HINTS.items():
        if tokens[0] == hint_key:
            out.extend(hints)

    # Troncature progressive : « aix en provence tgv » -> « aix-en-provence » -> « aix ».
    for n in range(len(tokens), 0, -1):
        out.append("-".join(tokens[:n]))

    # Le référentiel abrège « Saint » ; les sites de réservation, pas toujours.
    for slug in list(out):
        if "st-" in slug:
            out.append(slug.replace("st-", "saint-"))
        if slug.startswith("st-"):
            out.append("saint-" + slug[3:])

    # Mots isolés significatifs : rattrape « AEROPORT ROISSY CDG 2 TGV » -> « roissy ».
    out.extend(t for t in tokens if len(t) >= 4)

    return list(dict.fromkeys(out))


def load_cache() -> dict[str, bool]:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    return {}


def slug_exists(slug: str, cache: dict[str, bool]) -> bool:
    """Le slug désigne-t-il une ville connue de Trainline ?"""
    if slug in cache:
        return cache[slug]

    # On teste la paire slug -> Paris, qui existe pour toute ville desservie.
    counterpart = "lyon" if slug == "paris" else "paris"
    url = f"{TRAINLINE}/{slug}-a-{counterpart}"
    try:
        res = requests.head(
            url, headers={"User-Agent": UA}, timeout=20, allow_redirects=True
        )
        ok = res.status_code == 200
    except requests.RequestException:
        ok = False

    cache[slug] = ok
    time.sleep(DELAY_S)
    return ok


def main() -> None:
    labels = station_labels()
    print(f"{len(labels)} gares TGVmax\n")

    cache = load_cache()
    resolved: dict[str, dict[str, str]] = {}
    unresolved: list[str] = []

    try:
        for label in labels:
            hit = None
            for slug in candidates(label):
                if slug_exists(slug, cache):
                    hit = slug
                    break
            if hit:
                # Le libellé d'origine est conservé : les pages statiques en ont besoin
                # tel quel pour passer `origin` à l'application.
                resolved[clean(label)] = {"label": label, "slug": hit}
                print(f"  ✓ {label:42} -> {hit}")
            else:
                unresolved.append(label)
                print(f"  ✗ {label:42} -> aucun slug vérifié")
    except KeyboardInterrupt:
        print("\ninterrompu — le cache est conservé, relancez pour reprendre")
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0) + "\n")

    out = dict(sorted(resolved.items()))
    (ASSETS_DIR / "booking.json").write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n"
    )

    print(f"\n{len(out)}/{len(labels)} gares résolues -> shared/booking.json")
    if unresolved:
        print(f"{len(unresolved)} sans slug (pas de lien de réservation pour elles) :")
        for label in unresolved:
            print(f"  - {label}")
    if not out:
        sys.exit("aucun slug résolu : le format d'URL de Trainline a peut-être changé")


if __name__ == "__main__":
    main()
