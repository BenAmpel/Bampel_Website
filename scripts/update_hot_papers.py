"""
Fetch hot/trending papers from a published Google Sheet CSV, match to local
publications.json, and write static/data/hot_papers.json for the frontend.
"""
import csv
import json
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# --- CONFIGURATION ---
# Published to web CSV (pub?output=csv)
CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQxM6BBdrswiWbzNk4iJ_OCVCZIiJK8jj8Paz-MMUzji8AOHzU55dvK2jbJj6Yd1InMv-p__fPmZl8c/pub?output=csv"

SCRIPT_DIR = Path(__file__).parent
PUBS_FILE = SCRIPT_DIR.parent / "static" / "data" / "publications.json"
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "hot_papers.json"

# Column to use for sorting (prefer Monthly Citations, fall back to Citations)
METRIC_KEYS = ["Monthly Citations", "Citations"]


def fetch_hot_papers():
    print("Fetching live data from Google Sheets...")

    try:
        with urllib.request.urlopen(CSV_URL) as response:
            lines = [line.decode("utf-8") for line in response.readlines()]

        reader = csv.DictReader(lines)
        rows = list(reader)

        if not rows:
            print("Error: Spreadsheet has no data rows.")
            return

        # Require Title; metric column can be Monthly Citations or Citations
        if "Title" not in rows[0]:
            print("Error: Spreadsheet missing required column 'Title'.")
            print(f"Found columns: {list(rows[0].keys())}")
            return

        metric_key = next((k for k in METRIC_KEYS if k in rows[0]), None)
        if not metric_key:
            print(f"Error: Spreadsheet missing metric column. Tried: {METRIC_KEYS}")
            print(f"Found columns: {list(rows[0].keys())}")
            return

        # Sort by metric descending (handle empty or non-numeric)
        def sort_key(row):
            val = row.get(metric_key, 0)
            try:
                return float(val) if val else 0.0
            except (TypeError, ValueError):
                return 0.0

        rows.sort(key=sort_key, reverse=True)
        top_papers = rows[:3]

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

    # Lookup: normalized title -> pub data
    pubs_map = {p["title"].lower().strip(): p for p in all_pubs}

    final_data = []
    for item in top_papers:
        title_raw = item["Title"]
        title_key = title_raw.lower().strip()
        metric_val = item.get(metric_key, 0)
        try:
            metric_val = float(metric_val) if metric_val else 0
        except (TypeError, ValueError):
            metric_val = 0

        entry = {
            "title": title_raw,
            "metrics": {
                "monthly": metric_val,
                "trend": item.get("Trend", "stable"),
            },
        }

        if title_key in pubs_map:
            match = pubs_map[title_key]
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
