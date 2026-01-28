import os
import json
import time
import re
import requests
from pathlib import Path

# Configuration
API_KEY = os.environ.get("ALTMETRIC_API_KEY")
CONTENT_DIRS = [
    "content/journal_publication",
    "content/conference_publication",
    "content/workshop_publication"
]
OUTPUT_FILE = "static/data/altmetric.json"

def extract_dois():
    dois = []
    # Regex to find doi: "10.xxxx" or doi: 10.xxxx in frontmatter
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
            except Exception as e:
                print(f"Error reading {file_path}: {e}")
                
    return list(set(dois)) # Deduplicate

def fetch_metrics(dois):
    stats = {"score": 0, "news": 0, "policy": 0, "twitter": 0}
    
    if not API_KEY:
        print("Warning: ALTMETRIC_API_KEY not found. Skipping API calls.")
        return stats

    headers = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
    
    print(f"Fetching metrics for {len(dois)} DOIs...")
    
    for doi in dois:
        try:
            # Using the fetch endpoint which allows batching or single lookup
            url = f"https://api.altmetric.com/v1/doi/{doi}"
            # Add 'key' param if not using Bearer header, usually API key is query param for Altmetric
            response = requests.get(url, params={"key": API_KEY})
            
            if response.status_code == 200:
                data = response.json()
                stats["score"] += data.get("score", 0)
                stats["news"] += data.get("cited_by_msm_count", 0)
                stats["policy"] += data.get("cited_by_policies_count", 0)
                stats["twitter"] += data.get("cited_by_tweeters_count", 0)
            elif response.status_code == 429:
                print("Rate limit hit. Stopping.")
                break
                
            time.sleep(0.2) # Be polite
            
        except Exception as e:
            print(f"Failed to fetch {doi}: {e}")

    return stats

def main():
    dois = extract_dois()
    print(f"Found {len(dois)} DOIs in content files.")
    
    if not dois:
        print("No DOIs found. Exiting.")
        return

    metrics = fetch_metrics(dois)
    
    # Save to static JSON
    output_path = Path(__file__).parent.parent / OUTPUT_FILE
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        json.dump(metrics, f, indent=2)
        
    print(f"Successfully saved aggregated metrics to {OUTPUT_FILE}")
    print(metrics)

if __name__ == "__main__":
    main()
