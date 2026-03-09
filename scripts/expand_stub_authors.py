"""
expand_stub_authors.py

Scans all publication index.md stubs for abbreviated author names
(e.g., "S Samtani", "BM Ampel") created by sync_scholar_publications.py.
Attempts to expand them using a lookup table built from all full author
names already present in the content directories.

If any names cannot be resolved, sends an email notification AND creates
a GitHub Issue so you can fix them manually.

Run: python scripts/expand_stub_authors.py

Optional environment variables:
  SMTP_FROM        Gmail address to send from  (e.g. you@gmail.com)
  SMTP_PASSWORD    Gmail App Password           (not your account password)
  SMTP_TO          Recipient address            (default: bampel@gsu.edu)
  SMTP_HOST        SMTP host                    (default: smtp.gmail.com)
  SMTP_PORT        SMTP port                    (default: 587)
  GITHUB_TOKEN     Auto-set in GH Actions; used to create an Issue
  GITHUB_REPOSITORY  Auto-set in GH Actions    (e.g. BenAmpel/Bampel_Website)
"""

import json
import os
import re
import smtplib
import ssl
import urllib.request
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

ROOT         = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "content"

SECTION_DIRS = [
    "journal_publication",
    "conference_publication",
    "workshop_publication",
]

AUTHOR_EMAIL = "bampel@gsu.edu"   # default notification recipient

# Matches abbreviated names like "S Samtani", "BM Ampel", "CH Yang"
# (1-4 uppercase initials, whitespace, then a title-cased last name)
ABBREV_RE = re.compile(r"^[A-Z]{1,4}\s+[A-Z][a-zA-Z'\-]+$")


# ---------------------------------------------------------------------------
# Author parsing helpers
# ---------------------------------------------------------------------------

def is_abbreviated(name: str) -> bool:
    return bool(ABBREV_RE.match(name.strip()))


def _read_authors(path: Path) -> list:
    """Return the authors list from an index.md front-matter block."""
    text = path.read_text(encoding="utf-8", errors="ignore")
    if not text.startswith("---"):
        return []
    parts = text.split("---", 2)
    if len(parts) < 3:
        return []

    authors = []
    in_authors = False
    for line in parts[1].splitlines():
        stripped = line.strip()
        if stripped.startswith("authors:"):
            in_authors = True
            continue
        if in_authors:
            if re.match(r"^\s*-\s+", line):          # "- name" or "  - name"
                author = re.sub(r"^\s*-\s+", "", line).strip()
                if author:
                    authors.append(author)
            elif stripped == "":
                continue                               # blank line inside block
            else:
                break                                  # new YAML key → end of block
    return authors


def _rewrite_authors(path: Path, new_authors: list) -> bool:
    """
    Replace the authors block in index.md with new_authors.
    Preserves indentation style of the original file (2-space or no-space).
    Returns True if the file was changed.
    """
    text = path.read_text(encoding="utf-8", errors="ignore")

    # Detect indent style used in this file
    indent = "  " if re.search(r"\n  - ", text) else ""

    new_block = "authors:\n" + "".join(
        f"{indent}- {a}\n" for a in new_authors
    )

    # Match the authors: block (handles both indent styles, optional blank lines)
    pattern = re.compile(
        r"(authors:\n)(?:[ \t]*-[ \t]+[^\n]*\n|\n)*",
        re.MULTILINE,
    )
    new_text, count = pattern.subn(new_block, text, count=1)

    if count == 0 or new_text == text:
        return False

    path.write_text(new_text, encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# Build lookup table from existing full author names
# ---------------------------------------------------------------------------

def build_author_lookup() -> dict:
    """
    Scan all index.md files and collect full author names (non-abbreviated,
    non-admin).  Build a (first_initial, last_name_lower) → [full_name, ...]
    mapping for fast lookup.
    """
    lookup: dict = {}
    seen: set = set()

    for section in SECTION_DIRS:
        for path in (CONTENT_ROOT / section).rglob("index.md"):
            for name in _read_authors(path):
                if name == "admin" or is_abbreviated(name) or name in seen:
                    continue
                seen.add(name)

                parts = name.strip().split()
                # Strip middle initials ("J.") and suffixes ("Jr.", "II")
                parts = [
                    p for p in parts
                    if not re.match(r"^[A-Z]\.$", p)
                    and not re.match(r"^(Jr|Sr|II|III)\.?$", p, re.I)
                ]
                if len(parts) < 2:
                    continue

                first   = parts[0]
                last    = parts[-1].lower()
                initial = first[0].lower()
                key     = (initial, last)
                if name not in lookup.get(key, []):
                    lookup.setdefault(key, []).append(name)

    return lookup


# ---------------------------------------------------------------------------
# Expand abbreviated names
# ---------------------------------------------------------------------------

def expand_authors(authors: list, lookup: dict) -> tuple:
    """
    Returns (expanded_list, unresolved_abbrevs).
    Unresolved = abbreviated names with zero OR multiple matches (ambiguous).
    """
    expanded   = []
    unresolved = []

    for name in authors:
        if name == "admin" or not is_abbreviated(name):
            expanded.append(name)
            continue

        parts       = name.strip().split()
        last        = parts[-1].lower()
        first_init  = parts[0][0].lower()     # first letter of initials
        key         = (first_init, last)
        matches     = lookup.get(key, [])

        if len(matches) == 1:
            expanded.append(matches[0])       # unambiguous match ✓
        elif len(matches) > 1:
            # Multiple matches — check if they're all the same person
            # (e.g., "Matthew Hashim" vs "Matthew J. Hashim")
            first_names = {m.split()[0] for m in matches}
            if len(first_names) == 1:
                # Same first name → same person, pick the most complete form
                expanded.append(max(matches, key=len))
            else:
                expanded.append(name)         # genuinely ambiguous, flag it
                unresolved.append(name)
        else:
            expanded.append(name)             # no match found, flag it
            unresolved.append(name)

    return expanded, unresolved


# ---------------------------------------------------------------------------
# Notification helpers
# ---------------------------------------------------------------------------

def notify_unresolved(unresolved_map: dict):
    """
    unresolved_map: {relative_path_str: [unresolved_name, ...]}
    Tries email first, then GitHub issue, always prints to stdout.
    """
    if not unresolved_map:
        return

    lines = [
        "The following publication stubs contain author names that could not",
        "be automatically expanded.  Please update them manually and re-run",
        "build_publications_json.py to rebuild the site index.\n",
    ]
    for rel_path, names in unresolved_map.items():
        lines.append(f"  File: {rel_path}")
        for n in names:
            lines.append(f"    • {n}  ← could not resolve")
        lines.append("")
    lines += [
        "Tip: add the full name to any existing publication page that lists",
        "this author, then re-run expand_stub_authors.py to auto-fill.",
    ]
    body = "\n".join(lines)

    print("\n" + "=" * 60)
    print("UNRESOLVED AUTHOR NAMES — manual action required")
    print("=" * 60)
    print(body)

    _try_send_email(body, list(unresolved_map.keys()))
    _try_github_issue(body, list(unresolved_map.keys()))


def _try_send_email(body: str, paths: list):
    smtp_from = os.environ.get("SMTP_FROM")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    smtp_to   = os.environ.get("SMTP_TO", AUTHOR_EMAIL)
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    if not smtp_from or not smtp_pass:
        print("\n[email] SMTP_FROM/SMTP_PASSWORD not set — skipping email notification.")
        return

    subject = (
        f"[bampel.com] Unresolved author names in "
        f"{len(paths)} publication stub(s) — action required"
    )
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = smtp_from
    msg["To"]      = smtp_to
    msg.attach(MIMEText(body, "plain"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(smtp_from, smtp_pass)
            server.sendmail(smtp_from, smtp_to, msg.as_string())
        print(f"\n[email] Notification sent to {smtp_to}.")
    except Exception as exc:
        print(f"\n[email] Failed to send: {exc}")


def _try_github_issue(body: str, paths: list):
    token = os.environ.get("GITHUB_TOKEN")
    repo  = os.environ.get("GITHUB_REPOSITORY")

    if not token or not repo:
        print("[github] GITHUB_TOKEN/GITHUB_REPOSITORY not set — skipping issue.")
        return

    title   = f"[bampel.com] Unresolved author names in {len(paths)} publication stub(s)"
    api_url = f"https://api.github.com/repos/{repo}/issues"
    headers = {
        "Authorization":        f"Bearer {token}",
        "Accept":               "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type":         "application/json",
    }

    def _post(payload):
        data = json.dumps(payload).encode()
        req  = urllib.request.Request(api_url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())

    try:
        issue = _post({"title": title, "body": body, "labels": ["needs-review"]})
        print(f"\n[github] Issue created: #{issue['number']} {issue['html_url']}")
    except Exception:
        # Label may not exist — retry without it
        try:
            issue = _post({"title": title, "body": body})
            print(f"\n[github] Issue created: #{issue['number']} {issue['html_url']}")
        except Exception as exc:
            print(f"\n[github] Failed to create issue: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=== Expand Stub Author Names ===")

    lookup = build_author_lookup()
    print(f"Author lookup: {len(lookup)} (initial, last_name) entries from existing pages.")

    expanded_files = 0
    unresolved_map: dict = {}

    for section in SECTION_DIRS:
        for path in sorted((CONTENT_ROOT / section).rglob("index.md")):
            authors = _read_authors(path)
            if not authors:
                continue

            abbreviated = [a for a in authors if a != "admin" and is_abbreviated(a)]
            if not abbreviated:
                continue    # nothing to do for this file

            new_authors, unresolved = expand_authors(authors, lookup)
            changed = _rewrite_authors(path, new_authors)

            rel = str(path.relative_to(ROOT))
            if changed:
                resolved = [n for n in new_authors if n not in authors]
                expanded_files += 1
                print(f"  [OK]      {rel}")
                print(f"            expanded: {resolved}")

            if unresolved:
                unresolved_map[rel] = unresolved
                print(f"  [PARTIAL] {rel}")
                print(f"            unresolved: {unresolved}")

    if expanded_files == 0 and not unresolved_map:
        print("No abbreviated author names found — nothing to do.")
    else:
        print(f"\nExpanded {expanded_files} file(s). "
              f"Unresolved in {len(unresolved_map)} file(s).")
        notify_unresolved(unresolved_map)


if __name__ == "__main__":
    main()
