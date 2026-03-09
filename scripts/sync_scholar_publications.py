"""
Detect new papers on Google Scholar (via SerpAPI) that don't yet have a
Hugo content page, and create stub index.md files for them.

Run: python scripts/sync_scholar_publications.py

Must run BEFORE build_publications_json.py so new stubs are picked up in
the same CI run.

Requires: SERPAPI_KEY environment variable (same as update_scholar_metrics.py)
"""

import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

# Try serpapi package first, fall back to urllib (mirrors update_scholar_metrics.py)
try:
    from serpapi import GoogleSearch
    USE_SERPAPI_PACKAGE = True
except ImportError:
    USE_SERPAPI_PACKAGE = False

ROOT         = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "content"
SCHOLAR_ID   = "XDdwaZUAAAAJ"

SECTION_DIRS = {
    "journal":    "journal_publication",
    "conference": "conference_publication",
    "workshop":   "workshop_publication",
}

EXTRAS_SHORTCODE = "{{< publication_extras >}}"

# Title word-overlap threshold to consider a paper "already exists"
SIMILARITY_THRESHOLD = 0.75


# ---------------------------------------------------------------------------
# Venue → publication type classifier
# ---------------------------------------------------------------------------

# Tokens that, if present anywhere in the venue string, strongly suggest
# the corresponding type (checked in order: workshop → journal → conference)
WORKSHOP_TOKENS = {"workshop", "wais", "wisp", "treo", "spw", "isr"}
JOURNAL_TOKENS  = {
    "journal", "quarterly", "transactions", "frontiers", "letters",
    "review", "reviews", "magazine", "annals", "bulletin", "communications",
}


def classify_venue(raw: str) -> str:
    tokens = set(re.findall(r"[a-z]+", raw.lower()))
    if tokens & WORKSHOP_TOKENS:
        return "workshop"
    if tokens & JOURNAL_TOKENS:
        return "journal"
    return "conference"


# ---------------------------------------------------------------------------
# Venue name cleanup  (strip trailing volume / page / year info)
# ---------------------------------------------------------------------------

def clean_venue(raw: str) -> str:
    # "MIS Quarterly, 1-34, 2026"          → "MIS Quarterly"
    # "JISE 37 (2), 2026"                  → "JISE"
    # "Hawaii Intl Conf... 59, 516-525"    → "Hawaii Intl Conf..."
    v = re.sub(r"\s+\d.*$", "", raw).strip().rstrip(",").strip()
    if not v:
        v = raw.split(",")[0].strip()
    return v


# ---------------------------------------------------------------------------
# Title normalisation for dedup
# ---------------------------------------------------------------------------

def _words(text: str) -> set:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def title_similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / max(len(wa), len(wb))


# ---------------------------------------------------------------------------
# Slug + front-matter builder
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:70]


def parse_authors(author_str: str) -> list:
    """Split Scholar-abbreviated author string; replace Ampel with 'admin'."""
    parts = [p.strip() for p in author_str.split(",") if p.strip()]
    out = []
    for p in parts:
        if "ampel" in p.lower():
            out.append("admin")
        else:
            out.append(p)
    return out or ["admin"]


def build_stub(title, authors, year, venue, pub_type, scholar_link) -> str:
    escaped  = title.replace('"', '\\"')
    date_str = f"{year}-01-01" if year else "2024-01-01"
    pub_type_code = "2" if pub_type == "journal" else "1"

    if pub_type == "journal":
        pub_field = f"*{venue}*" if venue else ""
    else:
        pub_field = f"In *{venue}*" if venue else ""

    author_lines = "\n".join(f"  - {a}" for a in authors)

    return (
        "---\n"
        f'title: "{escaped}"\n'
        "\n"
        "authors:\n"
        f"{author_lines}\n"
        "\n"
        f"date: {date_str}\n"
        "doi: ''\n"
        "\n"
        f"publishDate: '{date_str}T00:00:00Z'\n"
        "\n"
        f"publication_types: ['{pub_type_code}']\n"
        "\n"
        f"publication: {pub_field}\n"
        "publication_short: ''\n"
        "\n"
        "abstract: ''\n"
        "\n"
        "tags: []\n"
        "\n"
        "featured: false\n"
        "\n"
        "url_pdf: ''\n"
        "url_code: ''\n"
        "url_dataset: ''\n"
        "url_project: ''\n"
        "url_slides: ''\n"
        "url_video: ''\n"
        "\n"
        "links:\n"
        f"  - name: Scholar\n"
        f"    url: \"{scholar_link}\"\n"
        "---\n"
        "\n"
        f"{EXTRAS_SHORTCODE}\n"
    )


# ---------------------------------------------------------------------------
# SerpAPI fetch  (mirrors update_scholar_metrics.py)
# ---------------------------------------------------------------------------

def fetch_scholar_articles() -> list:
    key = os.environ.get("SERPAPI_KEY")
    if not key:
        print("WARNING: SERPAPI_KEY not set — skipping Scholar sync.")
        return []

    params = {
        "engine":    "google_scholar_author",
        "author_id": SCHOLAR_ID,
        "num":       100,
        "sort":      "pubdate",
        "api_key":   key,
    }

    if USE_SERPAPI_PACKAGE:
        try:
            results = GoogleSearch(params).get_dict()
            if "error" in results:
                print(f"SerpAPI error: {results['error']}")
                return []
            return results.get("articles", [])
        except Exception as exc:
            print(f"SerpAPI package error: {exc}")
            return []
    else:
        url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(params)
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode    = ssl.CERT_NONE
            with urllib.request.urlopen(url, timeout=30, context=ctx) as resp:
                data = json.loads(resp.read().decode())
            if "error" in data:
                print(f"SerpAPI error: {data['error']}")
                return []
            return data.get("articles", [])
        except Exception as exc:
            print(f"Network error: {exc}")
            return []


# ---------------------------------------------------------------------------
# Load existing publication titles from content dirs
# ---------------------------------------------------------------------------

def load_existing_titles() -> list:
    titles = []
    for section in SECTION_DIRS.values():
        for path in (CONTENT_ROOT / section).rglob("index.md"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            if not text.startswith("---"):
                continue
            parts = text.split("---", 2)
            if len(parts) < 3:
                continue
            for line in parts[1].splitlines():
                if line.strip().startswith("title:"):
                    t = line.split(":", 1)[1].strip().strip('"').strip("'")
                    if t:
                        titles.append(t)
                    break
    return titles


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== Scholar Publication Sync ===")

    articles = fetch_scholar_articles()
    if not articles:
        print("No articles returned — nothing to sync.")
        return

    print(f"Scholar returned {len(articles)} articles.")

    existing_titles = load_existing_titles()
    print(f"Found {len(existing_titles)} existing publication pages.")

    created  = 0
    skipped  = 0
    new_stubs = []

    for article in articles:
        title = (article.get("title") or "").strip()
        if not title:
            continue

        # --- dedup check ---
        best_sim = max(
            (title_similarity(title, ex) for ex in existing_titles),
            default=0.0,
        )
        if best_sim >= SIMILARITY_THRESHOLD:
            skipped += 1
            continue

        # --- classify & build stub ---
        venue_raw  = article.get("venue") or article.get("publication") or ""
        venue      = clean_venue(venue_raw)
        pub_type   = classify_venue(venue_raw)
        section    = SECTION_DIRS[pub_type]
        year       = str(article.get("year") or "").strip()
        link       = article.get("link", "")
        author_str = article.get("authors") or ""
        authors    = parse_authors(author_str)

        slug       = slugify(title)
        target_dir = CONTENT_ROOT / section / slug
        index_path = target_dir / "index.md"

        if index_path.exists():
            skipped += 1
            continue

        target_dir.mkdir(parents=True, exist_ok=True)
        stub = build_stub(title, authors, year, venue, pub_type, link)
        index_path.write_text(stub, encoding="utf-8")
        created += 1
        new_stubs.append((pub_type, year, title))
        # Add to existing_titles so we don't create duplicate stubs for
        # variant titles of the same paper within the same Scholar response
        existing_titles.append(title)
        print(f"  [NEW] {pub_type:10s} | {year} | {title[:65]}")

    print(f"\nDone. Created {created} new stub(s). Skipped {skipped} (already covered).")
    if new_stubs:
        print("Note: new stubs contain abbreviated author names from Scholar.")
        print("      Consider expanding them manually for accurate display.")


if __name__ == "__main__":
    main()
