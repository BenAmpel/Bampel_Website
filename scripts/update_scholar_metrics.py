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
    
    # Sort and format
    graph_data.sort(key=lambda x: x['year'])
    for point in graph_data:
        history.append({
            "year": str(point['year']),
            "citations": point['citations']
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
    output = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": author.get("cited_by", {}).get("table", [{}])[0].get("all", 0),
            "hIndex": author.get("cited_by", {}).get("table", [{}])[1].get("all", 0),
            "i10Index": author.get("cited_by", {}).get("table", [{}])[2].get("all", 0),
            "publications": len(articles)
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
