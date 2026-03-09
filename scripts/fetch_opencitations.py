"""
Collect citations of Dr. Ampel's papers using OpenCitations (COCI) and resolve
citing DOIs to metadata via CrossRef.  Saves to static/data/opencitations.json.

Run: python scripts/fetch_opencitations.py

OpenCitations indexes open citation data.  No API key required.
CrossRef provides bibliographic metadata for cited works.
"""
import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path
from datetime import datetime

ROOT         = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "content"
OUTPUT_FILE  = ROOT / "static" / "data" / "opencitations.json"

OC_BASE    = "https://opencitations.net/index/coci/api/v1"
CR_BASE    = "https://api.crossref.org/works"
MAILTO     = "bampel@gsu.edu"

SECTION_DIRS = [
    "journal_publication",
    "conference_publication",
    "workshop_publication",
]

DELAY_SECS = 0.5   # polite delay between API calls
MAX_CITATIONS_PER_PAPER = 50   # fetch up to this many citing papers per DOI
TOP_CITING_TOTAL        = 30   # keep the most recent N across all papers


# ---------------------------------------------------------------------------
# Read DOIs from content dirs
# ---------------------------------------------------------------------------

def load_doi_map() -> dict:
    """Return {doi: paper_title} for all publications with a DOI."""
    doi_map = {}
    doi_re  = re.compile(r"^doi:\s*['\"]?(.+?)['\"]?\s*$", re.IGNORECASE)

    for section in SECTION_DIRS:
        for path in (CONTENT_ROOT / section).rglob("index.md"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if not text.startswith("---"):
                continue
            parts = text.split("---", 2)
            if len(parts) < 3:
                continue

            doi   = ""
            title = ""
            for line in parts[1].splitlines():
                m = doi_re.match(line)
                if m:
                    doi = m.group(1).strip()
                if line.strip().startswith("title:"):
                    title = line.split(":", 1)[1].strip().strip('"').strip("'")

            if doi and title and doi not in ("''", '""', ""):
                doi_map[doi] = title

    return doi_map


# ---------------------------------------------------------------------------
# OpenCitations: get citing DOIs
# ---------------------------------------------------------------------------

def fetch_citations(doi: str) -> list:
    """Return list of {citing, creation, timespan} dicts from COCI."""
    url = f"{OC_BASE}/citations/{urllib.parse.quote(doi, safe='')}?format=json&sort=desc(creation)"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        if isinstance(data, list):
            return data[:MAX_CITATIONS_PER_PAPER]
        return []
    except Exception as e:
        print(f"    OC error [{doi[:40]}]: {e}")
        return []


# ---------------------------------------------------------------------------
# CrossRef: resolve a DOI to bibliographic metadata
# ---------------------------------------------------------------------------

def fetch_crossref(doi: str) -> dict:
    url = f"{CR_BASE}/{urllib.parse.quote(doi, safe='')}?mailto={MAILTO}"
    req = urllib.request.Request(url, headers={"User-Agent": f"BampelWebsite/1.0 (mailto:{MAILTO})"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            msg = json.loads(r.read()).get("message", {})

        title = (msg.get("title") or [""])[0]
        year  = None
        for field in ("published", "published-print", "published-online"):
            dp = msg.get(field, {}).get("date-parts", [[None]])[0]
            if dp and dp[0]:
                year = dp[0]
                break

        authors = []
        for a in msg.get("author", [])[:4]:
            given  = (a.get("given") or "")[:1]
            family = a.get("family") or ""
            if family:
                authors.append(f"{given}. {family}" if given else family)

        venue = (
            (msg.get("container-title") or [""])[0]
            or (msg.get("short-container-title") or [""])[0]
        )

        return {
            "title":   title.strip(),
            "authors": authors,
            "year":    year,
            "venue":   venue.strip(),
            "doi":     doi,
            "url":     f"https://doi.org/{doi}",
        }
    except Exception as e:
        print(f"    CrossRef error [{doi[:40]}]: {e}")
        return {}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== Fetching OpenCitations Data ===")

    doi_map = load_doi_map()
    print(f"Found {len(doi_map)} papers with DOIs.\n")

    # Collect all citing DOIs with their context (which paper they cite)
    citing_events = []   # list of {citing_doi, cited_doi, cited_title, creation}

    for doi, paper_title in doi_map.items():
        print(f"  Fetching citations for: {paper_title[:55]}")
        cites = fetch_citations(doi)
        print(f"    → {len(cites)} citing papers")
        for c in cites:
            citing_doi = c.get("citing", "")
            if citing_doi:
                citing_events.append({
                    "citing_doi":   citing_doi.strip(),
                    "cited_doi":    doi,
                    "cited_title":  paper_title,
                    "creation":     c.get("creation", ""),
                })
        time.sleep(DELAY_SECS)

    # Deduplicate by citing_doi (a paper might cite multiple of Dr. Ampel's papers)
    seen_citing: dict = {}
    for ev in citing_events:
        cdoi = ev["citing_doi"]
        if cdoi not in seen_citing:
            seen_citing[cdoi] = ev
        # If already seen, append the second cited_title as additional context
        elif seen_citing[cdoi]["cited_doi"] != ev["cited_doi"]:
            seen_citing[cdoi]["also_cites"] = ev["cited_title"]

    # Sort by creation date desc (most recent first), take top N
    events_sorted = sorted(
        seen_citing.values(),
        key=lambda e: e.get("creation", ""),
        reverse=True,
    )[:TOP_CITING_TOTAL]

    print(f"\nResolving {len(events_sorted)} unique citing papers via CrossRef…")

    citations_out = []
    for ev in events_sorted:
        time.sleep(DELAY_SECS)
        meta = fetch_crossref(ev["citing_doi"])
        if not meta.get("title"):
            continue
        meta["cites_paper"]  = ev.get("cited_title", "")
        meta["also_cites"]   = ev.get("also_cites", "")
        meta["oc_creation"]  = ev.get("creation", "")
        citations_out.append(meta)

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "total_dois_checked": len(doi_map),
        "citations": citations_out,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(citations_out)} resolved citations to {OUTPUT_FILE}")
    for c in citations_out[:5]:
        print(f"  [{c.get('year','?')}] {c.get('title','?')[:60]}")


if __name__ == "__main__":
    main()
