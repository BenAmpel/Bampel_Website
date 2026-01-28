import os
import json
import time
import re
import requests
from pathlib import Path

# --- CONFIGURATION ---
API_KEY = os.environ.get("ALTMETRIC_API_KEY")

CONTENT_DIRS = [
    "content/journal_publication",
    "content/conference_publication",
    "content/workshop_publication"
]
OUTPUT_FILE = "static/data/altmetric.json"

# Headers to look like a real browser
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def extract_dois():
    print("--- 1. Scanning Content Files for DOIs ---")
    dois = []
    doi_pattern = re.compile(r'^doi\s*[:=]\s*["\']?(10\.[^\s"\']+)["\']?', re.MULTILINE | re.IGNORECASE)
    base_path = Path(__file__).parent.parent
    
    for dir_name in CONTENT_DIRS:
        dir_path = base_path / dir_name
        if not dir_path.exists():
            continue
            
        print(f"Scanning {dir_name}...")
        for file_path in dir_path.rglob("index.md"):
            try:
                content = file_path.read_text(encoding="utf-8")
                match = doi_pattern.search(content)
                if match:
                    dois.append(match.group(1))
            except Exception as e:
                print(f"  Error reading {file_path}: {e}")
    
    unique_dois = list(set(dois))
    print(f"Total Unique DOIs Found: {len(unique_dois)}")
    return unique_dois

def scrape_public_page(doi):
    """
    Fallback: Scrapes the public page using robust regex patterns matching your HTML file.
    """
    url = f"https://www.altmetric.com/details/doi/{doi}"
    data = {"score": 0, "news": 0, "policy": 0, "twitter": 0, "patents": 0}
    
    print(f"  [Scraper] Visiting: {url}")
    
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        
        if response.history:
            print(f"  [Scraper] Redirected to: {response.url}")
            
        if response.status_code == 404:
            print(f"  [Scraper] 404 Not Found (No public record)")
            return data 
            
        if response.status_code != 200:
            print(f"  [Scraper] HTTP Error: {response.status_code}")
            return data

        html = response.text
        
        # --- STRATEGY 1: Find Score in Badge URLs ---
        # Matches: badges.altmetric.com/?...score=3...
        # We use a broad match because the URL contains &amp; characters
        score_match = re.search(r'badges\.altmetric\.com.*?(?:score)=([0-9.]+)', html)
        
        if score_match:
            data["score"] = float(score_match.group(1))
            print(f"  [Scraper] Found Score: {data['score']}")
        elif 'citation_altmetric_score' in html:
            # Fallback to metadata tag
            meta_score = re.search(r'<meta\s+(?:name|property)="citation_altmetric_score"\s+content="([\d\.]+)"', html)
            if meta_score:
                data["score"] = float(meta_score.group(1))
                print(f"  [Scraper] Found Metadata Score: {data['score']}")
        
        # --- STRATEGY 2: Extract "Mentioned by" Counts ---
        # Matches: <strong>1</strong> patent</a>
        # Matches: <strong>5</strong> news outlets</a>
        # The HTML provided uses comma separators for thousands (e.g. 1,234)
        count_matches = re.findall(r'<strong>([\d,]+)</strong>\s+([a-zA-Z\s]+)(?:</a>|</dd>)', html)
        
        for count_str, label in count_matches:
            count = int(count_str.replace(',', ''))
            label_clean = label.lower().strip()
            
            if 'news' in label_clean:
                data["news"] = count
                print(f"  [Scraper] Found News: {count}")
            elif 'policy' in label_clean:
                data["policy"] = count
                print(f"  [Scraper] Found Policy: {count}")
            elif 'patent' in label_clean:
                data["patents"] = count
                print(f"  [Scraper] Found Patents: {count}")
            # Catch "X user", "Twitter", "Tweeters", "X post"
            elif any(x in label_clean for x in ['tweet', 'twitter', 'x user', 'x post', 'x repost']):
                data["twitter"] = count
                print(f"  [Scraper] Found Twitter/X: {count}")
            
        return data

    except Exception as e:
        print(f"  [Scraper] Error: {e}")
        return data

def fetch_metrics(dois):
    print("\n--- 2. Fetching Metrics ---")
    stats = {"score": 0, "news": 0, "policy": 0, "twitter": 0, "patents": 0}
    
    for i, doi in enumerate(dois):
        print(f"\nProcessing {i+1}/{len(dois)}: {doi}")
        
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
                    stats["patents"] += d.get("cited_by_patents_count", 0)
                    stats["twitter"] += d.get("cited_by_tweeters_count", 0)
                    print(f"  [API] Success! Score: {d.get('score', 0)}")
                    continue 
            except Exception:
                pass 

        # METHOD B: SCRAPER (Fallback)
        time.sleep(1.5) # Polite delay
        d = scrape_public_page(doi)
        
        # Aggregate
        stats["score"] += d["score"]
        stats["news"] += d["news"]
        stats["policy"] += d["policy"]
        stats["patents"] += d["patents"]
        stats["twitter"] += d["twitter"]

    return stats

def main():
    dois = extract_dois()
    if not dois:
        print("No DOIs found.")
        return

    metrics = fetch_metrics(dois)
    
    print("\n--- 3. Saving Results ---")
    output_path = Path(__file__).parent.parent / OUTPUT_FILE
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Success! Saved metrics to {output_path}")
    print(f"Final Data: {metrics}")

if __name__ == "__main__":
    main()
