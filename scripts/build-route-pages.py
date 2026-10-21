# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
Construit shared/route-pages.json : les liaisons qui méritent une page `/depuis/<a>/vers/<b>`.

Le même arbitrage que pour les pages gare, à la puissance deux. Croiser les 50 gares de
`station-pages.json` donnerait 2 450 URL sur un seul gabarit, soit quarante-six fois la
surface indexable actuelle : c'est exactement le contenu produit à grande échelle que
`build-station-pages.py` refuse déjà, et l'évaluation de qualité vaut pour le site entier.

On part donc des seules gares dont la mesure d'audience établit la demande, et on ne garde
que les liaisons ayant assez de jours réservables pour que la page ait quelque chose à dire.

Usage : uv run scripts/build-route-pages.py
À relancer quand la mesure d'audience déplace le classement, ou quand l'offre change de
saison.
"""
import json
from collections import defaultdict
from pathlib import Path

import requests

SNCF = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"

ROOT = Path(__file__).parent.parent
SHARED_DIR = ROOT / "shared"

# Les gares que la mesure d'audience classe sans ambiguïté, relevé du 2026-09-04 sur
# 187 sessions portant une gare : Paris 95, Lyon 44, Marseille 20, Bordeaux 14, Toulouse 8,
# Lille 8, Nice 7. Au-delà, les effectifs tombent à une ou deux sessions et le classement
# ne mesure plus rien. Élargir cette liste demande une source de demande, pas une intuition.
ORIGINS = [
    "paris",
    "lyon",
    "marseille-st-charles",
    "bordeaux-st-jean",
    "toulouse-matabiau",
    "lille",
    "nice-ville",
]

# En dessous, la page annonce une liaison que le voyageur ne trouvera presque jamais
# ouverte. Compté en jours distincts sur la fenêtre de 30 jours publiée.
MIN_DAYS = 5


def offer_by_pair() -> dict[tuple[str, str], dict[str, int]]:
    """Par couple de libellés : jours réservables distincts et trains, sur les places TGVmax."""
    res = requests.get(
        f"{SNCF}/records",
        params={
            "select": "origine, destination, count(distinct date) as jours, count(*) as trains",
            "group_by": "origine, destination",
            "where": "od_happy_card='OUI'",
            "limit": -1,
        },
        timeout=(10, 120),
    ).json()
    return {
        (r["origine"], r["destination"]): {"days": r["jours"], "trains": r["trains"]}
        for r in res.get("results", [])
        if r.get("origine") and r.get("destination")
    }


def main() -> None:
    booking: dict[str, dict] = json.loads((SHARED_DIR / "booking.json").read_text())
    pages = {s["slug"] for s in json.loads((SHARED_DIR / "station-pages.json").read_text())}

    missing = [slug for slug in ORIGINS if slug not in pages]
    if missing:
        raise SystemExit(f"gares sans page /depuis/ : {missing}")

    # Une ville peut avoir plusieurs gares (Montpellier St-Roch et Sud-de-France) : elles
    # partagent un slug, donc une seule liaison, dont on cumule l'offre.
    slug_of = {entry["label"]: entry["slug"] for entry in booking.values()}
    wanted = set(ORIGINS)

    pairs: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"days": 0, "trains": 0})
    for (origin, destination), stats in offer_by_pair().items():
        a, b = slug_of.get(origin), slug_of.get(destination)
        if a is None or b is None or a == b or a not in wanted or b not in wanted:
            continue
        # Les jours ne s'additionnent pas entre deux gares d'une même ville : le même jour
        # y compte deux fois. Le maximum sous-estime, une somme surestimerait franchement.
        pairs[(a, b)]["days"] = max(pairs[(a, b)]["days"], stats["days"])
        pairs[(a, b)]["trains"] += stats["trains"]

    kept = sorted(
        ((pair, stats) for pair, stats in pairs.items() if stats["days"] >= MIN_DAYS),
        key=lambda item: (-item[1]["days"], -item[1]["trains"], item[0]),
    )

    out = [{"from": a, "to": b} for (a, b), _ in sorted(kept, key=lambda item: item[0])]
    (SHARED_DIR / "route-pages.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=0).replace("\n", "") + "\n"
    )

    total = len(ORIGINS) * (len(ORIGINS) - 1)
    print(f"\n{len(out)} liaisons retenues sur {total} possibles -> shared/route-pages.json\n")
    print(f"{'#':>3}  {'liaison':44} {'jours':>6} {'trains':>7}")
    for i, ((a, b), stats) in enumerate(kept, 1):
        print(f"{i:>3}  {f'{a} -> {b}':44} {stats['days']:>6} {stats['trains']:>7}")

    dropped = [
        (pair, stats["days"]) for pair, stats in pairs.items() if stats["days"] < MIN_DAYS
    ]
    absent = [
        (a, b)
        for a in ORIGINS
        for b in ORIGINS
        if a != b and (a, b) not in pairs
    ]
    print(f"\nSous le seuil de {MIN_DAYS} jours : {[f'{a}->{b} ({d} j)' for (a, b), d in dropped]}")
    print(f"Sans TGVmax direct : {[f'{a}->{b}' for a, b in absent]}")


if __name__ == "__main__":
    main()
