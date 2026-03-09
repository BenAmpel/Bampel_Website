"""
Fetch recent high-impact papers in Dr. Ampel's research domains from OpenAlex
and save to static/data/openalex.json for the openalex shortcode.

Run: python scripts/fetch_openalex.py

OpenAlex is a free, open bibliographic database covering 250M+ works.
No API key required; provide an email for the polite pool.
"""
import json
import time
import urllib.request
import urllib.parse
from datetime import date, datetime
from pathlib import Path

ROOT        = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "static" / "data" / "openalex.json"

MAILTO = "bampel@gsu.edu"
BASE   = "https://api.openalex.org"

# Text-search queries covering Dr. Ampel's main domains
QUERIES = [
    "cybersecurity large language model",
    "threat intelligence machine learning",
    "phishing detection neural network",
    "dark web hacker forum analysis",
    "vulnerability detection deep learning",
    "information security generative AI",
    "LLM security attack defense",
]

RESULTS_PER_QUERY = 25
TOP_N             = 30
DELAY_SECS        = 0.4   # stay in polite pool

# Relevance filter: result TITLE must contain at least one of these terms
TITLE_TERMS = {
    "cybersecurity", "cyber security", "cyber-security",
    "phishing", "malware", "ransomware", "botnet",
    "threat intelligence", "threat detection", "intrusion detection",
    "dark web", "darknet", "hacker",
    "vulnerability", "exploit", "attack", "adversarial",
    "information security", "network security", "privacy",
    "llm", "large language model", "generative ai", "gpt",
    "deep learning", "neural network", "machine learning",
    "natural language processing", "nlp",
}


def fetch_works(query: str) -> list:
    this_year = date.today().year
    from_year = this_year - 2

    params = urllib.parse.urlencode({
        "search":    query,
        "filter":    f"publication_year:{from_year}-{this_year},is_retracted:false",
        "sort":      "cited_by_count:desc",
        "per_page":  RESULTS_PER_QUERY,
        "select":    ",".join([
            "id", "title", "authorships", "publication_year",
            "primary_location", "doi", "cited_by_count",
            "concepts", "abstract_inverted_index",
        ]),
        "mailto":    MAILTO,
    })
    url = f"{BASE}/works?{params}"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": f"BampelWebsite/1.0 (mailto:{MAILTO})"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read()).get("results", [])
    except Exception as e:
        print(f"  Warning [{query[:40]}]: {e}")
        return []


def reconstruct_abstract(inv_idx: dict) -> str:
    """OpenAlex stores abstracts as inverted index {word: [positions]}."""
    if not inv_idx:
        return ""
    words = {}
    for word, positions in inv_idx.items():
        for pos in positions:
            words[pos] = word
    return " ".join(words[k] for k in sorted(words))


def normalize(raw: dict) -> dict:
    authors = [
        a.get("author", {}).get("display_name", "")
        for a in raw.get("authorships", [])[:4]
        if a.get("author", {}).get("display_name")
    ]

    loc    = raw.get("primary_location") or {}
    source = loc.get("source") or {}
    venue  = source.get("display_name") or ""

    doi = raw.get("doi") or ""
    if doi.startswith("https://doi.org/"):
        doi = doi[16:]

    abstract = reconstruct_abstract(raw.get("abstract_inverted_index") or {})

    topics = [
        c["display_name"]
        for c in (raw.get("concepts") or [])
        if c.get("score", 0) > 0.4
    ][:4]

    return {
        "id":             raw.get("id", ""),
        "title":          (raw.get("title") or "").strip(),
        "authors":        authors,
        "year":           raw.get("publication_year"),
        "venue":          venue,
        "doi":            doi,
        "cited_by_count": raw.get("cited_by_count", 0),
        "topics":         topics,
        "url":            f"https://doi.org/{doi}" if doi else (raw.get("id") or ""),
        "abstract":       abstract[:300],
    }


def main():
    print("=== Fetching OpenAlex Papers ===")
    seen: dict = {}

    for q in QUERIES:
        print(f"  Searching: \"{q}\"")
        for raw in fetch_works(q):
            wid = raw.get("id", "")
            if wid and wid not in seen:
                seen[wid] = normalize(raw)
        time.sleep(DELAY_SECS)

    papers = list(seen.values())

    # Filter: title must contain at least one relevant domain term
    def is_relevant(p):
        title_lower = (p.get("title") or "").lower()
        return any(t in title_lower for t in TITLE_TERMS)

    papers = [p for p in papers if is_relevant(p)]
    papers.sort(key=lambda p: (p.get("cited_by_count", 0), p.get("year", 0)), reverse=True)
    top = papers[:TOP_N]

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "papers":       top,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(top)} papers to {OUTPUT_FILE}")
    for p in top[:5]:
        print(f"  [{p.get('cited_by_count', 0):>5} cites] {p['title'][:65]}")


if __name__ == "__main__":
    main()
