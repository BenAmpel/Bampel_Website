import os
import json
import time
import re
import requests
from pathlib import Path

# --- CONFIGURATION ---
# If you have a key, put it here. If not, the script will auto-fallback to scraping.
API_KEY = os.environ.get("ALTMETRIC_API_KEY")

CONTENT_DIRS = [
    "content/journal_publication",
    "content/conference_publication",
    "content/workshop_publication"
]
OUTPUT_FILE = "static/data/altmetric.json"

# Headers to look like a real browser (prevents blocking)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def extract_dois():
    """Scans Hugo content files to find all DOIs."""
    dois = []
    doi_pattern = re.compile(r'^doi\s*[:=]\s*["\']?(10\.[^\s"\']+)["\']?', re.MULTILINE | re.IGNORECASE)
    base_path = Path(__file__).parent.parent
    
    for dir_name in CONTENT_DIRS:
        dir_path = base_path / dir_name
        if not dir_path.exists():
            continue
        for file_path in dir_path.rglob("index.md"):
            try:
                content = file_path.read_text(encoding="utf-8")
                match = doi_pattern.search(content)
                if match:
                    dois.append(match.group(1))
            except Exception:
                pass
    return list(set(dois))

def scrape_public_page(doi):
    """
    Fallback: Visits the public HTML page and extracts data using Regex.
    """
    url = f"https://www.altmetric.com/details/doi/{doi}"
    data = {"score": 0, "news": 0, "policy": 0, "twitter": 0}
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        
        if response.status_code == 404:
            return data # Paper has no Altmetric record yet
            
        html = response.text
        
        # 1. Extract Score (Reliable)
        # Looks for <img src="..." alt="Article has an altmetric score of 123">
        score_match = re.search(r'alt="Article has an altmetric score of (\d+)', html)
        if score_match:
            data["score"] = float(score_match.group(1))
            
        # 2. Extract Counts (Approximation from HTML text)
        # Looks for "Mentioned by X news outlets"
        news_match = re.search(r'(\d+)\s+news\s+outlets?', html, re.IGNORECASE)
        if news_match:
            data["news"] = int(news_match.group(1))
            
        policy_match = re.search(r'(\d+)\s+policy\s+sources?', html, re.IGNORECASE)
        if policy_match:
            data["policy"] = int(policy_match.group(1))
            
        twitter_match = re.search(r'(\d+)\s+tweeters?', html, re.IGNORECASE)
        if twitter_match:
            data["twitter"] = int(twitter_match.group(1))
            
        print(f"  [Scraped] {doi}: Score {data['score']}")
        return data

    except Exception as e:
        print(f"  [Error] Scraping {doi}: {e}")
        return data

def fetch_metrics(dois):
    stats = {"score": 0, "news": 0, "policy": 0, "twitter": 0}
    
    print(f"Processing {len(dois)} papers...")
    
    for doi in dois:
        # METHOD A: API (If Key Exists)
        if API_KEY:
            try:
                url = f"https://api.altmetric.com/v1/doi/{doi}"
                response = requests.get(url, params={"key": API_KEY})
                if response.status_code == 200:
                    d = response.json()
                    stats["score"] += d.get("score", 0)
                    stats["news"] += d.get("cited_by_msm_count", 0)
                    stats["policy"] += d.get("cited_by_policies_count", 0)
                    stats["twitter"] += d.get("cited_by_tweeters_count", 0)
                    print(f"  [API] {doi}: Success")
                    continue # Skip to next DOI
            except Exception:
                pass # Fall through to scraper if API fails

        # METHOD B: SCRAPER (Fallback)
        # We add a delay to be polite to their servers
        time.sleep(1.0) 
        d = scrape_public_page(doi)
        stats["score"] += d["score"]
        stats["news"] += d["news"]
        stats["policy"] += d["policy"]
        stats["twitter"] += d["twitter"]

    return stats

def main():
    dois = extract_dois()
    if not dois:
        print("No DOIs found.")
        return

    metrics = fetch_metrics(dois)
    
    output_path = Path(__file__).parent.parent / OUTPUT_FILE
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Saved metrics: {metrics}")

if __name__ == "__main__":
    main()
