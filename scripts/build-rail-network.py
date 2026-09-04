# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""Build public/rail-network.geojson from the SNCF nominal max-speed dataset."""
import json
from pathlib import Path

import requests

DATASET = (
    "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets"
    "/vitesse-maximale-nominale-sur-ligne"
)
UA = "trainquillou-build/1.0 (+https://github.com/csanchez-jetdev/trainquillou)"

OUT = Path(__file__).parent.parent / "public" / "rail-network.geojson"

TIERS = ((250, "lgv"), (160, "fast"), (0, "slow"))
# Simplification tolerance in degrees, ~330 m: invisible at the zooms the map uses (5-11).
TOLERANCE = 0.003
DECIMALS = 4


def fetch() -> list[dict]:
    response = requests.get(
        f"{DATASET}/exports/geojson",
        params={"select": "v_max"},
        headers={"User-Agent": UA},
        timeout=300,
    )
    response.raise_for_status()
    return response.json()["features"]


def tier(speed: int) -> str:
    return next(name for floor, name in TIERS if speed >= floor)


def distance(point, start, end) -> float:
    """Distance from a point to the segment [start, end], in degrees."""
    (x, y), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return ((x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2) ** 0.5


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    index, worst = 0, 0.0
    for i in range(1, len(points) - 1):
        d = distance(points[i], points[0], points[-1])
        if d > worst:
            index, worst = i, d
    if worst <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def main() -> None:
    features = []
    points = 0
    for feature in fetch():
        geometry = feature.get("geometry") or {}
        raw = feature["properties"].get("v_max")
        if geometry.get("type") != "LineString" or not (raw or "").isdigit():
            continue
        coords = simplify(geometry["coordinates"], TOLERANCE)
        coords = [[round(x, DECIMALS), round(y, DECIMALS)] for x, y in coords]
        # Rounding can produce identical consecutive points, hence a one-point segment.
        coords = [c for i, c in enumerate(coords) if i == 0 or c != coords[i - 1]]
        if len(coords) < 2:
            continue
        speed = int(raw)
        features.append({
            "type": "Feature",
            "properties": {"t": tier(speed), "v": speed},
            "geometry": {"type": "LineString", "coordinates": coords},
        })
        points += len(coords)

    payload = json.dumps(
        {"type": "FeatureCollection", "features": features}, separators=(",", ":")
    )
    OUT.write_text(payload + "\n")

    counts = {name: sum(1 for f in features if f["properties"]["t"] == name) for _, name in TIERS}
    print(
        f"{len(features)} tronçons {counts}, {points} points, "
        f"{len(payload) / 1024:.0f} ko -> public/rail-network.geojson"
    )


if __name__ == "__main__":
    main()
