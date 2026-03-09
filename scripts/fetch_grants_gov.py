"""
Fetch open federal grant opportunities from Grants.gov relevant to Dr. Ampel's
research and save to static/data/grants_gov.json for the grants_gov shortcode.

Run: python scripts/fetch_grants_gov.py

Unlike fetch_nsf_grants.py (which shows awarded NSF grants), this script finds
*open* funding opportunities across all federal agencies that Dr. Ampel could
apply for.  Grants.gov REST API — no key required.
"""
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path

ROOT        = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "static" / "data" / "grants_gov.json"

GRANTS_GOV_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search/"

# Keywords to search across Grants.gov
SEARCH_KEYWORDS = [
    "cybersecurity artificial intelligence",
    "large language model security",
    "threat intelligence",
    "phishing dark web",
    "information security machine learning",
    "cyber threat detection",
]

# Primary relevance terms (at least one required)
PRIMARY_TERMS = [
    "cybersecurity", "cyber security", "information security",
    "phishing", "dark web", "threat intelligence", "threat detection",
    "malware", "intrusion detection", "network security",
    "large language model", "llm", "generative ai",
    "vulnerability", "exploit",
]

# Secondary terms for bonus scoring
SECONDARY_TERMS = [
    "machine learning", "deep learning", "neural network",
    "natural language processing", "nlp", "transformer",
    "artificial intelligence", "anomaly detection",
    "hacker", "cyber attack", "ransomware", "botnet",
]

RESULTS_PER_KEYWORD = 20
TOP_N               = 20
DELAY_SECS          = 1.2

# Only show currently open/active opportunities
VALID_STATUSES = {"posted", "forecasted"}


def fetch_keyword(keyword: str) -> list:
    payload = json.dumps({
        "keyword":        keyword,
        "rows":           RESULTS_PER_KEYWORD,
        "startRecordNum": 0,
        "oppStatuses":    "posted|forecasted",
    }).encode()
    req = urllib.request.Request(
        GRANTS_GOV_API,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent":   "BampelWebsite/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        return d.get("oppHits") or []
    except Exception as e:
        print(f"  Warning [{keyword}]: {e}")
        return []


def score_opp(opp: dict) -> int:
    # Grants.gov basic search only returns title — score on title only.
    # We already query domain-specific keywords, so any term match is relevant.
    text = (opp.get("title") or "").lower()
    primary_hits   = sum(1 for t in PRIMARY_TERMS   if t in text)
    secondary_hits = sum(1 for t in SECONDARY_TERMS if t in text)
    if primary_hits + secondary_hits == 0:
        return 0
    return primary_hits * 3 + secondary_hits + 1


def parse_date(date_str: str) -> str:
    """Convert MM/DD/YYYY → YYYY-MM-DD for sorting."""
    if not date_str:
        return ""
    parts = date_str.split("/")
    if len(parts) == 3:
        try:
            return f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
        except Exception:
            pass
    return date_str


def normalize(raw: dict) -> dict:
    opp_id = raw.get("id") or raw.get("number") or ""
    return {
        "title":        (raw.get("title") or "").strip(),
        "oppNumber":    raw.get("number") or "",
        "agency":       raw.get("agency") or raw.get("agencyCode") or "",
        "openDate":     raw.get("openDate") or "",
        "closeDate":    raw.get("closeDate") or "",
        "status":       raw.get("oppStatus") or "",
        "docType":      raw.get("docType") or "",
        "url":          f"https://www.grants.gov/search-results-detail/{opp_id}",
    }


def main():
    print("=== Fetching Grants.gov Opportunities ===")
    seen: dict = {}

    for kw in SEARCH_KEYWORDS:
        print(f"  Searching: \"{kw}\"")
        opps = fetch_keyword(kw)
        for raw in opps:
            key = raw.get("number") or raw.get("id") or raw.get("title", "")
            if key and key not in seen:
                if raw.get("oppStatus", "").lower() in VALID_STATUSES:
                    seen[key] = normalize(raw)
        time.sleep(DELAY_SECS)

    opps_list = list(seen.values())

    # Score and filter
    for o in opps_list:
        o["_score"] = score_opp(o)
    opps_list = [o for o in opps_list if o["_score"] > 0]

    # Sort by score desc, then close date asc (soonest deadline first)
    opps_list.sort(key=lambda o: (-o["_score"], parse_date(o.get("closeDate", ""))))
    top = opps_list[:TOP_N]
    for o in top:
        del o["_score"]

    output = {
        "refresh_date": datetime.now().strftime("%Y-%m-%d"),
        "opportunities": top,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved {len(top)} opportunities to {OUTPUT_FILE}")
    for o in top[:5]:
        print(f"  [{o.get('closeDate','?'):>12}] {o['title'][:65]}")


if __name__ == "__main__":
    main()
