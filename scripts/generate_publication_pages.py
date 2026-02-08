#!/usr/bin/env python3
"""
Generate missing publication pages from static/data/publications.json,
ensure canonical URLs, and append the publication_extras shortcode.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "static" / "data" / "publications.json"
CONTENT_ROOT = ROOT / "content"

SECTION_MAP = {
    "journal": "journal_publication",
    "conference": "conference_publication",
    "workshop": "workshop_publication",
}

PUB_TYPE_MAP = {
    "journal": "2",
    "conference": "1",
    "workshop": "1",
}

EXTRAS_SHORTCODE = "{{< publication_extras >}}"


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def ensure_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    return []


def normalize_date(pub) -> str:
    date = pub.get("date")
    if date:
        return date
    year = pub.get("year")
    if year:
        return f"{year}-01-01"
    return datetime.utcnow().strftime("%Y-%m-%d")


def build_front_matter(pub, section):
    title = pub.get("title", "Untitled")
    authors = ensure_list(pub.get("authors"))
    date = normalize_date(pub)
    publish_date = f"{date}T00:00:00Z" if "T" not in date else date
    venue = pub.get("venue", "")
    pub_type = PUB_TYPE_MAP.get(pub.get("type", ""), "1")

    if section == "journal_publication":
        publication = f"*{venue}*" if venue else ""
    else:
        publication = f"In *{venue}*" if venue else ""

    abstract = pub.get("abstract", "")
    doi = pub.get("doi", "") or ""

    escaped_title = title.replace('"', '\\"')
    
    lines = [
        "---",
        f'title: "{escaped_title}"',
        "",
        "authors:",
    ]
    for author in authors:
        lines.append(f"  - {author}")
    lines.extend([
        "",
        f"date: {date}",
        f"doi: '{doi}'",
        "",
        f"publishDate: '{publish_date}'",
        "",
        f"publication_types: ['{pub_type}']",
        "",
        f"publication: {publication}",
        "publication_short: ''",
        "",
        f"abstract: {abstract}",
        "",
        "tags: []",
        "",
        "featured: false",
        "",
        "url_pdf: ''",
        "url_code: ''",
        "url_dataset: ''",
        "url_project: ''",
        "url_slides: ''",
        "url_video: ''",
        "---",
        "",
    ])
    return "\n".join(lines)


def ensure_extras(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if EXTRAS_SHORTCODE in text:
        return False
    text = text.rstrip() + "\n\n" + EXTRAS_SHORTCODE + "\n"
    path.write_text(text, encoding="utf-8")
    return True


def extract_front_matter(text: str) -> tuple[str, str, str]:
    if not text.startswith("---"):
        return "", "", text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return "", "", text
    _, front, rest = parts
    return "---", front.strip(), rest.lstrip("\n")


def parse_title(front: str) -> str:
    for line in front.splitlines():
        if line.strip().startswith("title:"):
            return line.split(":", 1)[1].strip().strip('"').strip("'")
    return ""


def set_url_in_front_matter(path: Path, url: str) -> bool:
    text = path.read_text(encoding="utf-8")
    marker, front, rest = extract_front_matter(text)
    if not marker:
        return False

    lines = front.splitlines()
    found = False
    updated = False
    for i, line in enumerate(lines):
        if line.strip().startswith("url:"):
            found = True
            current = line.split(":", 1)[1].strip().strip('"').strip("'")
            if current != url:
                lines[i] = f"url: \"{url}\""
                updated = True
            break

    if not found:
        insert_at = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("publishDate:"):
                insert_at = i + 1
                break
        if insert_at == 0:
            for i, line in enumerate(lines):
                if line.strip().startswith("date:"):
                    insert_at = i + 1
                    break
        if insert_at == 0:
            insert_at = 1
        lines.insert(insert_at, f"url: \"{url}\"")
        updated = True

    if updated:
        new_text = "---\n" + "\n".join(lines) + "\n---\n" + rest
        path.write_text(new_text, encoding="utf-8")
    return updated


def build_existing_title_map():
    title_map = {}
    for section in SECTION_MAP.values():
        for path in (CONTENT_ROOT / section).rglob("index.md"):
            text = path.read_text(encoding="utf-8")
            _, front, _ = extract_front_matter(text)
            title = parse_title(front)
            if title:
                key = title.lower().strip()
                title_map.setdefault(key, []).append(path)
    return title_map


def main():
    if not DATA_FILE.exists():
        raise SystemExit(f"Missing {DATA_FILE}")

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("individualPublications", [])

    title_map = build_existing_title_map()

    created = 0
    updated = 0
    url_updated = 0

    for pub in data:
        pub_type = pub.get("type", "")
        section = SECTION_MAP.get(pub_type, "journal_publication")

        url = pub.get("url")
        if url:
            rel_path = url.lstrip("/").rstrip("/")
        else:
            slug = slugify(pub.get("title", "publication"))
            rel_path = f"{section}/{slug}"
            url = f"/{rel_path}/"

        target_dir = CONTENT_ROOT / rel_path
        index_path = target_dir / "index.md"

        if index_path.exists():
            if set_url_in_front_matter(index_path, url):
                url_updated += 1
            if ensure_extras(index_path):
                updated += 1
            continue

        # Try to match existing page by title
        title = (pub.get("title") or "").lower().strip()
        matched_paths = title_map.get(title, [])
        if matched_paths:
            path = matched_paths[0]
            if set_url_in_front_matter(path, url):
                url_updated += 1
            if ensure_extras(path):
                updated += 1
            continue

        target_dir.mkdir(parents=True, exist_ok=True)
        front_matter = build_front_matter(pub, section)
        index_path.write_text(front_matter + EXTRAS_SHORTCODE + "\n", encoding="utf-8")
        created += 1

    # Ensure extras on all existing publication pages
    for section in SECTION_MAP.values():
        for path in (CONTENT_ROOT / section).rglob("index.md"):
            if ensure_extras(path):
                updated += 1

    print(f"Created {created} publication pages.")
    print(f"Updated {updated} pages with extras.")
    print(f"Updated {url_updated} pages with canonical URLs.")


if __name__ == "__main__":
    main()
