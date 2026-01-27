import json
import os
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

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

# List of common words to ignore in titles
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", 
    "with", "by", "from", "up", "about", "into", "over", "after", "is", "are", 
    "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", 
    "did", "can", "could", "should", "would", "may", "might", "must", "will", 
    "shall", "study", "analysis", "using", "based", "approach", "review", 
    "case", "towards", "via", "system", "systems", "data", "model", "models",
    "detection", "identification", "understanding", "exploring", "evaluating"
}

def get_top_keywords(articles, top_n=6):
    """
    Extracts the most frequent non-stop words from paper titles.
    """
    word_counter = Counter()

    for article in articles:
        title = article.get("title", "")
        if not title:
            continue
        
        # 1. Lowercase and remove punctuation (keep only alphanumeric and spaces)
        clean_title = re.sub(r'[^a-zA-Z0-9\s]', '', title.lower())
        
        # 2. Tokenize and filter
        words = [w for w in clean_title.split() if w not in STOP_WORDS and len(w) > 2]
        
        # 3. specific bigram handling (optional hack for common terms)
        # If you want "Deep Learning" to count as one, you'd handle it here.
        # For now, we stick to single high-frequency words.
        word_counter.update(words)

    # Return the top N words, Capitalized
    most_common = word_counter.most_common(top_n)
    return [word.capitalize() for word, count in most_common]

def fetch_data():
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        print("Error: SERPAPI_KEY environment variable is missing.")
        return None

    params = {
        "engine": "google_scholar_author",
        "author_id": SCHOLAR_ID,
        "num": 100,
        "sort": "pubdate",
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

    cited_by = data.get("cited_by", {}) 
    articles = data.get("articles", [])
    author = data.get("author", {})

    # 1. Standard Metrics
    table = cited_by.get("table", [])
    citations_all = 0
    h_index_all = 0
    i10_index_all = 0

    for metric in table:
        if isinstance(metric, dict):
            if "citations" in metric:
                citations_all = metric["citations"].get("all", 0) if isinstance(metric["citations"], dict) else 0
            elif "h_index" in metric:
                h_index_all = metric["h_index"].get("all", 0) if isinstance(metric["h_index"], dict) else 0
            elif "i10_index" in metric:
                i10_index_all = metric["i10_index"].get("all", 0) if isinstance(metric["i10_index"], dict) else 0

    # 2. Yearly Citations Graph
    raw_graph = cited_by.get("graph", [])
    citations_by_year = []
    if raw_graph:
        citations_by_year = [{"year": str(item.get('year')), "citations": int(item.get('citations', 0))} for item in raw_graph]

    # 3. Individual Publications
    individual_publications = []
    for article in articles:
        individual_publications.append({
            "title": article.get("title", ""),
            "citations": article.get("cited_by", {}).get("value", 0) or 0,
            "year": article.get("year", "N/A"),
            "link": article.get("link", ""),
            "authors": article.get("authors", ""), 
            "venue": article.get("publication", "") 
        })

    # 4. Infer Interests from Titles (NEW)
    inferred_interests = get_top_keywords(articles, top_n=6)
    print(f"Inferred Interests: {inferred_interests}")

    # 5. Citation Velocity
    citation_velocity = 0
    if citations_by_year:
        citation_velocity = citations_by_year[-1].get('citations', 0)

    # Construct the final JSON
    output = {
        "lastUpdated": datetime.now().strftime("%B %Y"),
        "metrics": {
            "citations": citations_all,
            "hIndex": h_index_all,
            "i10Index": i10_index_all,
            "publications": len(articles),
            "citationVelocity": citation_velocity,
            "interests": inferred_interests  # <--- Now uses inferred data
        },
        "citationsByYear": citations_by_year,
        "individualPublications": individual_publications
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"Success! Saved metrics to {OUTPUT_FILE}")

if __name__ == "__main__":
    json_data = fetch_data()
    process_and_save(json_data)