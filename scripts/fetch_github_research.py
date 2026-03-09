"""
Fetch trending/starred GitHub repositories in Dr. Ampel's research domains
and save to static/data/github_research.json for the github_research shortcode.

Run: python scripts/fetch_github_research.py

Uses GitHub Search API (no auth required for basic use; GITHUB_TOKEN env var
used if set, for higher rate limits).
"""
import json
import os
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

ROOT        = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "static" / "data" / "github_research.json"

GH_API = "https://api.github.com/search/repositories"

# Topic-based searches targeting specific research niches
TOPIC_QUERIES = [
    "topic:threat-intelligence",
    "topic:phishing topic:detection",
    "topic:dark-web",
    "topic:vulnerability-scanner",
    "topic:malware-analysis",
    "topic:network-security",
]

# Keyword-based searches for research-oriented repos
KEYWORD_QUERIES = [
    "cybersecurity LLM tool NOT awesome in:name,description language:Python",
    "threat intelligence framework NOT awesome in:description language:Python",
    "phishing detection machine learning in:description",
    "dark web crawler analysis in:description language:Python",
    "malware classification deep learning in:description",
    "intrusion detection neural network in:description",
]

RESULTS_PER_QUERY = 10
TOP_N             = 25
DELAY_SECS        = 1.5   # GitHub rate limits without auth: 10 req/min

# Only repos updated in the last year
MIN_PUSHED = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
MIN_STARS   = 15   # filter noise; raise threshold to avoid "awesome-X" lists

# Terms that indicate non-research repos to exclude
EXCLUDE_TERMS = {"awesome-", "learning-resource", "cheatsheet", "interview", "certification"}


def _headers() -> dict:
    h = {
        "Accept":     "application/vnd.github+json",
        "User-Agent": "BampelWebsite/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def fetch_repos(q: str, sort: str = "stars") -> list:
    full_q = f"{q} pushed:>{MIN_PUSHED}"
    params = urllib.parse.urlencode({
        "q":        full_q,
        "sort":     sort,
        "order":    "desc",
        "per_page": RESULTS_PER_QUERY,
    })
    url = f"{GH_API}?{params}"
    try:
        req = urllib.request.Request(url, headers=_headers())
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        items = d.get("items") or []
        return [
            i for i in items
            if i.get("stargazers_count", 0) >= MIN_STARS
            and not any(ex in (i.get("name") or "").lower() for ex in EXCLUDE_TERMS)
            and not any(ex in (i.get("description") or "").lower() for ex in EXCLUDE_TERMS)
        ]
    except Exception as e:
        print(f"  Warning [{q[:50]}]: {e}")
        return []


def normalize(raw: dict) -> dict:
    return {
        "name":        raw.get("name", ""),
        "full_name":   raw.get("full_name", ""),
        "description": (raw.get("description") or "").strip(),
        "stars":       raw.get("stargazers_count", 0),
        "forks":       raw.get("forks_count", 0),
        "language":    raw.get("language") or "",
        "topics":      (raw.get("topics") or [])[:5],
        "url":         raw.get("html_url", ""),
        "pushed_at":   (raw.get("pushed_at") or "")[:10],
    }


def main():
    print("=== Fetching GitHub Research Repos ===")
    seen: dict = {}

    all_queries = TOPIC_QUERIES + KEYWORD_QUERIES
    for q in all_queries:
        print(f"  Searching: \"{q[:60]}\"")
        for raw in fetch_repos(q):
            full_name = raw.get("full_name", "")
            if full_name and full_name not in seen:
                seen[full_name] = normalize(raw)
        time.sleep(DELAY_SECS)

    repos = sorted(seen.values(), key=lambda r: r.get("stars", 0), reverse=True)
    top   = repos[:TOP_N]

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "repos":        top,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(top)} repos to {OUTPUT_FILE}")
    for r in top[:5]:
        print(f"  [⭐{r.get('stars',0):>6}] {r['full_name'][:50]}  {r.get('language','')}")


if __name__ == "__main__":
    main()
