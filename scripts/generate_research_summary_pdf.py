#!/usr/bin/env python3
import json
from datetime import datetime
from pathlib import Path

import yaml
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    FrameBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)


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
    author_counts = []
    for pub in publications:
        pub_type = pub.get("type")
        if pub_type in counts:
            counts[pub_type] += 1
        year = pub.get("year")
        if isinstance(year, int):
            years.append(year)
        authors = pub.get("authors") or []
        author_counts.append(len(authors))

    year_range = f"{min(years)}-{max(years)}" if years else "n/a"
    avg_authors = sum(author_counts) / len(author_counts) if author_counts else None
    return {
        "citations": citations,
        "h_index": h_index,
        "i10": i10,
        "velocity": velocity,
        "counts": counts,
        "year_range": year_range,
        "avg_authors": avg_authors,
    }


def select_latest_manuscripts(publications):
    def sort_key(pub):
        return (pub.get("date") or "", pub.get("year") or 0)

    items = sorted(publications, key=sort_key, reverse=True)
    latest = []
    for pub in items:
        if not pub.get("title"):
            continue
        latest.append(pub)
        if len(latest) == 3:
            break
    return latest


def truncate(text, limit=220):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "..."


def build_pdf():
    author_path = ROOT / "content" / "authors" / "admin" / "_index.md"
    config_path = ROOT / "config" / "_default" / "config.yaml"
    params_path = ROOT / "config" / "_default" / "params.yaml"
    publications_path = ROOT / "static" / "data" / "publications.json"
    scholar_path = ROOT / "static" / "data" / "scholar-metrics.json"
    awards_path = ROOT / "static" / "data" / "awards.json"
    teaching_path = ROOT / "static" / "data" / "teaching.json"
    collab_path = ROOT / "static" / "data" / "collaboration_meta.json"

    author_data = load_yaml_front_matter(author_path)
    config_data = load_yaml_file(config_path)
    params_data = load_yaml_file(params_path)
    publications = load_json(publications_path, [])
    scholar = load_json(scholar_path, {})
    awards = load_json(awards_path, [])
    teaching = load_json(teaching_path, [])
    collab_meta = load_json(collab_path, {})

    name = author_data.get("title") or "Benjamin M. Ampel"
    role = author_data.get("role", "")
    orgs = author_data.get("organizations", [])
    org = orgs[0]["name"] if orgs else ""
    email = author_data.get("email", "")
    base_url = str(config_data.get("baseURL", "")).strip().rstrip("/")
    summary = params_data.get("marketing", {}).get("seo", {}).get("description", "")
    interests = author_data.get("interests") or scholar.get("metrics", {}).get("interests") or []

    summary = truncate(summary, 240)
    metrics = build_metrics(publications, scholar)
    latest = select_latest_manuscripts(publications)

    top_venues = {}
    for pub in publications:
        venue = pub.get("venue")
        if venue:
            top_venues[venue] = top_venues.get(venue, 0) + 1
    top_venue = sorted(top_venues.items(), key=lambda x: (-x[1], x[0]))[0][0] if top_venues else "n/a"
    top_venue_list = [v for v, _ in sorted(top_venues.items(), key=lambda x: (-x[1], x[0]))[:6]]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / "research-summary.pdf"
    static_path = STATIC_DIR / "research-summary.pdf"

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleStyle", fontSize=18, leading=22, textColor=colors.black))
    styles.add(ParagraphStyle(name="SectionTitle", fontSize=10.5, leading=12, spaceAfter=4, textColor=colors.black))
    styles.add(ParagraphStyle(name="BodySmall", fontSize=9, leading=11, textColor=colors.black))
    styles.add(ParagraphStyle(name="Meta", fontSize=8, leading=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="MetricLabel", fontSize=8, leading=10, textColor=colors.black))
    styles.add(ParagraphStyle(name="MetricValue", fontSize=8, leading=10, textColor=colors.black))
    styles.add(ParagraphStyle(name="BulletItem", fontSize=8.5, leading=10.5, leftIndent=10))

    page_width, page_height = letter
    left_margin = 0.65 * inch
    right_margin = 0.65 * inch
    top_margin = 0.6 * inch
    bottom_margin = 0.6 * inch
    usable_width = page_width - left_margin - right_margin
    usable_height = page_height - top_margin - bottom_margin

    header_height = 1.1 * inch
    column_gap = 0.28 * inch
    column_height = usable_height - header_height - 0.1 * inch
    column_width = (usable_width - column_gap) / 2

    doc = BaseDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=top_margin,
        bottomMargin=bottom_margin,
        title="Research Summary",
        author=name,
    )

    header_frame = Frame(
        left_margin,
        page_height - top_margin - header_height,
        usable_width,
        header_height,
        id="header",
        showBoundary=0,
    )
    left_frame = Frame(
        left_margin,
        bottom_margin,
        column_width,
        column_height,
        id="col_left",
        showBoundary=0,
    )
    right_frame = Frame(
        left_margin + column_width + column_gap,
        bottom_margin,
        column_width,
        column_height,
        id="col_right",
        showBoundary=0,
    )
    doc.addPageTemplates([PageTemplate(id="two_col", frames=[header_frame, left_frame, right_frame])])

    story = []

    header_stack = []
    header_stack.append(Paragraph(f"<b>{name}</b>", styles["TitleStyle"]))
    if role or org:
        header_stack.append(Paragraph(f"{role} | {org}".strip(" |"), styles["BodySmall"]))
    contact_line = " | ".join([p for p in [email, base_url] if p])
    if contact_line:
        header_stack.append(Paragraph(contact_line, styles["Meta"]))

    accent_bar = Table(
        [["", header_stack]],
        colWidths=[0.12 * inch, usable_width - 0.12 * inch],
    )
    accent_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
        ("TOPPADDING", (1, 0), (1, 0), 2),
    ]))
    story.append(accent_bar)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.black))
    story.append(Spacer(1, 8))
    story.append(FrameBreak())

    if summary:
        story.append(Paragraph("Research Snapshot", styles["SectionTitle"]))
        story.append(Paragraph(summary, styles["BodySmall"]))
        story.append(Spacer(1, 6))

    story.append(Paragraph("Key Metrics", styles["SectionTitle"]))
    total_pubs = len(publications)
    citations = metrics.get("citations")
    avg_cites = None
    if citations and total_pubs:
        avg_cites = citations / total_pubs

    metric_rows = [
        ("Publications", total_pubs),
        ("J / C / W", f"{metrics['counts']['journal']} / {metrics['counts']['conference']} / {metrics['counts']['workshop']}"),
        ("Years Active", metrics.get("year_range", "n/a")),
        ("Citations", citations if citations is not None else "n/a"),
        ("h-index", metrics.get("h_index", "n/a")),
        ("i10-index", metrics.get("i10", "n/a")),
        ("Avg cites/paper", f"{avg_cites:.1f}" if avg_cites else "n/a"),
        ("Avg authors/paper", f"{metrics['avg_authors']:.1f}" if metrics.get("avg_authors") else "n/a"),
        ("Citation velocity", metrics.get("velocity", "n/a")),
        ("Top venue", top_venue),
    ]

    metrics_table = Table(
        [[Paragraph(f"<b>{label}</b>", styles["MetricLabel"]), Paragraph(str(value), styles["MetricValue"])]
         for label, value in metric_rows],
        colWidths=[1.5 * inch, column_width - 1.5 * inch],
    )
    metrics_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#999999")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f5f5")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(metrics_table)
    story.append(Spacer(1, 6))

    coauthors = set()
    for pub in publications:
        for author in pub.get("authors") or []:
            if "ampel" not in author.lower():
                coauthors.add(author)
    institutions = {inst.get("name") for inst in collab_meta.get("institutions", []) if inst.get("name")}
    countries = {inst.get("country") for inst in collab_meta.get("institutions", []) if inst.get("country")}

    story.append(Paragraph("Collaboration", styles["SectionTitle"]))
    story.append(Paragraph(f"Unique co-authors: {len(coauthors)}", styles["BodySmall"]))
    if institutions:
        story.append(Paragraph(f"Institutions: {len(institutions)}", styles["BodySmall"]))
    if countries:
        story.append(Paragraph(f"Countries: {len(countries)}", styles["BodySmall"]))
    story.append(Spacer(1, 8))

    # Teaching snapshot
    evals = [row.get("evaluation") for row in teaching if isinstance(row.get("evaluation"), (int, float))]
    avg_eval = sum(evals) / len(evals) if evals else None
    institutions_taught = {row.get("institution") for row in teaching if row.get("institution")}
    unique_courses = {row.get("course") for row in teaching if row.get("course")}
    if teaching:
        story.append(Paragraph("Teaching Snapshot", styles["SectionTitle"]))
        story.append(Paragraph(f"Courses taught: {len(teaching)} ({len(unique_courses)} unique)", styles["BodySmall"]))
        if avg_eval is not None:
            story.append(Paragraph(f"Avg evaluation: {avg_eval:.2f}/5", styles["BodySmall"]))
        if institutions_taught:
            story.append(Paragraph(f"Institutions: {len(institutions_taught)}", styles["BodySmall"]))
        story.append(Spacer(1, 8))

    story.append(FrameBreak())

    if interests:
        story.append(Paragraph("Research Focus", styles["SectionTitle"]))
        focus = ", ".join(interests[:6])
        story.append(Paragraph(focus, styles["BodySmall"]))
        story.append(Spacer(1, 8))

    if top_venue_list:
        story.append(Paragraph("Top Venues", styles["SectionTitle"]))
        for venue in top_venue_list:
            story.append(Paragraph(f"&bull; {venue}", styles["BulletItem"]))
        story.append(Spacer(1, 8))

    if latest:
        story.append(Paragraph("Latest Manuscripts", styles["SectionTitle"]))
        for pub in latest:
            title = truncate(pub.get("title", ""), 85)
            venue = pub.get("venue", "")
            year = pub.get("year", "")
            pub_type = pub.get("type", "")
            type_label = pub_type.capitalize() if pub_type else ""
            story.append(Paragraph(f"<b>{title}</b>", styles["BodySmall"]))
            meta_parts = [p for p in [venue, str(year) if year else "", type_label] if p]
            if meta_parts:
                story.append(Paragraph(" | ".join(meta_parts), styles["Meta"]))
            story.append(Spacer(1, 6))

    if awards:
        story.append(Paragraph("Recent Awards", styles["SectionTitle"]))
        def award_sort(a):
            end = a.get("endYear") or a.get("year") or 0
            return int(end)
        for item in sorted(awards, key=award_sort, reverse=True)[:4]:
            year = item.get("endYear") or item.get("year") or ""
            title = item.get("title", "")
            story.append(Paragraph(f"&bull; {year} — {truncate(title, 70)}", styles["BulletItem"]))
        story.append(Spacer(1, 8))

    if scholar.get("citationsByYear"):
        story.append(Paragraph("Citation Trend", styles["SectionTitle"]))
        trend = sorted(scholar["citationsByYear"], key=lambda x: int(x.get("year", 0)), reverse=True)[:3]
        for item in trend:
            story.append(Paragraph(f"&bull; {item.get('year')}: {item.get('citations')}", styles["BulletItem"]))
        story.append(Spacer(1, 6))

    generated = datetime.now().strftime("%Y-%m-%d")
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"Generated on {generated}", styles["Meta"]))

    doc.build(story)

    static_path.write_bytes(output_path.read_bytes())
    return output_path, static_path


if __name__ == "__main__":
    build_pdf()
