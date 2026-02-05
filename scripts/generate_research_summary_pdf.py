#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
STATIC_DIR = ROOT / "static" / "uploads"


def load_yaml_front_matter(path):
    text = path.read_text(errors="ignore")
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    return yaml.safe_load(parts[1]) or {}


def load_yaml_file(path):
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(errors="ignore")) or {}


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def build_metrics(publications, scholar):
    metrics = scholar.get("metrics", {}) if scholar else {}
    citations = metrics.get("citations")
    h_index = metrics.get("hIndex")
    i10 = metrics.get("i10Index")
    velocity = metrics.get("citationVelocity")

    counts = {"journal": 0, "conference": 0, "workshop": 0}
    years = []
    for pub in publications:
        pub_type = pub.get("type")
        if pub_type in counts:
            counts[pub_type] += 1
        year = pub.get("year")
        if isinstance(year, int):
            years.append(year)

    year_range = f"{min(years)}-{max(years)}" if years else "n/a"
    return {
        "citations": citations,
        "h_index": h_index,
        "i10": i10,
        "velocity": velocity,
        "counts": counts,
        "year_range": year_range,
    }


def select_publications(scholar, fallback):
    items = []
    if scholar and scholar.get("individualPublications"):
        items = scholar["individualPublications"]
        items = sorted(items, key=lambda x: x.get("citations", 0), reverse=True)
    else:
        items = sorted(fallback, key=lambda x: x.get("year", 0), reverse=True)

    selected = []
    for pub in items:
        title = pub.get("title")
        if not title:
            continue
        selected.append(pub)
        if len(selected) == 3:
            break
    return selected


def build_pdf():
    author_path = ROOT / "content" / "authors" / "admin" / "_index.md"
    config_path = ROOT / "config" / "_default" / "config.yaml"
    params_path = ROOT / "config" / "_default" / "params.yaml"
    publications_path = ROOT / "static" / "data" / "publications.json"
    scholar_path = ROOT / "static" / "data" / "scholar-metrics.json"

    author_data = load_yaml_front_matter(author_path)
    config_data = load_yaml_file(config_path)
    params_data = load_yaml_file(params_path)
    publications = load_json(publications_path, [])
    scholar = load_json(scholar_path, {})

    name = author_data.get("title") or "Benjamin M. Ampel"
    role = author_data.get("role", "")
    orgs = author_data.get("organizations", [])
    org = orgs[0]["name"] if orgs else ""
    email = author_data.get("email", "")
    base_url = str(config_data.get("baseURL", "")).strip()
    base_url = base_url.rstrip("/")
    summary = params_data.get("marketing", {}).get("seo", {}).get("description", "")
    interests = author_data.get("interests") or scholar.get("metrics", {}).get("interests") or []

    metrics = build_metrics(publications, scholar)
    selected = select_publications(scholar, publications)
    top_venues = {}
    for pub in publications:
        venue = pub.get("venue")
        if venue:
            top_venues[venue] = top_venues.get(venue, 0) + 1
    venue_list = [v for v, _ in sorted(top_venues.items(), key=lambda x: (-x[1], x[0]))[:6]]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / "research-summary.pdf"
    static_path = STATIC_DIR / "research-summary.pdf"

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="SectionTitle", fontSize=12, leading=14, spaceAfter=6, textColor=colors.HexColor("#00ff41")))
    styles.add(ParagraphStyle(name="BodySmall", fontSize=9.5, leading=12))
    styles.add(ParagraphStyle(name="Meta", fontSize=8.5, leading=11, textColor=colors.grey))

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title="Research Summary",
        author=name,
    )

    story = []
    story.append(Paragraph(f"<b>{name}</b>", ParagraphStyle("Title", fontSize=20, leading=24)))
    if role or org:
        story.append(Paragraph(f"{role} | {org}".strip(" |"), styles["BodySmall"]))
    contact_line = " | ".join([p for p in [email, base_url] if p])
    if contact_line:
        story.append(Paragraph(contact_line, styles["Meta"]))
    story.append(Spacer(1, 10))

    if summary:
        story.append(Paragraph("Research Summary", styles["SectionTitle"]))
        story.append(Paragraph(summary, styles["BodySmall"]))
        story.append(Spacer(1, 8))

    story.append(Paragraph("Research Metrics", styles["SectionTitle"]))
    venue_cell = Paragraph(", ".join(venue_list), styles["BodySmall"]) if venue_list else Paragraph("n/a", styles["BodySmall"])
    metrics_table = Table([
        ["Citations", "h-index", "i10-index"],
        [metrics.get("citations", "n/a"), metrics.get("h_index", "n/a"), metrics.get("i10", "n/a")],
        ["Publications", "J/C/W", "Citation Velocity"],
        [
            len(publications),
            f"{metrics['counts']['journal']}/{metrics['counts']['conference']}/{metrics['counts']['workshop']}",
            metrics.get("velocity", "n/a"),
        ],
        ["Years Active", "Top Venues", ""],
        [metrics.get("year_range", "n/a"), venue_cell, ""],
    ], colWidths=[1.4 * inch, 2.6 * inch, 1.8 * inch])

    metrics_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0d1117")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#0d1117")),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.white),
        ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#0d1117")),
        ("TEXTCOLOR", (0, 4), (-1, 4), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#1f2a36")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTNAME", (0, 4), (-1, 4), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 10))

    if interests:
        story.append(Paragraph("Research Focus", styles["SectionTitle"]))
        focus = ", ".join(interests[:6])
        story.append(Paragraph(focus, styles["BodySmall"]))
        story.append(Spacer(1, 8))

    if selected:
        story.append(Paragraph("Selected Publications", styles["SectionTitle"]))
        for pub in selected:
            title = pub.get("title", "")
            venue = pub.get("venue", "")
            year = pub.get("year", "")
            citations = pub.get("citations")
            line = f"<b>{title}</b> ({year})"
            story.append(Paragraph(line, styles["BodySmall"]))
            meta_parts = [p for p in [venue, f"Citations: {citations}" if citations is not None else ""] if p]
            if meta_parts:
                story.append(Paragraph(" | ".join(meta_parts), styles["Meta"]))
            story.append(Spacer(1, 4))

    generated = datetime.now().strftime("%Y-%m-%d")
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"Generated on {generated}", styles["Meta"]))

    doc.build(story)

    static_path.write_bytes(output_path.read_bytes())
    return output_path, static_path


if __name__ == "__main__":
    build_pdf()
