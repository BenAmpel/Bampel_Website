"""
fetch_dimensions_metrics.py
Weekly citation counts for every publication DOI, from the keyless Dimensions Metrics API
(https://metrics-api.dimensions.ai/doi/<doi>). Writes data/dimensions.json, which the attention note
(layouts/partials/media/attention_note.html) renders at build time.

Dimensions allows showing metrics for one's own work, at no more than one request per second, with a link to
dimensions.ai on the page (see docs/media-tracker/attention-sources.md). A failed fetch is never written as 0:
the DOI keeps its last value for up to 14 days, and the file is left untouched when fewer than half succeed.
Network errors never fail the run, so a Dimensions outage cannot block the weekly metrics commit.
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fetch_opencitations import load_doi_map

ROOT        = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "data" / "dimensions.json"

API_BASE   = "https://metrics-api.dimensions.ai/doi/"
USER_AGENT = "bampel.com-metrics/1 (+https://bampel.com; bampel@gsu.edu)"
DELAY_SECS = 1.1          # Dimensions terms: at most one request per second
TIMEOUT    = 20
KEEP_DAYS  = 14           # how long a failed DOI keeps its last value

DOI_RE   = re.compile(r"^10\.\d{4,9}/\S+$")
ARXIV    = "10.48550/"
TS_FMT   = "%Y-%m-%dT%H:%M:%SZ"


def _norm_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def select_dois(doi_map: dict) -> list:
    """Valid, lower-cased, de-duplicated DOIs. An arXiv DOI is dropped only when a non-arXiv DOI has the same title.

    load_doi_map() turns `doi: ''` into the key "'", so every key is validated here."""
    titles = {}
    for raw, title in doi_map.items():
        doi = (raw or "").strip().strip("'\"").strip().lower()
        if DOI_RE.match(doi) and doi not in titles:
            titles[doi] = _norm_title(title)

    published_titles = {t for d, t in titles.items() if not d.startswith(ARXIV) and t}
    return sorted(d for d, t in titles.items() if not (d.startswith(ARXIV) and t in published_titles))


def fetch_times_cited(doi: str):
    """times_cited for one DOI, or None on any failure."""
    req = urllib.request.Request(API_BASE + doi, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            if resp.status != 200:
                return None
            value = json.loads(resp.read()).get("times_cited")
    except Exception as exc:
        print(f"  {doi}: {exc}")
        return None
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def merge(previous: dict, selected: list, results: dict, now: datetime):
    """New file contents, or None when fewer than half of the selected DOIs succeeded (keep the old file)."""
    succeeded = sum(1 for d in selected if results.get(d) is not None)
    if not selected or succeeded * 2 < len(selected):
        return None

    stamp   = now.strftime(TS_FMT)
    old     = (previous or {}).get("per_doi", {})
    per_doi = {}
    for doi in selected:
        cited = results.get(doi)
        if cited is not None:
            per_doi[doi] = {"times_cited": cited, "fetched_at": stamp}
            continue
        entry = old.get(doi)
        if entry and isinstance(entry.get("times_cited"), int):
            try:
                fetched = datetime.strptime(entry["fetched_at"], TS_FMT).replace(tzinfo=timezone.utc)
            except (KeyError, ValueError):
                continue
            if now - fetched <= timedelta(days=KEEP_DAYS):
                per_doi[doi] = entry

    return {
        "generated_at":    stamp,
        "source":          "Dimensions Metrics API",
        "papers_with_doi": len(selected),
        "papers_counted":  len(per_doi),
        "citations_sum":   sum(e["times_cited"] for e in per_doi.values()),
        "per_doi":         per_doi,
    }


def main(output_file: Path = OUTPUT_FILE) -> int:
    selected = select_dois(load_doi_map())
    if not selected:
        print("No publication DOIs found; leaving data/dimensions.json untouched.")
        return 1

    print(f"Fetching Dimensions metrics for {len(selected)} DOIs")
    results = {}
    for i, doi in enumerate(selected):
        if i:
            time.sleep(DELAY_SECS)
        results[doi] = fetch_times_cited(doi)

    previous = {}
    if output_file.exists():
        try:
            previous = json.loads(output_file.read_text(encoding="utf-8"))
        except ValueError:
            previous = {}

    data = merge(previous, selected, results, datetime.now(timezone.utc))
    ok = sum(1 for v in results.values() if v is not None)
    if data is None:
        print(f"Only {ok} of {len(selected)} DOIs answered; keeping the existing file.")
        return 0

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"{ok} of {len(selected)} answered; {data['citations_sum']} citations across "
          f"{data['papers_counted']} papers -> {output_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
