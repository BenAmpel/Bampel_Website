"""
Fetch per-paper citation data from a published Google Sheet CSV (Title + date
columns with citation counts), compute monthly citation deltas, match to local
publications.json, and write static/data/hot_papers.json for the frontend.
"""
import csv
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

# --- CONFIGURATION ---
# Per-paper sheet: first column = Title, remaining columns = dates with citation counts
CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxM6BBdrswiWbzNk4iJ_OCVCZIiJK8jj8Paz-MMUzji8AOHzU55dvK2jbJj6Yd1InMv-p__fPmZl8c/pub?gid=180149822&single=true&output=csv"

SCRIPT_DIR = Path(__file__).parent
PUBS_FILE = SCRIPT_DIR.parent / "static" / "data" / "publications.json"
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "hot_papers.json"

# Number of top papers by rolling citation growth to include
TOP_N = 3
# Rolling window: citations in the prior 8 weeks (latest snapshot minus 8 weeks ago)
ROLLING_WEEKS = 8

# Date column pattern (YYYY-MM-DD, optional trailing space)
DATE_COL_RE = re.compile(r"^\s*(\d{4}-\d{2}-\d{2})\s*$")


def parse_date_column(key):
    """Return (key, date) if key is a date column, else (key, None)."""
    m = DATE_COL_RE.match(key)
    if m:
        try:
            return (key.strip(), datetime.strptime(m.group(1), "%Y-%m-%d").date())
        except ValueError:
            pass
    return (key.strip(), None)


def safe_float(val):
    try:
        return float(val) if val else 0.0
    except (TypeError, ValueError):
        return 0.0


def fetch_hot_papers():
    print("Fetching live data from Google Sheets...")

    try:
        with urllib.request.urlopen(CSV_URL) as response:
            lines = [line.decode("utf-8") for line in response.readlines()]

        reader = csv.DictReader(lines, skipinitialspace=True)
        rows = list(reader)

        if not rows:
            print("Error: Spreadsheet has no data rows.")
            return

        # First column must be Title; rest are date columns
        raw_keys = list(rows[0].keys())
        title_key = raw_keys[0] if raw_keys else "Title"
        if "Title" in raw_keys:
            title_key = "Title"

        date_columns = []
        for k in raw_keys:
            _, dt = parse_date_column(k)
            if dt is not None:
                date_columns.append((k, dt))  # keep original key for row.get()

        if not date_columns:
            print("Error: No date columns (YYYY-MM-DD) found in spreadsheet.")
            print(f"Found columns: {raw_keys[:5]}...")
            return

        date_columns.sort(key=lambda x: x[1])
        latest_date_key = date_columns[-1][0]
        latest_dt = date_columns[-1][1]
        # Rolling prior 4 weeks before latest snapshot
        prior_dt = latest_dt - timedelta(weeks=ROLLING_WEEKS)
        prior_date_key = None
        for k, d in date_columns:
            if d <= prior_dt:
                prior_date_key = k
            else:
                break
        if not prior_date_key and len(date_columns) >= 2:
            prior_date_key = date_columns[-2][0]

        # Build list of (title, monthly_citations)
        paper_metrics = []
        for row in rows:
            title_raw = (row.get(title_key) or "").strip()
            if not title_raw:
                continue
            latest_val = safe_float(row.get(latest_date_key))
            prior_val = safe_float(row.get(prior_date_key, 0)) if prior_date_key else 0.0
            monthly = max(0.0, latest_val - prior_val)
            paper_metrics.append((title_raw, monthly))

        # Sort by monthly citations descending, take top N
        paper_metrics.sort(key=lambda x: x[1], reverse=True)
        top_papers = paper_metrics[:TOP_N]

    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: Ensure the sheet is 'Published to Web' as CSV.")
        return
    except Exception as e:
        print(f"Error fetching/parsing spreadsheet: {e}")
        return

    # Load local publication metadata for linking
    if not PUBS_FILE.exists():
        print(f"Error: {PUBS_FILE} not found.")
        return

    with open(PUBS_FILE, "r") as f:
        all_pubs = json.load(f)

    # Lookup: normalized title -> pub data (try exact and relaxed match)
    pubs_map = {p["title"].lower().strip(): p for p in all_pubs}

    def find_pub(title_raw):
        key = title_raw.lower().strip()
        if key in pubs_map:
            return pubs_map[key]
        # Try without extra punctuation / slight differences
        key_norm = key.replace(":", " ").replace("  ", " ")
        for pub_title, p in pubs_map.items():
            if pub_title.replace(":", " ").replace("  ", " ") == key_norm:
                return p
        return None

    final_data = []
    for title_raw, monthly_citations in top_papers:
        entry = {
            "title": title_raw,
            "metrics": {
                "monthly": int(monthly_citations),
                "trend": "stable",
            },
        }
        match = find_pub(title_raw)
        if match:
            entry["venue"] = match.get("venue", "N/A")
            entry["year"] = match.get("year", "")
            entry["url"] = match.get("url", "")
            entry["authors"] = match.get("authors", [])
        else:
            print(f"Warning: Could not link '{title_raw}' to local publications.json")
            entry["venue"] = "Working Paper"
            entry["year"] = ""
            entry["url"] = ""
            entry["authors"] = []

        final_data.append(entry)

    output = {
        "lastUpdated": datetime.now().strftime("%B %d, %Y"),
        "papers": final_data,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Success. Saved {len(final_data)} hot papers to {OUTPUT_FILE}")


if __name__ == "__main__":
    fetch_hot_papers()
