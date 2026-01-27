#!/usr/bin/env python3
"""
Fetch Google Scholar metrics and update scholar-metrics.json.
Now includes individual publication citation counts.
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

SCHOLAR_ID = "XDdwaZUAAAAJ"  # Benjamin Ampel


def fetch_scholar_data():
    """Fetch data from Google Scholar."""
    if not HAS_SCHOLARLY:
        return None
    
    print(f"Fetching Google Scholar data for ID: {SCHOLAR_ID}")
    
    try:
        # Search for author by ID
        author = scholarly.search_author_id(SCHOLAR_ID)
        # Fetch indices and publications list (metadata only to save time/requests)
        author = scholarly.fill(author, sections=['basics', 'indices', 'publications'])
        
        # 1. Extract Overall Metrics
        citations = author.get('citedby', 0)
        h_index = author.get('hindex', 0)
        i10_index = author.get('i10index', 0)
        pub_count = len(author.get('publications', []))
        
        # 2. Extract History (Last 10 Years)
        cites_per_year = author.get('cites_per_year', {})
        current_year = datetime.now().year
        history = []
        for year in range(current_year - 9, current_year + 1):
            history.append({
                "year": str(year),
                "citations": cites_per_year.get(year, 0)
            })

        # 3. Extract Individual Publications (NEW)
        # We grab the title and citation count from the list we already have.
        individual_pubs = []
        for pub in author.get('publications', []):
            if 'bib' in pub:
                individual_pubs.append({
                    "title": pub['bib'].get('title', 'Unknown Title'),
                    "citations": pub.get('num_citations', 0),
                    "year": pub['bib'].get('pub_year', 'N/A')
                })
        
        # Sort by citations (highest first)
        individual_pubs.sort(key=lambda x: x['citations'], reverse=True)

        return {
            "citations": citations,
            "hIndex": h_index,
            "i10Index": i10_index,
            "publications": pub_count,
            "citationsByYear": history,
            "individualPublications": individual_pubs
        }
        
    except Exception as e:
        print(f"Error fetching Scholar data: {e}")
        return None


def update_metrics_file(data):
    """Update the scholar-metrics.json file."""
    if data is None:
        return False
    
    # Structure the final JSON
    updated = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": f"{data['citations']}+" if data['citations'] >= 500 else str(data['citations']),
            "hIndex": data["hIndex"],
            "i10Index": data["i10Index"],
            "publications": data["publications"]
        },
        "citationsByYear": data["citationsByYear"],
        "individualPublications": data["individualPublications"]
    }
    
    # Write to file
    with open(METRICS_FILE, 'w') as f:
        json.dump(updated, f, indent=2)
    
    print(f"Updated {METRICS_FILE}")
    return True


def main():
    print("=" * 50)
    print("Google Scholar Metrics Updater")
    print("=" * 50)
    
    if not HAS_SCHOLARLY:
        print("Error: scholarly library required (pip install scholarly)")
        return
    
    data = fetch_scholar_data()
    
    if data:
        print(f"\nSuccess! Fetched {len(data['individualPublications'])} papers.")
        print(f"Total Citations: {data['citations']}")
        update_metrics_file(data)
    else:
        print("\nFailed to fetch data.")


if __name__ == '__main__':
    main()
