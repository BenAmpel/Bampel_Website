"""
Fetch NSF awards relevant to Dr. Ampel's research domains and save to
static/data/nsf_grants.json for the nsf_grants shortcode.

Run: python scripts/fetch_nsf_grants.py

Refreshes the grant data — run whenever you want updated results.
NSF Awards API docs: https://resources.research.gov/common/webapi/awardapisearch-v1.htm
"""
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path

SCRIPT_DIR  = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "nsf_grants.json"

NSF_API = "https://api.nsf.gov/services/v1/awards.json"

# Keywords to search — broad enough to surface relevant grants
SEARCH_KEYWORDS = [
    "cybersecurity artificial intelligence",
    "large language model security",
    "threat intelligence machine learning",
    "phishing detection",
    "dark web",
    "vulnerability detection",
    "natural language processing cybersecurity",
]

# Primary (high-signal) terms — must match at least one to be included
PRIMARY_TERMS = [
    "cybersecurity", "cyber security", "information security",
    "phishing", "spear phishing",
    "dark web", "darknet", "hacker forum",
    "threat intelligence", "threat detection", "threat hunting",
    "malware", "ransomware", "botnet", "intrusion detection",
    "network security", "social engineering",
    "cyber threat", "cyber attack",
    "large language model", "llm security",
    "security vulnerability", "software vulnerability", "cve", "zero-day",
]

# Secondary terms — add score weight but not required alone
SECONDARY_TERMS = [
    "generative ai", "chatgpt", "gpt-4",
    "exploit", "patch management",
    "deep learning", "neural network", "transformer", "bert",
    "natural language processing", "nlp",
    "multi-agent", "agentic", "autonomous agent",
    "network intrusion", "anomaly detection",
]

# Combined for scoring
RELEVANCE_TERMS = PRIMARY_TERMS + SECONDARY_TERMS

RESULTS_PER_KEYWORD = 25   # NSF API max per page
TOP_N               = 20   # Final grants to keep
DELAY_SECS          = 1.2  # Polite delay between API calls

# Only include awards from this year onward
MIN_YEAR = 2022

# Fields to request from NSF API
PRINT_FIELDS = ",".join([
    "id", "title",
    "piFirstName", "piLastName",
    "awardeeName",
    "estimatedTotalAmt",
    "startDate", "expDate",
    "abstractText",
    "primaryProgram",
])


def score_grant(grant):
    text = f"{grant.get('title', '')} {grant.get('abstractText', '')}".lower()
    primary_hits = sum(1 for t in PRIMARY_TERMS if t in text)
    secondary_hits = sum(1 for t in SECONDARY_TERMS if t in text)
    # Must have at least one primary hit to count as relevant
    if primary_hits == 0:
        return 0
    return primary_hits * 3 + secondary_hits


def parse_year(date_str):
    """Extract year from MM/DD/YYYY NSF date string."""
    if not date_str:
        return 0
    parts = date_str.split("/")
    if len(parts) == 3:
        try:
            return int(parts[2])
        except ValueError:
            pass
    return 0


def fetch_keyword(keyword):
    params = urllib.parse.urlencode({
        "keyword":     keyword,
        "rpp":         RESULTS_PER_KEYWORD,
        "offset":      1,
        "dateStart":   f"01/01/{MIN_YEAR}",
        "printFields": PRINT_FIELDS,
    })
    url = f"{NSF_API}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "BampelWebsite/1.0"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        return data.get("response", {}).get("award", []) or []
    except Exception as e:
        print(f"  Warning [{keyword}]: {e}")
        return []


def normalize(raw):
    award_id = raw.get("id", "")
    return {
        "title":              raw.get("title", "").strip(),
        "awardId":            award_id,
        "piName":             f"{raw.get('piFirstName', '')} {raw.get('piLastName', '')}".strip(),
        "institution":        raw.get("awardeeName", "").strip(),
        "estimatedTotalAmt":  raw.get("estimatedTotalAmt", 0),
        "startDate":          raw.get("startDate", ""),
        "expDate":            raw.get("expDate", ""),
        "abstractText":       raw.get("abstractText", "").strip(),
        "primaryProgram":     raw.get("primaryProgram", ""),
        "nsf_url":            f"https://www.nsf.gov/awardsearch/showAward?AWD_ID={award_id}",
        "keywords":           [],  # will be filled below
    }


def tag_keywords(grant):
    """Attach matched high-level keyword labels to each grant for display."""
    labels = {
        "LLM / GenAI":     ["llm", "large language model", "generative ai"],
        "Cybersecurity":   ["cybersecurity", "cyber security", "information security", "network security"],
        "Phishing":        ["phishing"],
        "Dark Web":        ["dark web", "darknet", "hacker forum"],
        "Threat Intel":    ["threat intelligence", "threat detection"],
        "Vulnerability":   ["vulnerability", "exploit", "cve"],
        "Malware":         ["malware", "ransomware", "botnet"],
        "Deep Learning":   ["deep learning", "neural network", "transformer"],
        "NLP":             ["natural language processing", "nlp"],
        "Multi-Agent AI":  ["multi-agent", "agentic"],
    }
    text = f"{grant.get('title', '')} {grant.get('abstractText', '')}".lower()
    matched = [label for label, terms in labels.items() if any(t in text for t in terms)]
    grant["keywords"] = matched[:4]  # cap for display
    return grant


def main():
    print("=== Fetching NSF Grants ===")
    seen   = {}  # awardId -> normalized grant
    total_fetched = 0

    for kw in SEARCH_KEYWORDS:
        print(f"  Searching: \"{kw}\"")
        awards = fetch_keyword(kw)
        total_fetched += len(awards)
        for raw in awards:
            aid = raw.get("id", "")
            if aid and aid not in seen:
                # Filter out very old awards
                if parse_year(raw.get("expDate", "")) < MIN_YEAR:
                    continue
                seen[aid] = normalize(raw)
        time.sleep(DELAY_SECS)

    print(f"\nFetched {total_fetched} raw results → {len(seen)} unique awards after dedup.")

    grants = list(seen.values())
    # Score and tag
    for g in grants:
        g["_score"] = score_grant(g)
        tag_keywords(g)

    # Filter out grants with zero primary relevance
    grants = [g for g in grants if g["_score"] > 0]
    print(f"After relevance filter: {len(grants)} grants with at least one primary keyword match.")

    # Sort by relevance score, then by start date descending
    grants.sort(key=lambda g: (g["_score"], parse_year(g.get("startDate", ""))), reverse=True)
    top = grants[:TOP_N]
    for g in top:
        del g["_score"]  # clean up internal field

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "grants":       top,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Saved {len(top)} grants to {OUTPUT_FILE}")
    for g in top[:5]:
        amt = int(g.get('estimatedTotalAmt', 0) or 0)
        print(f"  [${amt:>12,}] {g['title'][:70]}")


if __name__ == "__main__":
    main()
