# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""
Construit server/assets/popularity.json : pour chaque gare TGVmax, un score de
notoriété touristique = nombre d'éditions linguistiques de Wikipédia de la ville
(proxy gratuit, sans clé ; les lieux très touristiques ont beaucoup de versions).
Construit server/assets/popularity.json.

Pipeline (toutes sources publiques, sans clé) :
  1. labels TGVmax  (facettes origine ∪ destination de l'open data SNCF)
  2. label → commune (référentiel gares.json, matching tolérant)
  3. commune → code INSEE (geo.api.gouv.fr, recherche floue officielle)
  4. INSEE → sitelinks (Wikidata SPARQL, jointure exacte via P374)

Usage : uv run scripts/build-popularity.py
À relancer ponctuellement (les données évoluent lentement).
"""
import json
import re
import unicodedata
from pathlib import Path

import requests

SNCF = "https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax"
UA = "trainquillou-build/1.0 (+https://github.com/csanchez-jetdev/trainquillou)"

ASSETS_DIR = Path(__file__).parent.parent / "server" / "assets"


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
        ).json()
        for row in res.get("results", []):
            v = row.get(field)
            if v:
                labels.add(v)
    return list(labels)


def build_commune_index(gares: list[dict]) -> list[dict]:
    entries: list[dict] = []
    seen: set[str] = set()
    for g in gares:
        if g.get("libelle"):
            entries.append({"key": clean(g["libelle"]), "commune": g.get("commune")})
        if g.get("commune"):
            k = clean(g["commune"])
            if k not in seen:
                seen.add(k)
                entries.append({"key": k, "commune": g["commune"]})
    return entries


def find_commune(entries: list[dict], label: str) -> str | None:
    key = clean(label)
    if not key:
        return None
    for e in entries:
        if e["key"] == key:
            return e["commune"]
    # Correspondance sur frontière de mot : le plus long gagne.
    best: dict | None = None
    for e in entries:
        ek = e["key"]
        if len(ek) < 3:
            continue
        if key == ek or key.startswith(ek + " ") or ek.startswith(key + " "):
            if best is None or len(ek) > len(best["key"]):
                best = e
    return best["commune"] if best else None


def commune_to_insee(commune: str) -> str | None:
    try:
        res = requests.get(
            "https://geo.api.gouv.fr/communes",
            params={"nom": commune, "fields": "code", "limit": 1, "boost": "population"},
        ).json()
        return res[0]["code"] if res else None
    except Exception:
        return None


def sitelinks_by_insee(insee_codes: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for i in range(0, len(insee_codes), 80):
        batch = insee_codes[i : i + 80]
        values = " ".join(f'"{c}"' for c in batch)
        query = (
            f"SELECT ?insee ?sitelinks WHERE {{ "
            f"VALUES ?insee {{ {values} }} "
            f"?city wdt:P374 ?insee. ?city wikibase:sitelinks ?sitelinks. }}"
        )
        res = requests.get(
            "https://query.wikidata.org/sparql",
            params={"format": "json", "query": query},
            headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
        ).json()
        for b in res.get("results", {}).get("bindings", []):
            insee = b["insee"]["value"]
            sl = int(b["sitelinks"]["value"])
            out[insee] = max(out.get(insee, 0), sl)
    return out


def main() -> None:
    gares: list[dict] = json.loads((ASSETS_DIR / "gares.json").read_text())
    entries = build_commune_index(gares)
    labels = station_labels()
    print(f"{len(labels)} gares TGVmax")

    label_commune: dict[str, str] = {}
    for label in labels:
        commune = find_commune(entries, label)
        if commune:
            label_commune[label] = commune

    communes = list(dict.fromkeys(label_commune.values()))
    commune_insee: dict[str, str] = {}
    for commune in communes:
        insee = commune_to_insee(commune)
        if insee:
            commune_insee[commune] = insee
    print(f"{len(commune_insee)}/{len(communes)} communes résolues en code INSEE")

    insee_sitelinks = sitelinks_by_insee(list(dict.fromkeys(commune_insee.values())))

    popularity: dict[str, int] = {}
    for label, commune in label_commune.items():
        insee = commune_insee.get(commune)
        sl = insee_sitelinks.get(insee) if insee else None
        if sl is not None:
            popularity[clean(label)] = sl

    sorted_pop = dict(sorted(popularity.items(), key=lambda x: x[1], reverse=True))
    (ASSETS_DIR / "popularity.json").write_text(
        json.dumps(sorted_pop, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(f"{len(sorted_pop)} gares scorées -> server/assets/popularity.json")
    print(f"Top 8 : {list(sorted_pop.items())[:8]}")


if __name__ == "__main__":
    main()
