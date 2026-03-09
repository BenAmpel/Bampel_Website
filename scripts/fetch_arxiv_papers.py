"""
Fetch recent arXiv preprints relevant to Dr. Ampel's research domains and save to
static/data/arxiv_papers.json for the arxiv_radar shortcode.

Run: python scripts/fetch_arxiv_papers.py

Fetches papers from the last 60 days and scores them by keyword relevance.
arXiv API docs: https://info.arxiv.org/help/api/index.html
"""
import json
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "arxiv_papers.json"

ARXIV_API = "https://export.arxiv.org/api/query"

# arXiv category + keyword search
SEARCH_QUERY = (
    "(cat:cs.CR OR cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR cat:cs.SI) AND "
    "(all:\"large language model\" OR all:cybersecurity OR all:phishing "
    "OR all:\"dark web\" OR all:\"threat intelligence\" OR all:vulnerability "
    "OR all:malware OR all:\"multi-agent\" OR all:\"generative ai\" OR all:agentic)"
)

MAX_RESULTS  = 60    # fetch this many, then score + filter
DAYS_BACK    = 60    # only include papers from the last N days
TOP_N        = 20    # final papers to keep

# Relevance keyword groups matching Dr. Ampel's research
KEYWORD_GROUPS = [
    {"label": "LLM / GenAI",    "terms": ["large language model", "llm", "generative ai", "gpt", "llama"]},
    {"label": "Cybersecurity",  "terms": ["cybersecurity", "cyber security", "information security"]},
    {"label": "Phishing",       "terms": ["phishing", "spear phishing", "email fraud", "vishing"]},
    {"label": "Dark Web",       "terms": ["dark web", "darknet", "hacker forum", "underground forum"]},
    {"label": "Threat Intel",   "terms": ["threat intelligence", "threat detection", "mitre att&ck", "threat hunting"]},
    {"label": "Vulnerability",  "terms": ["vulnerability", "exploit", "cve", "zero-day", "patch"]},
    {"label": "Malware",        "terms": ["malware", "ransomware", "botnet", "trojan", "spyware"]},
    {"label": "Multi-Agent AI", "terms": ["multi-agent", "agentic ai", "autonomous agent", "ai agent"]},
]
ALL_TERMS = [t for g in KEYWORD_GROUPS for t in g["terms"]]

NS = {"atom": "http://www.w3.org/2005/Atom",
      "arxiv": "http://arxiv.org/schemas/atom"}


def score_text(text):
    lower = text.lower()
    return sum(1 for t in ALL_TERMS if t in lower)


def score_entry(title, summary):
    return score_text(title) * 3 + score_text(summary)


def fetch_arxiv():
    params = urllib.parse.urlencode({
        "search_query": SEARCH_QUERY,
        "start":        0,
        "max_results":  MAX_RESULTS,
        "sortBy":       "submittedDate",
        "sortOrder":    "descending",
    })
    url = f"{ARXIV_API}?{params}"
    print(f"Fetching: {url[:100]}...")
    req = urllib.request.Request(url, headers={"User-Agent": "BampelWebsite/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def parse_arxiv_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)
    entries = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)

    for entry in root.findall("atom:entry", NS):
        title   = (entry.findtext("atom:title", "", NS) or "").replace("\n", " ").strip()
        summary = (entry.findtext("atom:summary", "", NS) or "").replace("\n", " ").strip()
        published_str = (entry.findtext("atom:published", "", NS) or "").strip()
        link    = ""
        for lnk in entry.findall("atom:link", NS):
            if lnk.get("type") == "text/html":
                link = lnk.get("href", "")
                break
        if not link:
            alt = entry.find("atom:link", NS)
            if alt is not None:
                link = alt.get("href", "")

        authors = [
            (a.findtext("atom:name", "", NS) or "").strip()
            for a in entry.findall("atom:author", NS)
        ]
        cats = [
            c.get("term", "")
            for c in entry.findall("atom:category", NS)
            if c.get("term", "")
        ]

        # Date filter
        if published_str:
            try:
                pub_dt = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
                if pub_dt < cutoff:
                    continue
            except ValueError:
                pass

        entries.append({
            "title":     title,
            "summary":   summary,
            "published": published_str,
            "link":      link,
            "authors":   authors,
            "cats":      cats,
        })

    return entries


def main():
    print("=== Fetch arXiv Papers ===")
    xml_bytes = fetch_arxiv()
    entries   = parse_arxiv_xml(xml_bytes)
    print(f"Parsed {len(entries)} entries within last {DAYS_BACK} days.")

    # Score and filter
    for e in entries:
        e["score"] = score_entry(e["title"], e["summary"])

    scored = [e for e in entries if e["score"] > 0]
    scored.sort(key=lambda e: e["score"], reverse=True)
    top = scored[:TOP_N]

    # Strip internal score field from output
    for e in top:
        del e["score"]

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "days_back":    DAYS_BACK,
        "papers":       top,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved {len(top)} papers to {OUTPUT_FILE}")
    for e in top[:5]:
        print(f"  [{e['published'][:10]}] {e['title'][:70]}")


if __name__ == "__main__":
    main()
