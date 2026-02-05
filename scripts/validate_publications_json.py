#!/usr/bin/env python3
"""Validate publications.json for required fields and normalized venues."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "static" / "data" / "publications.json"

REQUIRED_FIELDS = ("title", "authors", "type", "venue", "year", "url")
VALID_TYPES = {"journal", "conference", "workshop"}

# Venue must not include volume/issue/page info or status labels
BAD_VENUE_PATTERNS = [
    re.compile(r",\s*\d"),
    re.compile(r"\bForthcoming\b", re.IGNORECASE),
    re.compile(r"\bIn Press\b", re.IGNORECASE),
]

# Canonical venue names should not include parenthetical abbreviations
BAD_PAREN_ABBREV = re.compile(r"\([A-Z0-9&\.\s]{2,}\)")


def main():
    if not DATA_PATH.exists():
        print(f"ERROR: {DATA_PATH} does not exist")
        return 1

    with DATA_PATH.open() as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON: {e}")
            return 1

    if not isinstance(data, list):
        print("ERROR: publications.json must be a list")
        return 1

    errors = []

    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"[{idx}] entry is not an object")
            continue

        for field in REQUIRED_FIELDS:
            if field not in item or item[field] in (None, "", []):
                errors.append(f"[{idx}] missing or empty field: {field}")

        if item.get("type") and item["type"] not in VALID_TYPES:
            errors.append(f"[{idx}] invalid type: {item['type']}")

        venue = item.get("venue") or ""
        if BAD_PAREN_ABBREV.search(venue):
            errors.append(f"[{idx}] venue contains parenthetical abbreviation: {venue}")
        for pattern in BAD_VENUE_PATTERNS:
            if pattern.search(venue):
                errors.append(f"[{idx}] venue not normalized (contains volume/issue/status): {venue}")
                break

    if errors:
        print("Validation errors found:")
        for err in errors:
            print(" -", err)
        return 1

    print("publications.json validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
