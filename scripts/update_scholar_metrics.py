import json
import os
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# Try to use serpapi package if available, otherwise fall back to urllib
try:
    from serpapi import GoogleSearch
    USE_SERPAPI_PACKAGE = True
except ImportError:
    USE_SERPAPI_PACKAGE = False
    import urllib.request
    import urllib.parse
    import ssl

# --- CONFIGURATION ---
SCHOLAR_ID = "XDdwaZUAAAAJ" 
SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "scholar-metrics.json"

def fetch_data():
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        print("Error: SERPAPI_KEY environment variable is missing.")
        return None

    params = {
        "engine": "google_scholar_author",
        "author_id": SCHOLAR_ID,
        "num": 100,
        "sort": "pubdate",  # Sorts by newest first
        "api_key": key
    }

    if USE_SERPAPI_PACKAGE:
        try:
            search = GoogleSearch(params)
            results = search.get_dict()
            
            if "error" in results:
                print(f"API Error: {results['error']}")
                return None
                
            return results
        except Exception as e:
            print(f"SerpAPI Package Error: {e}")
            return None
    else:
        # Fallback to urllib method
        url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
        print(f"Fetching data from SerpApi (using urllib)...")
        
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            with urllib.request.urlopen(url, timeout=30, context=ctx) as response:
                data = json.loads(response.read().decode())
                
            if "error" in data:
                print(f"API Error: {data['error']}")
                return None
                
            return data
        except Exception as e:
            print(f"Network Error: {e}")
            return None

def process_and_save(data):
    if not data:
        return

    author = data.get("author", {})
    cited_by = author.get("cited_by", {})
    articles = data.get("articles", [])

    # 1. Standard Metrics (Total, H-Index, i10)
    table = cited_by.get("table", [])
    citations_all = 0
    h_index_all = 0
    i10_index_all = 0

    # Extract metrics from table array
    for metric in table:
        if isinstance(metric, dict):
            if "citations" in metric:
                citations_all = metric["citations"].get("all", 0) if isinstance(metric["citations"], dict) else 0
            elif "h_index" in metric:
                h_index_all = metric["h_index"].get("all", 0) if isinstance(metric["h_index"], dict) else 0
            elif "i10_index" in metric:
                i10_index_all = metric["i10_index"].get("all", 0) if isinstance(metric["i10_index"], dict) else 0

    # 2. Yearly Citations Graph -> Convert to array format for dashboard compatibility
    raw_graph = cited_by.get("graph", [])
    citations_by_year = []
    
    if raw_graph:
        try:
            raw_graph.sort(key=lambda x: x.get('year', 0))
        except (TypeError, KeyError):
            pass
        
        for item in raw_graph:
            if isinstance(item, dict) and 'year' in item:
                citations_by_year.append({
                    "year": str(item.get('year', '')),
                    "citations": item.get('citations', 0)
                })

    # 3. Individual Publications -> Mapped to specific keys
    individual_publications = []
    total_citations_from_pubs = 0

    for article in articles:
        citations = article.get("cited_by", {}).get("value", 0) or 0
        pub_entry = {
            "title": article.get("title", ""),
            "citations": citations,
            "year": article.get("year", "N/A"),
            "link": article.get("link", ""),
            "authors": article.get("authors", ""), 
            "venue": article.get("publication", "") 
        }
        individual_publications.append(pub_entry)
        total_citations_from_pubs += citations

    # Fallback: Calculate citationsByYear from individual publications if graph data is missing
    if not citations_by_year and individual_publications:
        year_citations = defaultdict(int)
        
        for pub in individual_publications:
            year = pub.get('year', '')
            citations = pub.get('citations', 0) or 0
            if year and year != 'N/A' and isinstance(citations, (int, float)) and citations > 0:
                year_citations[str(year)] += int(citations)
        
        if year_citations:
            citations_by_year = [{"year": year, "citations": citations} 
                               for year, citations in sorted(year_citations.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0)]
            print(f"Calculated citationsByYear from individual publications: {len(citations_by_year)} years")

    # Calculate Citation Velocity (citations in the most recent year)
    citation_velocity = 0
    if citations_by_year:
        most_recent_year_data = citations_by_year[-1]
        citation_velocity = most_recent_year_data.get('citations', 0)

    # Fallback: Use sum from individual publications if citations is 0
    if citations_all == 0 and total_citations_from_pubs > 0:
        print(f"Warning: Using fallback citations from individual publications: {total_citations_from_pubs}")
        citations_all = total_citations_from_pubs

    # Calculate h-index from individual publications if not available
    if h_index_all == 0 and individual_publications:
        sorted_pubs = sorted([p for p in individual_publications 
                              if p.get('citations') and isinstance(p.get('citations'), (int, float)) and p.get('citations', 0) > 0], 
                             key=lambda x: x.get('citations', 0), reverse=True)
        for i, pub in enumerate(sorted_pubs, 1):
            if pub.get('citations', 0) >= i:
                h_index_all = i
            else:
                break
        if h_index_all > 0:
            print(f"Calculated h-index from individual publications: {h_index_all}")

    # Calculate i10-index from individual publications if not available
    if i10_index_all == 0 and individual_publications:
        i10_count = sum(1 for p in individual_publications 
                       if p.get('citations') and isinstance(p.get('citations'), (int, float))
                       and p.get('citations', 0) >= 10)
        if i10_count > 0:
            i10_index_all = i10_count
            print(f"Calculated i10-index from individual publications: {i10_index_all}")

    # Construct the final JSON (matching dashboard structure)
    output = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": citations_all,
            "hIndex": h_index_all,
            "i10Index": i10_index_all,
            "publications": len(articles),
            "citationVelocity": citation_velocity
        },
        "citationsByYear": citations_by_year,  # Array format for dashboard compatibility
        "individualPublications": individual_publications
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Success! Saved {len(individual_publications)} papers to {OUTPUT_FILE}")
    print(f"Citations: {citations_all}, h-index: {h_index_all}, i10-index: {i10_index_all}, Citation Velocity: {citation_velocity}")

if __name__ == "__main__":
    json_data = fetch_data()
    process_and_save(json_data)
