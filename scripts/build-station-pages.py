# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
Construit shared/station-pages.json : les gares qui méritent une page `/depuis/<slug>`.

Une page par gare TGVmax (plus de 300) revient à publier trois cents fois le même
gabarit avec un nom échangé : Google traite ça comme du contenu produit à grande
échelle, et l'évaluation de qualité vaut pour le site entier. On n'en garde qu'une
cinquantaine, celles qui réunissent les deux conditions d'une page utile :

  - une demande de recherche réelle  -> notoriété de la ville (popularity.json)
  - quelque chose à montrer dessus   -> largeur et profondeur de l'offre TGVmax

Les trois signaux sont à queue lourde (Paris dessert 197 destinations, la médiane
en dessert 8) : on les compresse en logarithme avant de les combiner, sinon Paris
écrase le classement et le reste se départage sur du bruit.

Usage : uv run scripts/build-station-pages.py
À relancer quand l'offre TGVmax évolue nettement (nouvelles dessertes, saison).
"""
import json
import math
import re
import unicodedata
from pathlib import Path

import requests

SNCF = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"

ROOT = Path(__file__).parent.parent
ASSETS_DIR = ROOT / "server" / "assets"
SHARED_DIR = ROOT / "shared"

# Nombre de pages publiées.
KEEP = 50

# En dessous, la page n'a rien à montrer : on l'écarte quelle que soit la notoriété
# de la ville.
MIN_DESTINATIONS = 5

# Poids des trois signaux. La demande pèse le plus : une page qui répond à une
# requête que personne ne tape ne sert à rien, même adossée à une offre riche.
W_DEMAND, W_BREADTH, W_DEPTH = 0.5, 0.35, 0.15

# La notoriété est mesurée en éditions linguistiques de Wikipédia : Berlin et
# Barcelone y écrasent Rennes, alors que « TGVmax depuis Berlin » n'est pas une
# requête française. On ramène les gares étrangères à leur poids réel ici.
FOREIGN_DEMAND_FACTOR = 0.3


def clean(s: str) -> str:
    if not s:
        return ""
    normalized = unicodedata.normalize("NFD", s)
    no_diacritics = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", no_diacritics.lower()).strip()


def offer_by_origin() -> dict[str, dict[str, int]]:
    """Par gare de départ : destinations distinctes et trains, sur les places TGVmax."""
    res = requests.get(
        f"{SNCF}/records",
        params={
            "select": "origine, count(distinct destination) as dests, count(*) as trains",
            "group_by": "origine",
            "where": "od_happy_card='OUI'",
            "limit": -1,
        },
    ).json()
    return {
        r["origine"]: {"dests": r["dests"], "trains": r["trains"]}
        for r in res.get("results", [])
        if r.get("origine")
    }


def french_communes(gares: list[dict]) -> set[str]:
    """Clés du référentiel des gares françaises : libellés et communes."""
    keys: set[str] = set()
    for g in gares:
        for field in ("libelle", "commune"):
            if g.get(field):
                keys.add(clean(g[field]))
    return keys


def is_french(label: str, keys: set[str]) -> bool:
    key = clean(label)
    if not key:
        return False
    if key in keys:
        return True
    # Correspondance sur frontière de mot, comme le reste du projet : jamais en
    # sous-chaîne, sinon « ur » accroche « frankfurt ».
    return any(
        k for k in keys if len(k) >= 3 and (key.startswith(k + " ") or k.startswith(key + " "))
    )


def normalized_log(value: float, maximum: float) -> float:
    if maximum <= 0:
        return 0.0
    return math.log1p(max(value, 0)) / math.log1p(maximum)


def main() -> None:
    booking: dict[str, dict] = json.loads((SHARED_DIR / "booking.json").read_text())
    popularity: dict[str, int] = json.loads((ASSETS_DIR / "popularity.json").read_text())
    gares: list[dict] = json.loads((ASSETS_DIR / "gares.json").read_text())
    keys = french_communes(gares)

    offer = offer_by_origin()
    print(f"{len(offer)} gares de départ avec des places TGVmax")

    # Une ville peut avoir plusieurs gares (Montpellier St-Roch et Sud-de-France) :
    # elles partagent un slug, donc une seule page. On cumule leur offre et on
    # retient le libellé que shared/stations.ts retiendra, le premier alphabétique.
    by_slug: dict[str, dict] = {}
    for normalized, entry in booking.items():
        slug, label = entry["slug"], entry["label"]
        stats = offer.get(label)
        if not stats:
            continue
        agg = by_slug.setdefault(
            slug, {"slug": slug, "label": label, "dests": 0, "trains": 0, "pop": 0}
        )
        if label < agg["label"]:
            agg["label"] = label
        agg["dests"] = max(agg["dests"], stats["dests"])
        agg["trains"] += stats["trains"]
        agg["pop"] = max(agg["pop"], popularity.get(normalized, 0))

    candidates = [s for s in by_slug.values() if s["dests"] >= MIN_DESTINATIONS]
    print(f"{len(candidates)} gares avec au moins {MIN_DESTINATIONS} destinations")

    for s in candidates:
        s["french"] = is_french(s["label"], keys)

    max_pop = max(s["pop"] for s in candidates)
    max_dests = max(s["dests"] for s in candidates)
    max_trains = max(s["trains"] for s in candidates)

    for s in candidates:
        demand = normalized_log(s["pop"], max_pop)
        if not s["french"]:
            demand *= FOREIGN_DEMAND_FACTOR
        s["score"] = round(
            W_DEMAND * demand
            + W_BREADTH * normalized_log(s["dests"], max_dests)
            + W_DEPTH * normalized_log(s["trains"], max_trains),
            4,
        )

    candidates.sort(key=lambda s: (-s["score"], s["slug"]))
    kept = candidates[:KEEP]

    out = [{"slug": s["slug"], "label": s["label"]} for s in sorted(kept, key=lambda s: s["slug"])]
    (SHARED_DIR / "station-pages.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=0).replace("\n", "") + "\n"
    )

    print(f"\n{len(out)} pages retenues -> shared/station-pages.json\n")
    print(f"{'#':>3}  {'gare':32} {'score':>6} {'dest.':>6} {'trains':>7} {'notor.':>7}  pays")
    for i, s in enumerate(kept, 1):
        flag = "FR" if s["french"] else "étr."
        print(
            f"{i:>3}  {s['label'][:32]:32} {s['score']:>6.3f} {s['dests']:>6} "
            f"{s['trains']:>7} {s['pop']:>7}  {flag}"
        )

    print("\nPremières écartées :")
    for s in candidates[KEEP : KEEP + 8]:
        print(f"     {s['label'][:32]:32} {s['score']:>6.3f} {s['dests']:>6} {s['trains']:>7}")


if __name__ == "__main__":
    main()
