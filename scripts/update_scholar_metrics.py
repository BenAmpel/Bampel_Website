#!/usr/bin/env python3
"""
Fetch Google Scholar metrics and update scholar-metrics.json.

This script uses the scholarly library to fetch citation data from Google Scholar.

Usage:
    pip install scholarly
    python update_scholar_metrics.py

Note: Google Scholar has rate limits. This script includes delays to avoid being blocked.
"""

import json
import time
from datetime import datetime
from pathlib import Path

try:
    from scholarly import scholarly
    HAS_SCHOLARLY = True
except ImportError:
    HAS_SCHOLARLY = False
    print("Warning: scholarly library not installed. Run: pip install scholarly")

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
METRICS_FILE = PROJECT_ROOT / "static" / "data" / "scholar-metrics.json"

# Your Google Scholar profile ID
SCHOLAR_ID = "XDdwaZUAAAAJ"  # Benjamin Ampel's Google Scholar ID


def fetch_scholar_data():
    """Fetch data from Google Scholar."""
    if not HAS_SCHOLARLY:
        return None
    
    print(f"Fetching Google Scholar data for ID: {SCHOLAR_ID}")
    
    try:
        # Search for author by ID
        author = scholarly.search_author_id(SCHOLAR_ID)
        author = scholarly.fill(author, sections=['basics', 'indices', 'publications'])
        
        # Extract metrics
        citations = author.get('citedby', 0)
        h_index = author.get('hindex', 0)
        i10_index = author.get('i10index', 0)
        
        # Count publications
        publications = len(author.get('publications', []))
        
        # Get citations by year (from cites_per_year if available)
        cites_per_year = author.get('cites_per_year', {})
        
        # Build citations by year data
        current_year = datetime.now().year
        citations_by_year = []
        for year in range(2019, current_year + 1):
            year_str = str(year)
            cites = cites_per_year.get(year, 0)
            citations_by_year.append({
                "year": year_str,
                "citations": cites
            })
        
        return {
            "citations": f"{citations}+" if citations >= 500 else str(citations),
            "hIndex": h_index,
            "i10Index": i10_index,
            "publications": publications,
            "citationsByYear": citations_by_year
        }
        
    except Exception as e:
        print(f"Error fetching Scholar data: {e}")
        return None


def update_metrics_file(data):
    """Update the scholar-metrics.json file."""
    if data is None:
        print("No data to update.")
        return False
    
    # Load existing file to preserve structure
    try:
        with open(METRICS_FILE, 'r') as f:
            existing = json.load(f)
    except FileNotFoundError:
        existing = {}
    
    # Update with new data
    updated = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": data["citations"],
            "hIndex": data["hIndex"],
            "i10Index": data["i10Index"],
            "publications": data["publications"]
        },
        "citationsByYear": data["citationsByYear"]
    }
    
    # Write updated file
    with open(METRICS_FILE, 'w') as f:
        json.dump(updated, f, indent=2)
    
    print(f"Updated {METRICS_FILE}")
    return True


def main():
    """Main function to fetch and update metrics."""
    print("=" * 50)
    print("Google Scholar Metrics Updater")
    print("=" * 50)
    
    if not HAS_SCHOLARLY:
        print("\nError: scholarly library required.")
        print("Install with: pip install scholarly")
        return
    
    # Add delay to be respectful to Google Scholar
    print("\nFetching data (this may take a moment)...")
    time.sleep(2)
    
    data = fetch_scholar_data()
    
    if data:
        print("\nFetched metrics:")
        print(f"  Citations: {data['citations']}")
        print(f"  h-index: {data['hIndex']}")
        print(f"  i10-index: {data['i10Index']}")
        print(f"  Publications: {data['publications']}")
        print(f"  Years tracked: {len(data['citationsByYear'])}")
        
        print("\nUpdating metrics file...")
        update_metrics_file(data)
        
        print("\nDone! Remember to regenerate the dashboard image:")
        print("  python generate_dashboard.py")
    else:
        print("\nFailed to fetch data. Metrics file not updated.")


if __name__ == '__main__':
    main()
