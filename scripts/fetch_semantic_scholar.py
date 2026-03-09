"""
Fetch Semantic Scholar data for Dr. Ampel's publications:
  - Papers that recently cited his work
  - Recommended papers similar to his portfolio

Saves results to static/data/semantic_scholar.json for the semantic_scholar shortcode.

Run: python scripts/fetch_semantic_scholar.py

Refreshes the data — run whenever you want updated results (e.g., monthly).
S2 API docs: https://api.semanticscholar.org/api-docs/
"""
import json
import time
import urllib.request
import urllib.parse
from datetime import date
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent
PUBS_FILE   = SCRIPT_DIR.parent / "static" / "data" / "publications.json"
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "semantic_scholar.json"

S2_GRAPH = "https://api.semanticscholar.org/graph/v1"
S2_REC   = "https://api.semanticscholar.org/recommendations/v1"

DELAY_SECS = 1.5        # polite delay between API calls (free tier, ~1 req/s limit)
CURRENT_YEAR = date.today().year
CITATION_CUTOFF_YEAR = CURRENT_YEAR - 2   # only citations from this year or newer
MAX_PAPERS_FOR_IDS = 20   # search S2 IDs for the N most recent publications
MAX_PAPERS_FOR_CITATIONS = 8   # get citations for the top N by recency
MAX_CITATIONS = 20
MAX_RECOMMENDATIONS = 15

PAPER_SEARCH_FIELDS = "paperId,title,year"
CITATION_FIELDS     = "title,year,authors,venue,externalIds"
REC_FIELDS          = "title,year,authors,venue,externalIds"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _headers():
    return {
        "User-Agent": "BampelWebsite/1.0 (academic portfolio; contact: bampel@gsu.edu)",
        "Accept":     "application/json",
    }


def safe_get(url):
    try:
        req = urllib.request.Request(url, headers=_headers())
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  GET error ({url[:80]}): {e}")
        return None


def safe_post(url, payload):
    try:
        body = json.dumps(payload).encode()
        headers = {**_headers(), "Content-Type": "application/json"}
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  POST error ({url[:80]}): {e}")
        return None


# ---------------------------------------------------------------------------
# Core API calls
# ---------------------------------------------------------------------------

def find_s2_paper_id(title):
    """Return Semantic Scholar paperId for a paper given its title, or None."""
    query = urllib.parse.quote(title)
    url   = f"{S2_GRAPH}/paper/search?query={query}&fields={PAPER_SEARCH_FIELDS}&limit=5"
    res   = safe_get(url)
    time.sleep(DELAY_SECS)
    if not res or not res.get("data"):
        return None

    # Pick the best match by word-overlap similarity
    target_words = set(title.lower().split())
    best_id, best_overlap = None, 0.0
    for paper in res["data"]:
        s2_words = set((paper.get("title") or "").lower().split())
        overlap  = len(target_words & s2_words) / max(len(target_words), 1)
        if overlap > best_overlap:
            best_overlap = overlap
            best_id      = paper["paperId"]

    return best_id if best_overlap >= 0.6 else None


def get_citations_for_paper(paper_id, cited_title):
    """Return a list of recent papers that cited `paper_id`."""
    url = (f"{S2_GRAPH}/paper/{paper_id}/citations"
           f"?fields={CITATION_FIELDS}&limit=100")
    res = safe_get(url)
    time.sleep(DELAY_SECS)
    if not res:
        return []

    results = []
    for item in res.get("data", []):
        cp   = item.get("citingPaper") or {}
        year = cp.get("year")
        if year and year < CITATION_CUTOFF_YEAR:
            continue
        results.append(_format_paper(cp, cited_paper=cited_title))

    return results


def get_recommendations(positive_ids):
    """Return recommended papers given a list of positive paperId seeds."""
    if not positive_ids:
        return []
    url     = f"{S2_REC}/papers?fields={REC_FIELDS}&limit=25"
    payload = {"positivePaperIds": positive_ids[:20], "negativePaperIds": []}
    res     = safe_post(url, payload)
    time.sleep(DELAY_SECS)
    if not res:
        return []
    return [_format_paper(p) for p in res.get("recommendedPapers", [])]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _paper_url(paper):
    ext = paper.get("externalIds") or {}
    if ext.get("DOI"):
        return f"https://doi.org/{ext['DOI']}"
    if ext.get("ArXiv"):
        return f"https://arxiv.org/abs/{ext['ArXiv']}"
    return ""


def _format_paper(paper, cited_paper=None):
    authors = [a.get("name", "") for a in (paper.get("authors") or [])[:4]]
    entry   = {
        "title":   (paper.get("title") or "").strip(),
        "authors": authors,
        "year":    paper.get("year"),
        "venue":   (paper.get("venue") or "").strip(),
        "url":     _paper_url(paper),
    }
    if cited_paper is not None:
        entry["cited_paper"] = cited_paper
    return entry


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== Fetch Semantic Scholar Data ===")

    # Load publications
    with open(PUBS_FILE) as f:
        pubs = json.load(f)

    # Prioritise recent publications (better S2 coverage)
    pubs_sorted = sorted(pubs, key=lambda p: p.get("year", 0), reverse=True)
    target_pubs = pubs_sorted[:MAX_PAPERS_FOR_IDS]

    # --- Step 1: Find S2 paper IDs ---
    print(f"\nSearching S2 IDs for {len(target_pubs)} papers…")
    paper_ids = []  # list of (paperId, title)
    for pub in target_pubs:
        title = pub["title"]
        short = title[:60]
        print(f"  Searching: {short}…")
        pid = find_s2_paper_id(title)
        if pid:
            paper_ids.append((pid, title))
            print(f"    → {pid}")
        else:
            print("    → not found")

    print(f"\nResolved {len(paper_ids)} / {len(target_pubs)} papers.")

    # --- Step 2: Get citations ---
    print(f"\nFetching citations for top {MAX_PAPERS_FOR_CITATIONS} papers…")
    all_citations  = []
    seen_cit_titles = set()

    for pid, cited_title in paper_ids[:MAX_PAPERS_FOR_CITATIONS]:
        short = cited_title[:55]
        print(f"  Citations for: {short}…")
        cits = get_citations_for_paper(pid, cited_title)
        for c in cits:
            key = c["title"].lower().strip()
            if key and key not in seen_cit_titles:
                seen_cit_titles.add(key)
                all_citations.append(c)
        print(f"    → {len(cits)} new citations")

    # Sort by year descending, keep top N
    all_citations.sort(key=lambda c: c.get("year") or 0, reverse=True)
    top_citations = all_citations[:MAX_CITATIONS]

    print(f"\nTotal unique citations (≥ {CITATION_CUTOFF_YEAR}): {len(all_citations)} → keeping {len(top_citations)}")

    # --- Step 3: Get recommendations ---
    print("\nFetching paper recommendations…")
    ids_only = [pid for pid, _ in paper_ids]
    recs     = get_recommendations(ids_only)

    # Filter out Dr. Ampel's own papers
    own_titles = {p["title"].lower().strip() for p in pubs}
    recs = [r for r in recs if r["title"].lower().strip() not in own_titles]
    top_recs = recs[:MAX_RECOMMENDATIONS]
    print(f"Recommendations: {len(top_recs)}")

    # --- Write output ---
    output = {
        "refreshed":       date.today().isoformat(),
        "citations":       top_citations,
        "recommendations": top_recs,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {OUTPUT_FILE}")
    print(f"  Citations:       {len(top_citations)}")
    print(f"  Recommendations: {len(top_recs)}")


if __name__ == "__main__":
    main()
