#!/usr/bin/env python3
import json
import re
from datetime import date, datetime
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content"
OUTPUT_PATH = ROOT / "static" / "data" / "publications.json"

TYPE_DIRS = {
    "journal": "journal_publication",
    "conference": "conference_publication",
    "workshop": "workshop_publication",
}


def extract_year(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.year
    text = str(value)
    match = re.search(r"(19|20)\d{2}", text)
    if match:
        return int(match.group(0))
    return None


def normalize_date(value):
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        if isinstance(value, datetime):
            return value.date().isoformat()
        return value.isoformat()
    text = str(value)
    match = re.search(r"(19|20)\d{2}-\d{2}-\d{2}", text)
    if match:
        return match.group(0)
    return None


def normalize_authors(authors):
    if authors is None:
        return []
    if isinstance(authors, str):
        authors = [authors]
    normalized = []
    for author in authors:
        name = str(author).strip()
        if name.lower() == "admin":
            name = "Benjamin M. Ampel"
        normalized.append(name)
    return normalized


def normalize_venue(data):
    venue = data.get("publication_short") or data.get("publication") or ""
    venue = str(venue).strip()
    venue = re.sub(r"[*_`]", "", venue)
    venue = re.sub(r"^In\s+", "", venue)
    # Remove parenthetical abbreviations (e.g., "(JISE)")
    venue = re.sub(r"\s*\(([A-Z0-9&\.\s]{2,})\)\s*", " ", venue).strip()
    # Drop trailing status labels and volume/issue/page details
    venue = re.sub(r",\s*(Forthcoming|In Press)\s*$", "", venue, flags=re.IGNORECASE).strip()
    if re.search(r",\s*\d", venue):
        venue = venue.split(",")[0].strip()
    # Normalize common venue aliases to canonical names
    canonical_map = {
        "misq": "MIS Quarterly",
        "mis quarterly": "MIS Quarterly",
        "management information systems quarterly": "MIS Quarterly",
        "jmis": "Journal of Management Information Systems",
        "journal of management information systems": "Journal of Management Information Systems",
        "acm tmis": "ACM Transactions on Management Information Systems",
        "tmis": "ACM Transactions on Management Information Systems",
        "transactions on management information systems": "ACM Transactions on Management Information Systems",
        "acm transactions on management information systems": "ACM Transactions on Management Information Systems",
        "isf": "Information Systems Frontiers",
        "information systems frontiers": "Information Systems Frontiers",
        "jise": "Journal of Information Systems Education",
        "journal of information systems education": "Journal of Information Systems Education",
    }
    key = re.sub(r"[^a-z0-9]+", " ", venue.lower()).strip()
    if key in canonical_map:
        venue = canonical_map[key]
    return venue.strip()

def slugify(value):
    value = str(value).strip().lower()
    value = value.replace("&", "and")
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"[^a-z0-9_-]", "", value)
    value = re.sub(r"-{2,}", "-", value)
    return value


def load_front_matter(path):
    text = path.read_text(errors="ignore")
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    front = parts[1]
    try:
        data = yaml.safe_load(front)
    except Exception:
        data = {}
    return data or {}


def collect_publications():
    items = []
    for pub_type, dir_name in TYPE_DIRS.items():
        base_dir = CONTENT_DIR / dir_name
        if not base_dir.exists():
            continue
        for md_path in base_dir.rglob("index.md"):
            data = load_front_matter(md_path)
            if data.get("draft") is True:
                continue
            title = data.get("title")
            if not title:
                continue
            folder_slug = slugify(md_path.parent.name)
            year = (
                extract_year(data.get("date"))
                or extract_year(data.get("publishDate"))
                or extract_year(data.get("year"))
            )
            iso_date = (
                normalize_date(data.get("date"))
                or normalize_date(data.get("publishDate"))
            )
            authors = normalize_authors(data.get("authors"))
            venue = normalize_venue(data)
            abstract = data.get("abstract") or data.get("summary") or data.get("description")
            url = f"/{dir_name}/{folder_slug}/"
            items.append(
                {
                    "title": str(title).strip(),
                    "authors": authors,
                    "year": year,
                    "type": pub_type,
                    "venue": venue,
                    "url": url,
                    "date": iso_date,
                    "abstract": str(abstract).strip() if abstract else None,
                }
            )
    items.sort(key=lambda x: (x["year"] or 0, x["title"]))
    return items


def main():
    items = collect_publications()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=True)
        f.write("\n")
    by_type = {}
    for item in items:
        by_type[item["type"]] = by_type.get(item["type"], 0) + 1
    total = len(items)
    print(f"Wrote {total} publications to {OUTPUT_PATH}")
    for pub_type in sorted(by_type):
        print(f"{pub_type}: {by_type[pub_type]}")


if __name__ == "__main__":
    main()
