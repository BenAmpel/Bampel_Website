#!/usr/bin/env python3
"""
Generate co-author network graph AND export network statistics.
"""

import json
import math
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from collections import defaultdict
from pathlib import Path
from networkx.algorithms import community

# --- CONFIGURATION ---
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
# Ensure this points to the correct file (some setups use scholar-metrics.json)
PUBLICATIONS_FILE = PROJECT_ROOT / "static" / "data" / "publications.json"
OUTPUT_IMG_DIR = PROJECT_ROOT / "static" / "images"
OUTPUT_DATA_FILE = PROJECT_ROOT / "static" / "data" / "network_stats.json"

AUTHOR_NORMALIZATION = {
    'B Ampel': 'Benjamin Ampel', 'Benjamin Ampel': 'Benjamin Ampel',
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
    'S Yang': 'Shanchieh Yang'
}

MAIN_AUTHOR = 'Benjamin Ampel'

def normalize_name(name):
    if not isinstance(name, str):
        return ""
    name = name.strip()
    return AUTHOR_NORMALIZATION.get(name, name)

def is_main_author(name):
    normalized = normalize_name(name)
    return normalized == MAIN_AUTHOR or 'ampel' in name.lower()

def load_publications():
    with open(PUBLICATIONS_FILE, 'r') as f:
        data = json.load(f)
    # Support both list-of-pubs or dict-wrapper formats
    if isinstance(data, dict) and "individualPublications" in data:
        return data["individualPublications"]
    return data

def build_network_data(publications):
    """Build graph and count data."""
    G = nx.Graph()
    G.add_node(MAIN_AUTHOR)
    coauthor_counts = defaultdict(int)

    for pub in publications:
        # [FIX] Handle both String ("A, B") and List (["A", "B"]) formats
        raw_authors = pub.get('authors', '')
        
        if isinstance(raw_authors, list):
            author_list = raw_authors
        elif isinstance(raw_authors, str):
            author_list = raw_authors.split(',')
        else:
            continue # Skip invalid formats

        # Normalize and filter
        authors = [normalize_name(a) for a in author_list]
        authors = [a for a in authors if a and a.strip()]
        
        # Add edges between all co-authors (Clique)
        for i in range(len(authors)):
            for j in range(i + 1, len(authors)):
                u, v = authors[i], authors[j]
                if u == v: continue
                
                # Update counts relative to Main Author
                if is_main_author(u) and not is_main_author(v):
                    coauthor_counts[v] += 1
                elif is_main_author(v) and not is_main_author(u):
                    coauthor_counts[u] += 1
                
                # Add edge to graph (weighted)
                if G.has_edge(u, v):
                    G[u][v]['weight'] += 1
                else:
                    G.add_edge(u, v, weight=1)
    
    return G, dict(coauthor_counts)

def calculate_stats(G, coauthor_counts):
    """Calculate interesting network metrics for the dashboard."""
    
    # 1. Basic Metrics
    density = nx.density(G)
    clustering = nx.average_clustering(G)
    
    # 2. LCC (Largest Connected Component)
    if len(G) > 0:
        lcc = max(nx.connected_components(G), key=len)
        lcc_pct = len(lcc) / len(G)
    else:
        lcc_pct = 0

    # 3. Community Detection (Sub-groups)
    # Remove main author temporarily to find distinct sub-groups
    G_sub = G.copy()
    if MAIN_AUTHOR in G_sub:
        G_sub.remove_node(MAIN_AUTHOR)
    
    clusters = []
    try:
        # Using Greedy Modularity
        communities = community.greedy_modularity_communities(G_sub)
        for i, c in enumerate(communities):
            if i >= 3: break # Take top 3 clusters
            
            # Identify top members in this cluster
            members = list(c)
            members.sort(key=lambda x: coauthor_counts.get(x, 0), reverse=True)
            top_members = members[:3]
            
            clusters.append({
                "id": i + 1,
                "size": len(c),
                "top_members": top_members
            })
    except Exception as e:
        print(f"Community detection info: {e}")
        clusters = []

    return {
        "density": round(density, 3),
        "clustering_coeff": round(clustering, 3),
        "lcc_percentage": round(lcc_pct * 100, 1),
        "total_nodes": len(G.nodes),
        "total_edges": len(G.edges),
        "clusters": clusters
    }

def create_radial_layout(G, center_node, coauthor_counts):
    pos = {}
    pos[center_node] = (0, 0)
    other_nodes = [n for n in G.nodes() if n != center_node]
    other_nodes.sort(key=lambda x: coauthor_counts.get(x, 0), reverse=True)
    frequent = [n for n in other_nodes if coauthor_counts.get(n, 0) >= 5]
    moderate = [n for n in other_nodes if 2 <= coauthor_counts.get(n, 0) < 5]
    occasional = [n for n in other_nodes if coauthor_counts.get(n, 0) < 2]
    
    def place_ring(nodes, radius, start_angle=0):
        if not nodes: return
        angle_step = 2 * math.pi / len(nodes)
        for i, node in enumerate(nodes):
            angle = start_angle + i * angle_step
            r = radius + np.random.uniform(-0.1, 0.1)
            pos[node] = (r * math.cos(angle), r * math.sin(angle))
    
    np.random.seed(42)
    place_ring(frequent, 1.5, start_angle=0.2)
    place_ring(moderate, 2.8, start_angle=0.5)
    place_ring(occasional, 4.0, start_angle=0.1)
    return pos

def draw_network_plot(G, coauthor_counts, dark_mode=False):
    if dark_mode:
        bg_color, text_color, primary_color = '#0d1117', '#e6edf3', '#58a6ff'
        frequent_color, moderate_color, occasional_color = '#7ee787', '#d29922', '#8b949e'
        glow_color = '#58a6ff'
    else:
        bg_color, text_color, primary_color = '#ffffff', '#1f2328', '#0969da'
        frequent_color, moderate_color, occasional_color = '#1a7f37', '#9a6700', '#656d76'
        glow_color = '#0969da'

    fig, ax = plt.subplots(figsize=(14, 12), facecolor=bg_color)
    ax.set_facecolor(bg_color)
    
    # We use a simplified star-graph for visualization layout
    VisG = nx.Graph()
    VisG.add_node(MAIN_AUTHOR)
    for author, count in coauthor_counts.items():
        VisG.add_node(author)
        VisG.add_edge(MAIN_AUTHOR, author, weight=count)
        
    pos = create_radial_layout(VisG, MAIN_AUTHOR, coauthor_counts)
    
    # Draw Edges
    for u, v, data in VisG.edges(data=True):
        weight = data['weight']
        alpha = min(0.2 + weight * 0.1, 0.7)
        width = 0.5 + weight * 0.8
        if u in pos and v in pos:
            x = [pos[u][0], pos[v][0]]
            y = [pos[u][1], pos[v][1]]
            ax.plot(x, y, color=primary_color, alpha=alpha, linewidth=width, solid_capstyle='round', zorder=1)
    
    # Draw Nodes
    for node in VisG.nodes():
        if node not in pos: continue
        x, y = pos[node]
        
        if node == MAIN_AUTHOR:
            size = 5000
            for gs, ga in [(7000, 0.1), (6000, 0.15), (5500, 0.2)]:
                ax.scatter([x], [y], s=gs, c=glow_color, alpha=ga, zorder=2)
            ax.scatter([x], [y], s=size, c=primary_color, edgecolors='white', linewidths=3, zorder=3)
            ax.annotate('Benjamin\nAmpel', (x, y), fontsize=13, fontweight='bold', color='white', ha='center', va='center', zorder=5)
        else:
            count = coauthor_counts.get(node, 0)
            if count >= 5: c, s, fs = frequent_color, 2500 + count * 150, 9
            elif count >= 2: c, s, fs = moderate_color, 1800 + count * 100, 8
            else: c, s, fs = occasional_color, 1400, 7
            
            ax.scatter([x], [y], s=s, c=c, edgecolors='white', linewidths=2, alpha=0.9, zorder=3)
            display_name = node.replace(' ', '\n', 1) if ' ' in node else node
            
            # Text Shadow
            for dx, dy in [(-1,-1), (-1,1), (1,-1), (1,1)]:
                 ax.annotate(display_name, (x+dx*0.015, y+dy*0.015), fontsize=fs, color='black', ha='center', va='center', fontweight='bold', zorder=4)
            ax.annotate(display_name, (x, y), fontsize=fs, color='white', ha='center', va='center', fontweight='bold', zorder=5)
            
    ax.set_xlim(-5.5, 5.5); ax.set_ylim(-5.7, 5.7); ax.axis('off')
    return fig

def main():
    OUTPUT_IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DATA_FILE.parent.mkdir(parents=True, exist_ok=True)

    # 1. Load Data & Build Graph
    publications = load_publications()
    if not publications:
        print("No publications found. Exiting.")
        return

    G, coauthor_counts = build_network_data(publications)

    # 2. Calculate & Save Stats (JSON)
    print("Calculating network statistics...")
    stats = calculate_stats(G, coauthor_counts)
    with open(OUTPUT_DATA_FILE, 'w') as f:
        json.dump(stats, f, indent=2)
    print(f"  Saved stats to: {OUTPUT_DATA_FILE}")

    # 3. Generate Images (Light/Dark)
    fig_light = draw_network_plot(G, coauthor_counts, dark_mode=False)
    fig_light.savefig(OUTPUT_IMG_DIR / 'coauthor-network.png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close(fig_light)
    
    fig_dark = draw_network_plot(G, coauthor_counts, dark_mode=True)
    fig_dark.savefig(OUTPUT_IMG_DIR / 'coauthor-network-dark.png', dpi=150, bbox_inches='tight', facecolor='#0d1117')
    plt.close(fig_dark)
    
    print("Done!")

if __name__ == '__main__':
    main()