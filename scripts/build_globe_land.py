#!/usr/bin/env python3
"""Dot-matrix land layer for the Research Footprint globe.

Samples points on an equal-area grid (rows by latitude, fewer columns toward the poles) and keeps those that fall on
land in Natural Earth's 1:110m land polygons (public domain, https://www.naturalearthdata.com). Writes compact
integer pairs (lat, lng in tenths of a degree) to static/data/globe_land.json.

Usage: python3 scripts/build_globe_land.py path/to/ne_110m_land.geojson
"""
import json
import math
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "data" / "globe_land.json"
STEP = 1.5  # degrees between rows; roughly 6,000 land dots


def inside(lng, lat, ring):
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def main():
    geo = json.loads(Path(sys.argv[1]).read_text())
    polys = []
    for f in geo["features"]:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in parts:
            outer = poly[0]
            xs = [p[0] for p in outer]
            ys = [p[1] for p in outer]
            polys.append((min(xs), max(xs), min(ys), max(ys), poly))
    dots = []
    lat = -90 + STEP / 2
    while lat < 84:
        cols = max(1, int(round(360 / STEP * math.cos(math.radians(lat)))))
        for c in range(cols):
            lng = -180 + (c + 0.5) * 360 / cols
            for x0, x1, y0, y1, poly in polys:
                if x0 <= lng <= x1 and y0 <= lat <= y1 and inside(lng, lat, poly[0]) and not any(
                    inside(lng, lat, hole) for hole in poly[1:]
                ):
                    dots.append([round(lat * 10), round(lng * 10)])
                    break
        lat += STEP
    OUT.write_text(json.dumps({"source": "Natural Earth 1:110m land (public domain)", "step": STEP, "dots": dots},
                              separators=(",", ":")))
    print(f"{len(dots)} land dots -> {OUT.name} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
