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
            authors = normalize_authors(data.get("authors"))
            venue = normalize_venue(data)
            url = f"/{dir_name}/{folder_slug}/"
            items.append(
                {
                    "title": str(title).strip(),
                    "authors": authors,
                    "year": year,
                    "type": pub_type,
                    "venue": venue,
                    "url": url,
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
