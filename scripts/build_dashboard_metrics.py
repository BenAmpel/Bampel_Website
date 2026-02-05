#!/usr/bin/env python3
"""
Precompute dashboard network metrics (centrality + collaboration) to reduce
client-side processing in the Research Dashboard.

Outputs:
  static/data/dashboard_network.json
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLICATIONS_FILE = PROJECT_ROOT / "static" / "data" / "publications.json"
SCHOLAR_FILE = PROJECT_ROOT / "static" / "data" / "scholar-metrics.json"
OUTPUT_FILE = PROJECT_ROOT / "static" / "data" / "dashboard_network.json"

NAME_MAP = {
    'B Ampel': 'Benjamin Ampel', 'BM Ampel': 'Benjamin Ampel', 'B. Ampel': 'Benjamin Ampel', 'admin': 'Benjamin Ampel',
    'H Chen': 'Hsinchun Chen', 'H. Chen': 'Hsinchun Chen',
    'S Samtani': 'Sagar Samtani', 'S. Samtani': 'Sagar Samtani',
    'S Ullman': 'Steven Ullman', 'S. Ullman': 'Steven Ullman',
    'H Zhu': 'Hongyi Zhu', 'H. Zhu': 'Hongyi Zhu',
    'M Patton': 'Mark Patton', 'M. Patton': 'Mark Patton',
    'B Lazarine': 'Ben Lazarine', 'B. Lazarine': 'Ben Lazarine',
    'T Vahedi': 'Tala Vahedi', 'T. Vahedi': 'Tala Vahedi',
    'K Otto': 'Kaeli Otto', 'K. Otto': 'Kaeli Otto',
    'Y Gao': 'Yang Gao', 'Y. Gao': 'Yang Gao',
    'J Hu': 'James Hu', 'J. Hu': 'James Hu',
    'CH Yang': 'Chi-Heng Yang', 'JF Nunamaker Jr': 'Jay Nunamaker',
    'C Marx': 'Carolin Marx', 'C Dacosta': 'Cade Dacosta',
    'C Zhang': 'Chengjun Zhang', 'M Hashim': 'Matthew Hashim',
    'M Wagner': 'Mason Wagner', 'RY Reyes': 'Raul Reyes',
    'S Yang': 'Shanchieh Yang', 'Y Li': 'Yidong Li', 'Y. Li': 'Yidong Li'
}

MAIN_AUTHOR = 'Benjamin Ampel'


def load_json(path: Path):
    if not path.exists():
        return None
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def normalize_title(title: str) -> str:
    clean = re.sub(r'[^a-z0-9 ]', ' ', (title or '').lower())
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def ensure_int(value):
    try:
        return int(value)
    except Exception:
        return None


def load_publications():
    data = load_json(PUBLICATIONS_FILE)
    if data is None:
        return []
    if isinstance(data, dict) and 'individualPublications' in data:
        data = data.get('individualPublications', [])
    return data if isinstance(data, list) else []


def load_citation_map():
    data = load_json(SCHOLAR_FILE)
    if not data:
        return {}
    pubs = data.get('individualPublications', [])
    citations = {}
    for pub in pubs:
        title = pub.get('title')
        if not title:
            continue
        citations[normalize_title(title)] = int(pub.get('citations') or 0)
    return citations


def normalize_name(name: str) -> str:
    clean = re.sub(r'\s+', ' ', (name or '').strip())
    if ',' in clean:
        parts = [p.strip() for p in clean.split(',') if p.strip()]
        if len(parts) >= 2:
            clean = f"{parts[1]} {parts[0]}"
    return NAME_MAP.get(clean, clean)


def author_list(raw):
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str):
        items = raw.split(',')
    else:
        items = []
    return [a.strip() for a in items if a and str(a).strip()]


def percentile(arr, p):
    if not arr:
        return 0
    sorted_vals = sorted(arr)
    idx = int((len(sorted_vals) - 1) * p)
    return sorted_vals[idx]


def compute_centrality(publications):
    n = len(publications)
    if n == 0:
        return {
            'papers': [],
            'metrics': {'density': 0, 'avgPath': 0, 'clustering': 0},
            'thresholds': {'topic': 0, 'venue': 0, 'author': 0, 'citation': 0},
            'maxLinks': {'topic': 1, 'venue': 1, 'author': 1}
        }

    adj = [[] for _ in range(n)]
    degrees = [0] * n
    topic_links = [0] * n
    venue_links = [0] * n
    author_links = [0] * n

    author_sets = []
    word_sets = []

    for pub in publications:
        authors = author_list(pub.get('authors', []))
        author_sets.append({re.sub(r'\s+', ' ', a.lower()).strip() for a in authors if a})
        title = (pub.get('title') or '').lower()
        title = re.sub(r'[^a-z0-9 ]', ' ', title)
        word_sets.append({w for w in title.split() if len(w) > 4})

    for i in range(n):
        for j in range(i + 1, n):
            p1 = publications[i]
            p2 = publications[j]
            weight = 0
            if p1.get('venue') and p1.get('venue') == p2.get('venue'):
                weight += 1
                venue_links[i] += 1
                venue_links[j] += 1

            common_words = len(word_sets[i].intersection(word_sets[j]))
            if common_words > 0:
                weight += common_words * 0.5
                topic_links[i] += common_words
                topic_links[j] += common_words

            common_authors = len(author_sets[i].intersection(author_sets[j]))
            if common_authors > 0:
                author_links[i] += common_authors
                author_links[j] += common_authors

            if weight > 0.5:
                adj[i].append(j)
                adj[j].append(i)
                degrees[i] += 1
                degrees[j] += 1

    def compute_eigen():
        scores = [1.0] * n
        for _ in range(10):
            next_scores = [0.0] * n
            for i in range(n):
                for nbr in adj[i]:
                    next_scores[i] += scores[nbr]
            max_val = max(next_scores) or 1
            scores = [v / max_val for v in next_scores]
        return scores

    eigen_scores = compute_eigen()

    betweenness = [0] * n
    for s in range(n):
        queue = [s]
        preds = [[] for _ in range(n)]
        levels = [-1] * n
        levels[s] = 0
        while queue:
            v = queue.pop(0)
            for w in adj[v]:
                if levels[w] == -1:
                    levels[w] = levels[v] + 1
                    queue.append(w)
                if levels[w] == levels[v] + 1:
                    preds[w].append(v)
        for i in range(n):
            if i != s and levels[i] > 0:
                for p in preds[i]:
                    betweenness[p] += 1

    edge_count = sum(degrees) / 2
    density = (2 * edge_count) / (n * (n - 1)) if n > 1 else 0

    total_dist = 0
    total_pairs = 0
    for i in range(n):
        dist = [-1] * n
        dist[i] = 0
        queue = [i]
        while queue:
            v = queue.pop(0)
            for w in adj[v]:
                if dist[w] == -1:
                    dist[w] = dist[v] + 1
                    queue.append(w)
        for j in range(i + 1, n):
            if dist[j] > 0:
                total_dist += dist[j]
                total_pairs += 1

    avg_path = (total_dist / total_pairs) if total_pairs else 0

    adj_sets = [set(lst) for lst in adj]
    total_cluster = 0
    cluster_count = 0
    for i in range(n):
        neighbors = adj[i]
        k = len(neighbors)
        if k < 2:
            continue
        links = 0
        for a in range(k):
            for b in range(a + 1, k):
                if neighbors[b] in adj_sets[neighbors[a]]:
                    links += 1
        total_cluster += (2 * links) / (k * (k - 1))
        cluster_count += 1

    clustering_coeff = (total_cluster / cluster_count) if cluster_count else 0

    centrality_info = []
    for i, pub in enumerate(publications):
        centrality_info.append({
            'index': i,
            'title': pub.get('title'),
            'year': ensure_int(pub.get('year')),
            'venue': pub.get('venue'),
            'citations': int(pub.get('citations') or 0),
            'eigen': eigen_scores[i],
            'between': betweenness[i],
            'degree': degrees[i],
            'topicLinks': topic_links[i],
            'venueLinks': venue_links[i],
            'authorLinks': author_links[i],
            'authors': author_list(pub.get('authors'))
        })

    topic_thresh = percentile(topic_links, 0.75)
    venue_thresh = percentile(venue_links, 0.75)
    author_thresh = percentile(author_links, 0.75)
    cite_thresh = percentile([c.get('citations', 0) for c in centrality_info], 0.75)

    max_topic = max(topic_links) if topic_links else 1
    max_venue = max(venue_links) if venue_links else 1
    max_author = max(author_links) if author_links else 1

    return {
        'papers': centrality_info,
        'metrics': {
            'density': round(density, 4),
            'avgPath': round(avg_path, 4),
            'clustering': round(clustering_coeff, 4)
        },
        'thresholds': {
            'topic': topic_thresh,
            'venue': venue_thresh,
            'author': author_thresh,
            'citation': cite_thresh
        },
        'maxLinks': {
            'topic': max_topic,
            'venue': max_venue,
            'author': max_author
        }
    }


def build_collaboration_range(publications, current_year, years_back=None):
    if years_back:
        min_year = current_year - years_back + 1
        filtered = [p for p in publications if (ensure_int(p.get('year')) or 0) >= min_year]
    else:
        filtered = publications

    node_counts = defaultdict(int)
    link_counts = defaultdict(int)
    author_meta = {}
    max_count = 0

    for pub in filtered:
        raw_authors = author_list(pub.get('authors'))
        authors = sorted({normalize_name(a) for a in raw_authors if a})
        if not authors:
            continue

        for author in authors:
            node_counts[author] += 1
            if author != MAIN_AUTHOR and node_counts[author] > max_count:
                max_count = node_counts[author]

            meta = author_meta.setdefault(author, {
                'count': 0,
                'years': set(),
                'venues': defaultdict(int),
                'coauthors': defaultdict(int)
            })
            meta['count'] += 1
            year_val = ensure_int(pub.get('year'))
            if year_val:
                meta['years'].add(year_val)
            venue = pub.get('venue')
            if venue:
                meta['venues'][venue] += 1

        for i in range(len(authors)):
            for j in range(i + 1, len(authors)):
                a = authors[i]
                b = authors[j]
                pair = "|".join(sorted([a, b]))
                link_counts[pair] += 1

                author_meta[a]['coauthors'][b] += 1
                author_meta[b]['coauthors'][a] += 1

    nodes = [{'id': name, 'count': count} for name, count in node_counts.items()]
    links = []
    for pair, count in link_counts.items():
        source, target = pair.split('|', 1)
        links.append({'source': source, 'target': target, 'count': count})

    meta_out = {}
    for name, meta in author_meta.items():
        meta_out[name] = {
            'count': meta['count'],
            'years': sorted(meta['years']),
            'venues': dict(meta['venues']),
            'coauthors': dict(meta['coauthors'])
        }

    return {
        'nodes': nodes,
        'links': links,
        'authorMeta': meta_out,
        'maxCount': max_count
    }


def compute_collaboration(publications):
    current_year = datetime.now().year
    ranges = {
        'all': build_collaboration_range(publications, current_year, None),
        '5': build_collaboration_range(publications, current_year, 5),
        '3': build_collaboration_range(publications, current_year, 3),
        '2': build_collaboration_range(publications, current_year, 2)
    }
    return {'currentYear': current_year, 'ranges': ranges}


def main():
    publications = load_publications()
    citations = load_citation_map()

    for pub in publications:
        key = normalize_title(pub.get('title') or '')
        if key in citations:
            pub['citations'] = citations[key]

    centrality = compute_centrality(publications)
    collaboration = compute_collaboration(publications)

    output = {
        'centrality': centrality,
        'collaboration': collaboration
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open('w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
