#!/usr/bin/env python3
"""
Build a single dashboard payload for client-side consumers.

This moves normalization and derived metrics out of the browser so the
dashboard and impact snapshot can render from one cached JSON file.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import yaml


SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
STATIC_DATA = PROJECT_ROOT / "static" / "data"
DATA_DIR = PROJECT_ROOT / "data"

PUBLICATIONS_FILE = STATIC_DATA / "publications.json"
SCHOLAR_FILE = STATIC_DATA / "scholar-metrics.json"
AWARDS_FILE = STATIC_DATA / "awards.json"
VISITOR_FILE = STATIC_DATA / "visitor_stats.json"
CV_TOPICS_FILE = STATIC_DATA / "cv_topics.json"
DASHBOARD_NETWORK_FILE = STATIC_DATA / "dashboard_network.json"
IMPACT_MAP_FILE = DATA_DIR / "impact_map.yaml"
OUTPUT_FILE = STATIC_DATA / "dashboard_payload.json"

STATE_MAP = {
    "Alabama": "AL",
    "Alaska": "AK",
    "Arizona": "AZ",
    "Arkansas": "AR",
    "California": "CA",
    "Colorado": "CO",
    "Connecticut": "CT",
    "Delaware": "DE",
    "District of Columbia": "DC",
    "Florida": "FL",
    "Georgia": "GA",
    "Hawaii": "HI",
    "Idaho": "ID",
    "Illinois": "IL",
    "Indiana": "IN",
    "Iowa": "IA",
    "Kansas": "KS",
    "Kentucky": "KY",
    "Louisiana": "LA",
    "Maine": "ME",
    "Maryland": "MD",
    "Massachusetts": "MA",
    "Michigan": "MI",
    "Minnesota": "MN",
    "Mississippi": "MS",
    "Missouri": "MO",
    "Montana": "MT",
    "Nebraska": "NE",
    "Nevada": "NV",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "OH",
    "Oklahoma": "OK",
    "Oregon": "OR",
    "Pennsylvania": "PA",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "TN",
    "Texas": "TX",
    "Utah": "UT",
    "Vermont": "VT",
    "Virginia": "VA",
    "Washington": "WA",
    "West Virginia": "WV",
    "Wisconsin": "WI",
    "Wyoming": "WY",
}

CITY_COORDS = {
    "Lanzhou|China": [36.0611, 103.8343],
    "Arlington|United States": [38.8816, -77.0910],
    "Boardman|United States": [45.8399, -119.7011],
    "Hanoi|Vietnam": [21.0278, 105.8342],
    "Sulaymaniyah|Iraq": [35.5650, 45.4329],
    "Ashburn|United States": [39.0438, -77.4874],
    "Atlanta|United States": [33.7490, -84.3880],
    "College Park|United States": [33.6534, -84.4494],
    "Ha Long|Vietnam": [20.9712, 107.0448],
    "Johns Creek|United States": [34.0289, -84.1986],
    "Jupiter|United States": [26.9342, -80.0942],
    "Kanawha|United States": [38.3362, -81.4807],
    "London|United Kingdom": [51.5072, -0.1276],
    "Madrid|Spain": [40.4168, -3.7038],
    "Manama|Bahrain": [26.2235, 50.5876],
    "New York|United States": [40.7128, -74.0060],
    "Phoenix|United States": [33.4484, -112.0740],
    "Quito|Ecuador": [-0.1807, -78.4678],
    "Rome|Italy": [41.9028, 12.4964],
    "Seattle|United States": [47.6062, -122.3321],
    "Singapore|Singapore": [1.3521, 103.8198],
    "Tehran|Iran": [35.6892, 51.3890],
}

TOPIC_TAXONOMY = {
    "AI / Deep Learning": ["Deep Learning", "Neural", "Transfer Learning", "Embedding", "Machine Learning", "Artificial Intelligence", "Adversarial"],
    "Cybersecurity": ["Cyber", "Vulnerability", "Exploit", "Attack", "Threat", "Security", "Malicious", "Ransomware", "Phishing"],
    "LLMs & NLP": ["Large Language Model", "LLM", "Text Analytics", "NLP", "Transformer", "Bert", "GPT", "Language Models"],
    "Hacker Communities": ["Hacker", "Forum", "Dark Web", "Paste", "Community", "Marketplace", "Underground"],
    "Design Science": ["Design Science", "Framework", "Artifact", "System", "Implementation", "Prototyping"],
    "Behavioral": ["Nudging", "Bias", "Social", "Human", "Behavior", "Psychology", "Decision", "Trust"],
}

STOP_WORDS = {
    "the", "of", "and", "in", "to", "a", "for", "on", "with", "using",
    "an", "based", "via", "system", "analysis", "approach", "study",
    "framework", "model", "data", "from", "by", "detection", "paper",
    "research", "towards"
}


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_publications():
    data = load_json(PUBLICATIONS_FILE, [])
    if isinstance(data, dict) and "individualPublications" in data:
        data = data["individualPublications"]
    return data if isinstance(data, list) else []


def load_yaml(path: Path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or default


def normalize(value: str) -> str:
    return (value or "").strip().lower()


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize(title))


def clean_venue_name(value: str) -> str:
    if not value:
        return ""
    venue = value.split(",")[0].strip()
    venue = re.sub(r"\s+forthcoming$", "", venue, flags=re.I).strip()
    venue = re.sub(r"\s+in press$", "", venue, flags=re.I).strip()
    venue = re.sub(r"\s+\d+(\s*\(\d+\))?.*$", "", venue, flags=re.I).strip()
    venue = re.sub(r"management information systems quarterly\s*\(misq\)", "MIS Quarterly", venue, flags=re.I)
    venue = re.sub(r"management information systems quarterly", "MIS Quarterly", venue, flags=re.I)
    return venue


def to_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", normalize(clean_venue_name(value))).strip()


def flatten_journal_list(raw):
    entries = raw if isinstance(raw, list) else raw.get("journals", [])
    flattened = []
    for item in entries:
        if isinstance(item, str):
            flattened.append(item)
            continue
        aliases = item.get("aliases", []) if isinstance(item, dict) else []
        name = item.get("name") if isinstance(item, dict) else None
        flattened.extend([name, *aliases])
    return [entry for entry in flattened if entry]


def matches_list(venue: str, aliases) -> bool:
    venue_key = to_key(venue)
    if not venue_key:
        return False
    for alias in aliases:
        alias_key = to_key(alias)
        if not alias_key:
            continue
        if venue_key == alias_key:
            return True
        pattern = re.compile(rf"(^|\s){re.sub(r'\s+', r'\\s+', alias_key)}(\s|$)")
        if pattern.search(venue_key):
            return True
    return False


def merge_publication_citations(publications, scholar):
    scholar_pubs = scholar.get("individualPublications", []) if isinstance(scholar, dict) else []
    citation_map = {}
    for publication in scholar_pubs:
        title = publication.get("title")
        if title:
            citation_map[normalize_title(title)] = int(publication.get("citations") or 0)

    merged = []
    for publication in publications:
        item = dict(publication)
        key = normalize_title(item.get("title", ""))
        item["citations"] = citation_map.get(key, int(item.get("citations") or 0))
        merged.append(item)
    return merged


def classify_topic(title: str) -> str:
    text = normalize(title)
    for category, keywords in TOPIC_TAXONOMY.items():
        if any(normalize(keyword) in text for keyword in keywords):
            return category
    return "Other"


def compute_focus_metrics(publications):
    current_year = max((int(publication.get("year") or 0) for publication in publications), default=0)
    counts = {key: 0 for key in TOPIC_TAXONOMY}
    recent = {key: 0 for key in TOPIC_TAXONOMY}
    for publication in publications:
        topic = classify_topic(publication.get("title", ""))
        if topic in counts:
            counts[topic] += 1
            year = int(publication.get("year") or 0)
            if current_year and year >= current_year - 2:
                recent[topic] += 1

    focus = max(counts.items(), key=lambda item: item[1])[0] if counts else "Cybersecurity"
    emerging = max(recent.items(), key=lambda item: item[1])[0] if recent else "AI / Deep Learning"
    return {"primaryFocus": focus, "emergingFocus": emerging}


def build_impact_graph(publications):
    nodes = []
    links = []

    for index, publication in enumerate(publications):
        title = publication.get("title", "")
        words = re.sub(r"[^a-z0-9 ]", " ", normalize(title)).split()
        filtered_words = {word for word in words if len(word) > 3 and word not in STOP_WORDS}
        raw_authors = publication.get("authors") or []
        if isinstance(raw_authors, str):
            raw_authors = raw_authors.split(",")
        authors = sorted({normalize(author) for author in raw_authors if author and "ampel" not in normalize(author)})
        venue = normalize(publication.get("venue", ""))
        citations = int(publication.get("citations") or 0)
        nodes.append({
            "id": index,
            "name": title,
            "value": citations,
            "year": publication.get("year"),
            "authors": publication.get("authors"),
            "venue": publication.get("venue"),
            "type": publication.get("type"),
            "topic": publication.get("topic") or classify_topic(title),
            "symbolSize": max(10, min(65, math.log(citations + 2) * 9)),
            "_words": sorted(filtered_words),
            "_authors": authors,
            "_venue": venue,
        })

    for left in range(len(nodes)):
        for right in range(left + 1, len(nodes)):
            node_left = nodes[left]
            node_right = nodes[right]
            common_words = len(set(node_left["_words"]).intersection(node_right["_words"]))
            common_authors = len(set(node_left["_authors"]).intersection(node_right["_authors"]))
            same_venue = bool(node_left["_venue"] and node_left["_venue"] == node_right["_venue"])

            score = 0
            reasons = []
            if common_words > 0:
                score += common_words
                reasons.append(f"{common_words} Keywords")
            if same_venue:
                score += 2.0
                reasons.append("Same Venue")
            if common_authors > 0:
                score += common_authors * 3.0
                reasons.append(f"{common_authors} Co-Authors")

            if score >= 1.5:
                avg_cites = (node_left["value"] + node_right["value"]) / 2
                impact_bonus = math.log(avg_cites + 1) * 1.5
                links.append({
                    "source": left,
                    "target": right,
                    "value": score + impact_bonus,
                    "reason": ", ".join(reasons),
                    "types": {
                        "topic": common_words > 0,
                        "venue": same_venue,
                        "author": common_authors > 0,
                    },
                    "lineStyle": {
                        "width": min((score * 0.5) + impact_bonus, 5),
                        "opacity": min(0.15 + (score * 0.1), 0.7),
                        "curveness": 0.2,
                    },
                })

    for node in nodes:
        node.pop("_words", None)
        node.pop("_authors", None)
        node.pop("_venue", None)

    return {"nodes": nodes, "links": links}


def count_by_type(publications, publication_type: str) -> int:
    target = normalize(publication_type)
    return sum(1 for publication in publications if normalize(publication.get("type")) == target)


def count_by_venue(publications, aliases):
    matching = [
        publication
        for publication in publications
        if normalize(publication.get("type")) == "journal"
        and matches_list(publication.get("venue") or publication.get("publication") or "", aliases)
    ]
    venues = sorted({clean_venue_name(publication.get("venue") or publication.get("publication") or "") for publication in matching if publication.get("venue") or publication.get("publication")})
    return {"count": len(matching), "venues": venues}


def build_impact_stats(publications, scholar, awards):
    q1_list = flatten_journal_list(load_json(STATIC_DATA / "journal_lists" / "q1.json", []))
    ft50_list = flatten_journal_list(load_json(STATIC_DATA / "journal_lists" / "ft50.json", []))
    utd24_list = flatten_journal_list(load_json(STATIC_DATA / "journal_lists" / "utd24.json", []))
    combined_top_list = sorted(set(q1_list + ft50_list + utd24_list))
    scholar_pubs = scholar.get("individualPublications", []) if isinstance(scholar, dict) else []

    seen_titles = set()
    top_list_publications = []

    def add_publication(publication):
        title_key = normalize_title(publication.get("title", ""))
        if not title_key or title_key in seen_titles:
            return
        seen_titles.add(title_key)
        top_list_publications.append(publication)

    for publication in publications:
        add_publication(publication)

    for publication in scholar_pubs:
        if matches_list(publication.get("venue", ""), combined_top_list):
            add_publication({"title": publication.get("title", ""), "venue": publication.get("venue", ""), "type": "journal"})

    journals = count_by_type(publications, "journal")
    conferences = count_by_type(publications, "conference")
    workshops = count_by_type(publications, "workshop")
    total = journals + conferences + workshops or len(publications)
    latest_year = max((int(publication.get("year") or 0) for publication in publications), default=0)
    latest_year_count = sum(1 for publication in publications if int(publication.get("year") or 0) == latest_year)

    best_paper_awards = [award for award in awards if re.search(r"best paper", award.get("title", ""), re.I)]
    q1 = count_by_venue(top_list_publications, q1_list)
    ft50 = count_by_venue(top_list_publications, ft50_list)
    utd24 = count_by_venue(top_list_publications, utd24_list)

    return {
        "updatedLabel": scholar.get("lastUpdated") if isinstance(scholar, dict) else None,
        "latestYear": latest_year,
        "latestYearCount": latest_year_count,
        "journals": {
            "value": journals,
            "base": total,
            "meta": f"{journals} of {total} total publications" if total else "",
            "tooltip": "Peer-reviewed journal articles.",
        },
        "conferences": {
            "value": conferences,
            "base": total,
            "meta": f"{conferences} of {total} total publications" if total else "",
            "tooltip": "Conference papers and proceedings.",
        },
        "workshops": {
            "value": workshops,
            "base": total,
            "meta": f"{workshops} of {total} total publications" if total else "",
            "tooltip": "Workshop and pre-conference papers.",
        },
        "best-paper": {
            "value": len(best_paper_awards),
            "base": max(len(awards), 1),
            "meta": f"{len(best_paper_awards)} of {len(awards)} awards" if awards else "",
            "tooltip": (
                "Best Paper Awards in " + ", ".join(str(award.get("year")) for award in best_paper_awards if award.get("year"))
                if best_paper_awards
                else "Best Paper Awards"
            ),
        },
        "q1": {
            "value": q1["count"],
            "base": max(journals, 1),
            "meta": f"{q1['count']} of {journals} journal pubs" if journals else "",
            "tooltip": f"Q1 venues: {', '.join(q1['venues'])}" if q1["venues"] else "Q1 journal venues",
        },
        "ft50": {
            "value": ft50["count"],
            "base": max(journals, 1),
            "meta": f"{ft50['count']} of {journals} journal pubs" if journals else "",
            "tooltip": f"FT50 venues: {', '.join(ft50['venues'])}" if ft50["venues"] else "FT50 journal venues",
        },
        "utd24": {
            "value": utd24["count"],
            "base": max(journals, 1),
            "meta": f"{utd24['count']} of {journals} journal pubs" if journals else "",
            "tooltip": f"UTD24 venues: {', '.join(utd24['venues'])}" if utd24["venues"] else "UTD24 journal venues",
        },
    }


def is_valid_location(value: str) -> bool:
    text = (value or "").strip()
    return bool(text) and text != "(not set)"


def normalize_country(country: str) -> str:
    return "USA" if country == "United States" else country


def normalize_region(region: str, country: str) -> str:
    if not is_valid_location(region):
        return ""
    if country == "United States":
        return STATE_MAP.get(region, region)
    return region


def normalize_location_entry(item):
    city = item.get("city", "")
    region = item.get("region", "")
    country = item.get("country", "")
    if not (is_valid_location(city) and is_valid_location(country)):
        return None
    count = int(item.get("visitors") or item.get("users") or 0)
    normalized_country = normalize_country(country)
    normalized_region = normalize_region(region, country)
    display = ", ".join(
        part for part in [city, normalized_region or "—", normalized_country or "—"] if part
    )
    coords = CITY_COORDS.get(f"{city}|{country}")
    payload = {
        "city": city,
        "region": normalized_region,
        "country": normalized_country,
        "countryRaw": country,
        "visitors": count,
        "display": display,
    }
    if coords:
        payload["lat"] = coords[0]
        payload["lng"] = coords[1]
    return payload


def build_visitor_payload(visitor):
    ranges = {
        "30": visitor.get("top_locations_30") or visitor.get("top_locations") or [],
        "90": visitor.get("top_locations_90") or visitor.get("top_locations") or [],
        "all": visitor.get("top_locations_all") or visitor.get("top_locations") or [],
    }

    normalized_ranges = {}
    for range_key, entries in ranges.items():
        normalized = [normalize_location_entry(item) for item in entries]
        normalized = [item for item in normalized if item]
        normalized.sort(key=lambda item: item["visitors"], reverse=True)
        total = sum(item["visitors"] for item in normalized) or 1
        us_count = sum(item["visitors"] for item in normalized if item["countryRaw"] == "United States")
        intl_count = max(0, total - us_count)
        us_pct = round((us_count / total) * 100)
        region_counts = {}
        for item in normalized:
            region_key = f"{item['region']}, {item['country']}" if item["region"] else item["country"]
            region_counts[region_key] = region_counts.get(region_key, 0) + item["visitors"]
        top_region = max(region_counts.items(), key=lambda pair: pair[1])[0] if region_counts else "—"
        normalized_ranges[range_key] = {
            "locations": normalized,
            "usPct": us_pct,
            "intlPct": max(0, 100 - us_pct),
            "topRegion": top_region,
            "topThreeWithCoords": [item for item in normalized if "lat" in item and "lng" in item][:3],
        }

    return {
        "monthlyTrend": visitor.get("monthly_trend", []),
        "devices": visitor.get("devices", []),
        "topPages": visitor.get("top_pages", []),
        "totalLast30Days": int(visitor.get("total_last_30_days") or 0),
        "lifetimeTotal": int(visitor.get("lifetime_total") or 0),
        "ranges": normalized_ranges,
    }


def enrich_footprint_points():
    points = load_yaml(IMPACT_MAP_FILE, [])
    enriched = []
    all_years = []
    for point in points:
        title = point.get("title", "")
        desc = point.get("description", "")
        year_matches = re.findall(r"(?:19|20)\d{2}", f"{title} {desc}")
        years = sorted({int(match) for match in year_matches})
        min_year = years[0] if years else None
        max_year = years[-1] if years else None
        if max_year:
            all_years.append(max_year)
        enriched.append(
            {
                "title": title,
                "lat": point.get("lat"),
                "lng": point.get("lng"),
                "location": point.get("location"),
                "desc": desc,
                "cat": point.get("category"),
                "years": years,
                "minYear": min_year,
                "maxYear": max_year,
            }
        )

    filtered = [point for point in enriched if point["cat"] in {"Conference", "Institution"} and point["minYear"]]
    filtered.sort(key=lambda point: point["minYear"])
    routes = []
    for index in range(len(filtered) - 1):
        routes.append(
            {
                "from": {"lat": filtered[index]["lat"], "lng": filtered[index]["lng"], "title": filtered[index]["title"]},
                "to": {"lat": filtered[index + 1]["lat"], "lng": filtered[index + 1]["lng"], "title": filtered[index + 1]["title"]},
                "year": filtered[index + 1]["minYear"],
            }
        )

    return {
        "points": enriched,
        "routes": routes,
        "minYear": min(all_years) if all_years else None,
        "maxYear": max(all_years) if all_years else None,
    }


def main():
    publications = load_publications()
    scholar = load_json(SCHOLAR_FILE, {})
    awards = load_json(AWARDS_FILE, [])
    visitor = load_json(VISITOR_FILE, {})
    cv_topics = load_json(CV_TOPICS_FILE, {})
    dashboard_network = load_json(DASHBOARD_NETWORK_FILE, {})

    merged_publications = merge_publication_citations(publications, scholar)
    for publication in merged_publications:
        publication["topic"] = classify_topic(publication.get("title", ""))

    payload = {
        "papers": merged_publications,
        "metrics": compute_focus_metrics(merged_publications),
        "impactGraph": build_impact_graph(merged_publications),
        "scholar": {
            "lastUpdated": scholar.get("lastUpdated"),
            "metrics": scholar.get("metrics", {}),
            "citationsByYear": scholar.get("citationsByYear", []),
        },
        "impactStats": build_impact_stats(merged_publications, scholar, awards),
        "visitor": build_visitor_payload(visitor),
        "topics": cv_topics.get("topics", []),
        "network": dashboard_network,
        "footprint": enrich_footprint_points(),
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
