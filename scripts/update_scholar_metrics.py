import json
import urllib.request
import urllib.parse
import socket
from datetime import datetime
from pathlib import Path
from collections import defaultdict
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
    cited_by = author.get("cited_by", {})

    # Debug: Print structure to understand API response
    print(f"Author keys: {list(author.keys())}")
    print(f"Cited_by keys: {list(cited_by.keys())}")
    print(f"Table structure: {cited_by.get('table', [])}")
    print(f"Graph structure: {cited_by.get('graph', [])}")

    # 1. Parse Citations Graph (cited_by.graph)
    # SerpApi returns graph as [{"year": 2018, "citations": 5}, ...]
    history = []
    graph_data = cited_by.get("graph", [])
    
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
    total_citations_from_pubs = 0
    for art in articles:
        pub_citations = art.get("cited_by", {}).get("value", 0) or 0
        individual_pubs.append({
            "title": art.get("title", ""),
            "citations": pub_citations,
            "year": art.get("year", "N/A"),
            "link": art.get("link", "")
        })
        total_citations_from_pubs += pub_citations

    # 3. Construct Final JSON
    # Safely extract metrics from table array
    # SerpAPI structure: table[0] = {"citations": {"all": X}}, table[1] = {"h_index": {"all": Y}}, table[2] = {"i10_index": {"all": Z}}
    table = cited_by.get("table", [])
    
    citations = 0
    h_index = 0
    i10_index = 0
    
    if table and len(table) > 0:
        # Extract citations (first element)
        if isinstance(table[0], dict):
            if "citations" in table[0]:
                citations = table[0]["citations"].get("all", 0) if isinstance(table[0]["citations"], dict) else 0
            elif "all" in table[0]:
                citations = table[0].get("all", 0)
        
        # Extract h-index (second element)
        if len(table) > 1 and isinstance(table[1], dict):
            if "h_index" in table[1]:
                h_index = table[1]["h_index"].get("all", 0) if isinstance(table[1]["h_index"], dict) else 0
            elif "all" in table[1]:
                h_index = table[1].get("all", 0)
        
        # Extract i10-index (third element)
        if len(table) > 2 and isinstance(table[2], dict):
            if "i10_index" in table[2]:
                i10_index = table[2]["i10_index"].get("all", 0) if isinstance(table[2]["i10_index"], dict) else 0
            elif "all" in table[2]:
                i10_index = table[2].get("all", 0)
    
    # Fallback: Try direct access from cited_by (alternative API response format)
    if citations == 0:
        citations = cited_by.get("total", 0) or cited_by.get("value", 0) or 0
    if h_index == 0:
        h_index = cited_by.get("h_index", {}).get("all", 0) if isinstance(cited_by.get("h_index"), dict) else cited_by.get("h_index", 0)
    if i10_index == 0:
        i10_index = cited_by.get("i10_index", {}).get("all", 0) if isinstance(cited_by.get("i10_index"), dict) else cited_by.get("i10_index", 0)
    
    # Calculate Citation Velocity (citations in the most recent year)
    citation_velocity = 0
    if history:
        # Get the most recent year's citations
        current_year = datetime.now().year
        # Find the most recent year in history
        valid_years = [int(h.get('year', 0)) for h in history if str(h.get('year', '')).isdigit()]
        if valid_years:
            most_recent_year = max(valid_years)
            # Get citations for that year
            for h in history:
                if str(h.get('year', '')) == str(most_recent_year):
                    citation_velocity = h.get('citations', 0)
                    break
    
    # Fallback: Calculate citationsByYear from individual publications if graph data is missing
    if not history and individual_pubs:
        year_citations = defaultdict(int)
        
        # Group publications by year and sum citations
        for pub in individual_pubs:
            year = pub.get('year', '')
            citations = pub.get('citations', 0) or 0
            if year and year != 'N/A' and isinstance(citations, (int, float)) and citations > 0:
                year_citations[str(year)] += int(citations)
        
        # Convert to list format and sort by year
        if year_citations:
            history = [{"year": year, "citations": citations} 
                       for year, citations in sorted(year_citations.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 0)]
            print(f"Calculated citationsByYear from individual publications: {len(history)} years")
            
            # Calculate Citation Velocity from most recent year
            if history:
                most_recent_year_data = history[-1]
                citation_velocity = most_recent_year_data.get('citations', 0)
                print(f"Calculated Citation Velocity from most recent year ({most_recent_year_data.get('year')}): {citation_velocity}")
    
    # Final fallback: if still no data, calculate from individual publications
    if citations == 0 and total_citations_from_pubs > 0:
        print(f"Warning: Using fallback citations from individual publications: {total_citations_from_pubs}")
        citations = total_citations_from_pubs
    
    # Calculate h-index from individual publications if not available
    if h_index == 0 and individual_pubs:
        # Sort publications by citations (descending)
        sorted_pubs = sorted([p for p in individual_pubs if p.get('citations', 0) and isinstance(p.get('citations'), (int, float))], 
                             key=lambda x: x.get('citations', 0), reverse=True)
        # Find h-index: largest h where h publications have at least h citations
        for i, pub in enumerate(sorted_pubs, 1):
            if pub.get('citations', 0) >= i:
                h_index = i
            else:
                break
        if h_index > 0:
            print(f"Calculated h-index from individual publications: {h_index}")
    
    # Calculate i10-index from individual publications if not available
    if i10_index == 0 and individual_pubs:
        i10_count = sum(1 for p in individual_pubs if p.get('citations', 0) and p.get('citations', 0) >= 10)
        if i10_count > 0:
            i10_index = i10_count
            print(f"Calculated i10-index from individual publications: {i10_index}")
    
    print(f"Extracted metrics - Citations: {citations}, h-index: {h_index}, i10-index: {i10_index}, Citation Velocity: {citation_velocity}")
    
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
