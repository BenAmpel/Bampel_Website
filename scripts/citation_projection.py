#!/usr/bin/env python3
"""Citation projection from peer trajectories (OpenAlex), written as aggregate multipliers only.

How it works
1. Draw a seeded random sample of authors from OpenAlex topics close to this research (information and cyber
   security, IS, phishing, adversarial ML, topic modelling). No selection on today's citation totals.
2. Keep authors whose career is old enough to observe 6 career years plus the forecast horizon, and drop records
   that look merged (works long before the career start, or implausible yearly output).
3. Match peers on what was known at the same career stage: the shape of their citations in career years 2-7
   relative to year 6, plus their level in year 6. The nearest K are the analog cohort.
4. The projection for year 6+h is citations(year 6) x the cohort's ratio c(6+h)/c(6). Ratios are scale-free, so
   they apply to the Google Scholar series even though OpenAlex counts run lower.
5. Leave-one-out backtest on the pool: each peer is forecast from its own nearest neighbours, and we count how often
   the 80% band held the real outcome. If it held less often, the band is widened in log space until it does.

Only aggregates leave this script: per-year low / median / high multipliers, cohort sizes and backtest coverage.
No peer names or IDs are written. The matched peers' paths are written only as shuffled ratios to their own anchor
year (no start year, no level), so the chart can draw the fan without identifying anyone. Raw API pages are cached outside the repo (--cache).

Usage: python3 scripts/citation_projection.py --cache /path/to/scratch/openalex-cache
"""
from __future__ import annotations

import argparse
import hashlib
import datetime as dt
import json
import math
import random
import statistics
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = ROOT / "static" / "data" / "dashboard_payload.json"
OUT = ROOT / "static" / "data" / "citation_projection.json"

TOPICS = {
    "T10734": "Information and Cyber Security",
    "T13983": "Cybersecurity and Information Systems",
    "T11644": "Spam and Phishing Detection",
    "T11689": "Adversarial Robustness in Machine Learning",
    "T10028": "Topic Modeling",
    "T11024": "Information Systems Theories and Implementation",
}
SAMPLE_PER_TOPIC = 6000
SEED = 20261112
CAREER_START = 2019          # first publication year of the subject
ANCHOR_K = 7                 # career year of the nowcast year (2026); it beat a 2025 anchor in the backtest
SHAPE_KS = (2, 3, 4, 5, 6)   # career years compared to the anchor
HORIZONS = (1, 2, 3)         # career years 8-10 -> 2027-2029
NEIGHBOURS = 80
START_MIN = 2009             # older careers grew far slower (drift check below), so they are left out
ANCHOR_MIN = 15              # OpenAlex citations in the anchor career year; below this, ratios are mostly noise
# OpenAlex counts this record at roughly 0.55x Google Scholar (2024: 87 vs 132). Used only to place the subject's
# level among peers; the projection itself multiplies the Scholar series.
OA_SCALE = 0.55
NOMINAL = 0.80
API = "https://api.openalex.org/authors"


def fetch(url: str, cache: Path) -> dict:
    key = cache / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if key.exists():
        return json.loads(key.read_text())
    req = urllib.request.Request(url, headers={"User-Agent": "citation-projection/1.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            key.write_text(json.dumps(data))
            time.sleep(0.15)
            return data
        except Exception:  # noqa: BLE001 - retry transient network errors
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"OpenAlex request failed: {url}")


def sample_topic(topic: str, cache: Path) -> list[dict]:
    rows = []
    for page in range(1, SAMPLE_PER_TOPIC // 200 + 1):
        url = (
            f"{API}?filter=topics.id:{topic}&sample={SAMPLE_PER_TOPIC}&seed={SEED}"
            f"&per_page=200&page={page}&select=id,works_count,counts_by_year"
        )
        rows.extend(fetch(url, cache).get("results", []))
    return rows


def career(author: dict, last_year: int):
    """Return (start, {career_year: citations}) or None when the record is unusable."""
    works = {c["year"]: c.get("works_count", 0) for c in (author.get("counts_by_year") or [])}
    cites = {c["year"]: c.get("cited_by_count", 0) for c in (author.get("counts_by_year") or [])}
    active = sorted(y for y, n in works.items() if n > 0)
    if not active:
        return None
    start = active[0]
    # A real career: works in at least 3 of its first 6 years, and no implausible yearly output (merged records).
    if sum(1 for y in active if y <= start + 5) < 3 or max(works.values()) > 40:
        return None
    # Merged records often carry a stray early work then a long gap; require the second work within 3 years.
    if len(active) > 1 and active[1] - start > 3:
        return None
    series = {y - start: cites.get(y, 0) for y in range(start, last_year + 1)}
    return start, series


def features(series: dict[int, float]):
    a = series[ANCHOR_K]
    shape = [math.log1p(series[k]) - math.log1p(a) for k in SHAPE_KS]
    return shape, math.log(a)


def distance(f1, f2) -> float:
    (s1, l1), (s2, l2) = f1, f2
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(s1, s2)) + 0.5 * (l1 - l2) ** 2)


def quantile(xs: list[float], q: float) -> float:
    xs = sorted(xs)
    pos = q * (len(xs) - 1)
    lo, hi = math.floor(pos), math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def band(ratios: list[float], tail: float = 0.10, widen: float = 1.0):
    """Quantile band in log space: (low, median, high) for the central 1 - 2*tail of the ratios."""
    logs = [math.log(max(r, 1e-3)) for r in ratios]
    mid = quantile(logs, 0.5)
    lo = mid - (mid - quantile(logs, tail)) * widen
    hi = mid + (quantile(logs, 1 - tail) - mid) * widen
    return math.exp(lo), math.exp(mid), math.exp(hi)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="folder for raw API pages (keep it outside the repo)")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    authors = {}
    for topic in TOPICS:
        for a in sample_topic(topic, cache):
            authors[a["id"]] = a
    print(f"sampled {len(authors)} unique authors across {len(TOPICS)} topics")

    # The nowcast is dated by the Scholar scrape, not by today, so it does not drift until the data refreshes.
    payload = json.loads(PAYLOAD.read_text())
    scholar = payload["scholar"]
    as_of = dt.datetime.strptime(scholar.get("lastUpdated", ""), "%B %Y").date().replace(day=15)
    this_year = as_of.year
    max_h = max(HORIZONS)

    def build_pool(last_year):
        pool = []
        for a in authors.values():
            got = career(a, last_year)
            if not got:
                continue
            start, series = got
            if start < START_MIN or start + ANCHOR_K + max_h > last_year or series[ANCHOR_K] < ANCHOR_MIN:
                continue
            pool.append({"start": start, "series": series, "f": features(series)})
        return pool

    # Calendar-year check on a fixed set of people (the sample's totals grow just because it gains authors): median
    # year-on-year growth for peers in career years 4-12, by calendar year. A jump in recent years would mean an
    # indexing or era effect that a backtest on older years cannot see.
    fixed = build_pool(this_year - 1)
    growth = {}
    for p in fixed:
        for k in range(4, 13):
            if k in p["series"] and k - 1 in p["series"] and p["series"][k - 1] >= 5:
                growth.setdefault(p["start"] + k, []).append(p["series"][k] / p["series"][k - 1])
    era = {y: round(statistics.median(v), 3) for y, v in sorted(growth.items()) if len(v) >= 20}
    print("median year-on-year growth, fixed peers, by calendar year:", era)
    last_year = this_year - 1
    while last_year - 1 in era and last_year in era and era[last_year] < 1.0 <= era[last_year - 1]:
        last_year -= 1
    print("last complete year used:", last_year)

    pool = build_pool(last_year)
    print(f"eligible peers (start {START_MIN}+, anchor >= {ANCHOR_MIN} citations): {len(pool)}")

    hist = {int(r["year"]): r["citations"] for r in scholar["citationsByYear"]}
    fraction = as_of.timetuple().tm_yday / (366 if as_of.year % 4 == 0 else 365)
    ytd = hist.get(this_year, 0)
    nowcast = max(ytd, round(ytd / fraction))
    subj = {y - CAREER_START: c for y, c in hist.items() if y < this_year}
    subj.setdefault(0, 0)
    subj.setdefault(1, 0)
    subj[ANCHOR_K] = nowcast
    shape, _ = features(subj)
    subject_f = (shape, math.log(nowcast * OA_SCALE))
    print(f"nowcast {this_year}: {ytd} so far as of {as_of} -> {nowcast} full year")

    def neighbours(target_f, exclude=None):
        k = min(NEIGHBOURS, max(30, len(pool) // 4))
        ranked = sorted((p for p in pool if p is not exclude), key=lambda p: distance(p["f"], target_f))
        return ranked[:k]

    def ratios(peers, h):
        return [p["series"][ANCHOR_K + h] / p["series"][ANCHOR_K] for p in peers]

    # Leave-one-out backtest: each peer forecast from its own nearest neighbours.
    cases = {h: [] for h in HORIZONS}
    for p in pool:
        nb = neighbours(p["f"], exclude=p)
        for h in HORIZONS:
            cases[h].append((ratios(nb, h), p["series"][ANCHOR_K + h] / p["series"][ANCHOR_K]))

    def coverage(h, tail, widen=1.0):
        hits = sum(band(rs, tail, widen)[0] <= a <= band(rs, tail, widen)[2] for rs, a in cases[h])
        return hits / len(cases[h])

    bt = {}
    for h in HORIZONS:
        w = {}
        for name, tail, nominal in (("inner", 0.25, 0.50), ("outer", 0.10, 0.80)):
            widen = 1.0
            while coverage(h, tail, widen) < nominal - 0.005 and widen < 4:
                widen += 0.05
            w[name] = (round(widen, 2), coverage(h, tail, 1.0), coverage(h, tail, widen))
        err = statistics.median(abs(math.log(band(rs)[1]) - math.log(max(a, 1e-3))) for rs, a in cases[h])
        bt[h] = (w, err)
        print(f"h={h}: 50% band held {w['inner'][1]:.0%} (x{w['inner'][0]} -> {w['inner'][2]:.0%}), "
              f"80% band held {w['outer'][1]:.0%} (x{w['outer'][0]} -> {w['outer'][2]:.0%}), median |log err| {err:.2f}")

    groups = {}
    for p in pool:
        groups.setdefault("2009-2011" if p["start"] <= 2011 else "2012+", []).append(
            p["series"][ANCHOR_K + max_h] / p["series"][ANCHOR_K])
    for g, rs in sorted(groups.items()):
        print(f"start {g}: n={len(rs)} median {max_h}-year ratio {statistics.median(rs):.2f}")

    nb = neighbours(subject_f)
    years = []
    for h in HORIZONS:
        w, _ = bt[h]
        lo, mid, hi = band(ratios(nb, h), 0.10, w["outer"][0])
        ilo, _, ihi = band(ratios(nb, h), 0.25, w["inner"][0])
        years.append({"year": this_year + h, "low": round(lo, 3), "innerLow": round(ilo, 3), "mid": round(mid, 3),
                      "innerHigh": round(ihi, 3), "high": round(hi, 3)})
        print(f"{this_year + h}: 80% {nowcast * lo:.0f}-{nowcast * hi:.0f}, 50% {nowcast * ilo:.0f}-{nowcast * ihi:.0f}, "
              f"median {nowcast * mid:.0f}")

    # Anonymous peer paths for the 3D fan: each matched peer's career years 2-10 as a ratio to its own anchor year.
    rng = random.Random(SEED)
    paths = [[round(p["series"].get(k, 0) / p["series"][ANCHOR_K], 3) for k in range(2, ANCHOR_K + max_h + 1)]
             for p in nb]
    rng.shuffle(paths)

    out = {
        "generated": dt.date.today().isoformat(),
        "source": "OpenAlex author records, seeded random sample",
        "topics": list(TOPICS.values()),
        "asOf": as_of.isoformat(),
        "anchor": {"year": this_year, "soFar": ytd, "fullYear": nowcast},
        "cohort": {"sampled": len(authors), "eligible": len(pool), "neighbours": len(nb)},
        "years": years,
        "peerPaths": {"fromYear": CAREER_START + 2, "paths": paths},
        "backtest": {
            "cases": len(pool),
            "inner": {str(this_year + h): round(bt[h][0]["inner"][2], 3) for h in HORIZONS},
            "outer": {str(this_year + h): round(bt[h][0]["outer"][2], 3) for h in HORIZONS},
            "medianAbsLogError": {str(this_year + h): round(bt[h][1], 3) for h in HORIZONS},
        },
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
