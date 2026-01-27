import json
import urllib.request
import urllib.parse
import socket
from datetime import datetime
from pathlib import Path
import os

# --- CONFIGURATION ---
SCHOLAR_ID = "XDdwaZUAAAAJ" 
# Files
SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR.parent / "static" / "data" / "scholar-metrics.json"

def fetch_data():
    # If using GitHub Actions, set the key as a secret named SERPAPI_KEY
    key = os.environ.get("SERPAPI_KEY")
    
    if not key or key == "YOUR_SERPAPI_KEY_HERE":
        print("Error: SERPAPI_KEY environment variable must be set.")
        return None

    params = {
        "engine": "google_scholar_author",
        "author_id": SCHOLAR_ID,
        "api_key": key,
        "num": "100" # Fetch top 100 papers
    }
    
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
    
    print(f"Fetching data from SerpApi...")
    print(f"URL: {url[:80]}...")  # Log partial URL for debugging
    try:
        # Set socket timeout to prevent hanging (15 seconds)
        socket.setdefaulttimeout(15)
        
        # Add timeout to prevent hanging (15 seconds)
        request = urllib.request.Request(url)
        print("Making request to SerpAPI...")
        with urllib.request.urlopen(request, timeout=15) as response:
            print("Received response, reading data...")
            data = json.loads(response.read().decode())
            print("Data parsed successfully")
            
        if "error" in data:
            print(f"API Error: {data['error']}")
            return None
            
        return data
    except socket.timeout:
        print("Error: Request timed out after 15 seconds")
        return None
    except urllib.error.URLError as e:
        print(f"Network Error: {e}")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

def process_and_save(data):
    if not data: return

    author = data.get("author", {})
    articles = data.get("articles", [])

    # 1. Parse Citations Graph (cited_by.graph)
    # SerpApi returns graph as [{"year": 2018, "citations": 5}, ...]
    history = []
    graph_data = author.get("cited_by", {}).get("graph", [])
    
    # Sort and format (safely handle missing year field)
    if graph_data:
        try:
            graph_data.sort(key=lambda x: x.get('year', 0))
        except (TypeError, KeyError):
            pass  # If sorting fails, just use the data as-is
    
    for point in graph_data:
        if isinstance(point, dict) and 'year' in point:
            history.append({
                "year": str(point.get('year', '')),
                "citations": point.get('citations', 0)
            })

    # 2. Parse Top Publications
    individual_pubs = []
    for art in articles:
        individual_pubs.append({
            "title": art.get("title", ""),
            "citations": art.get("cited_by", {}).get("value", 0),
            "year": art.get("year", "N/A"),
            "link": art.get("link", "")
        })

    # 3. Construct Final JSON
    # Safely extract metrics from table array
    table = author.get("cited_by", {}).get("table", [])
    
    # Safely access table indices with defaults
    citations = table[0].get("all", 0) if len(table) > 0 else 0
    h_index = table[1].get("all", 0) if len(table) > 1 else 0
    i10_index = table[2].get("all", 0) if len(table) > 2 else 0
    
    # Calculate Citation Velocity (citations in the most recent year)
    citation_velocity = 0
    if history:
        # Get the most recent year's citations
        current_year = datetime.now().year
        # Find the most recent year in history
        most_recent_year = max([int(h.get('year', 0)) for h in history if h.get('year', '').isdigit()], default=current_year)
        # Get citations for that year
        for h in history:
            if str(h.get('year', '')) == str(most_recent_year):
                citation_velocity = h.get('citations', 0)
                break
    
    output = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": citations,
            "hIndex": h_index,
            "i10Index": i10_index,
            "publications": len(articles),
            "citationVelocity": citation_velocity
        },
        "citationsByYear": history,
        "individualPublications": individual_pubs
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Success! Saved to {OUTPUT_FILE}")
    print(f"Citations: {output['metrics']['citations']}")

if __name__ == "__main__":
    json_data = fetch_data()
    process_and_save(json_data)
