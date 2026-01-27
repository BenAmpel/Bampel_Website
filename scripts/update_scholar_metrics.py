import json
import urllib.request
import urllib.parse
from datetime import datetime
from pathlib import Path
import os
import ssl

# --- CONFIGURATION ---
SCHOLAR_ID = "XDdwaZUAAAAJ" 
# Files
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
        "api_key": key,
        "num": "100"
    }
    
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
    print(f"Fetching data from SerpApi...")
    
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
    if not data: return

    author = data.get("author", {})
    articles = data.get("articles", [])

    # 1. Parse Citations Graph
    history = []
    graph_data = author.get("cited_by", {}).get("graph", [])
    if graph_data:
        try:
            graph_data.sort(key=lambda x: x.get('year', 0))
        except (TypeError, KeyError):
            pass
    
    for point in graph_data:
        if isinstance(point, dict) and 'year' in point:
            history.append({
                "year": str(point.get('year', '')),
                "citations": point.get('citations', 0)
            })

    # 2. Parse Publications with Rich Metadata
    individual_pubs = []
    for art in articles:
        individual_pubs.append({
            "title": art.get("title", ""),
            "citations": art.get("cited_by", {}).get("value", 0),
            "year": art.get("year", "N/A"),
            "link": art.get("link", ""),
            # Capture Authors (e.g., "B Ampel, S Samtani")
            "authors": art.get("authors", ""), 
            # Capture Venue (e.g., "MIS Quarterly")
            "venue": art.get("publication", "") 
        })

    # 3. Final JSON
    cited_by_table = author.get("cited_by", {}).get("table", [{}, {}, {}])
    while len(cited_by_table) < 3: cited_by_table.append({})

    # Extract metrics safely
    citations = 0
    h_index = 0
    i10_index = 0
    
    if len(cited_by_table) > 0 and isinstance(cited_by_table[0], dict):
        citations = cited_by_table[0].get("citations", {}).get("all", 0) if isinstance(cited_by_table[0].get("citations"), dict) else cited_by_table[0].get("all", 0)
    if len(cited_by_table) > 1 and isinstance(cited_by_table[1], dict):
        h_index = cited_by_table[1].get("h_index", {}).get("all", 0) if isinstance(cited_by_table[1].get("h_index"), dict) else cited_by_table[1].get("all", 0)
    if len(cited_by_table) > 2 and isinstance(cited_by_table[2], dict):
        i10_index = cited_by_table[2].get("i10_index", {}).get("all", 0) if isinstance(cited_by_table[2].get("i10_index"), dict) else cited_by_table[2].get("all", 0)

    output = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": citations,
            "hIndex": h_index,
            "i10Index": i10_index,
            "publications": len(articles)
        },
        "citationsByYear": history,
        "individualPublications": individual_pubs
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Success! Saved {len(individual_pubs)} papers to {OUTPUT_FILE}")

if __name__ == "__main__":
    json_data = fetch_data()
    process_and_save(json_data)
