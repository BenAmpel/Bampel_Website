#!/usr/bin/env python3
"""
Generate a visually appealing co-author network graph for the website.

Usage:
    python3 -m venv venv
    source venv/bin/activate
    pip install networkx matplotlib numpy
    python generate_network.py

Output:
    - ../static/images/coauthor-network.png (light mode)
    - ../static/images/coauthor-network-dark.png (dark mode)
"""

import json
import math
import os
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import LinearSegmentedColormap
import numpy as np
from collections import defaultdict
from pathlib import Path

# Get the script's directory to find relative paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLICATIONS_FILE = PROJECT_ROOT / "static" / "data" / "publications.json"
OUTPUT_DIR = PROJECT_ROOT / "static" / "images"

# Author name normalization map
AUTHOR_NORMALIZATION = {
    'B Ampel': 'Benjamin Ampel',
    'BM Ampel': 'Benjamin Ampel',
    'B. Ampel': 'Benjamin Ampel',
    'Benjamin Ampel': 'Benjamin Ampel',
    'H Chen': 'Hsinchun Chen',
    'H. Chen': 'Hsinchun Chen',
    'S Samtani': 'Sagar Samtani',
    'S. Samtani': 'Sagar Samtani',
    'S Ullman': 'Steven Ullman',
    'S. Ullman': 'Steven Ullman',
    'H Zhu': 'Hongyi Zhu',
    'H. Zhu': 'Hongyi Zhu',
    'M Patton': 'Mark Patton',
    'M. Patton': 'Mark Patton',
    'B Lazarine': 'Brian Lazarine',
    'B. Lazarine': 'Brian Lazarine',
    'T Vahedi': 'Taha Vahedi',
    'T. Vahedi': 'Taha Vahedi',
    'K Otto': 'Kristopher Otto',
    'K. Otto': 'Kristopher Otto',
    'Y Gao': 'Yue Gao',
    'Y. Gao': 'Yue Gao',
    'J Hu': 'Jiannan Hu',
    'J. Hu': 'Jiannan Hu',
    'CH Yang': 'C.H. Yang',
    'JF Nunamaker Jr': 'Jay F. Nunamaker Jr.',
    'C Marx': 'Christian Marx',
    'C Dacosta': 'Cade Dacosta',
    'C Zhang': 'Chengjun Zhang',
    'M Hashim': 'Matthew Hashim',
    'M Wagner': 'Mason Wagner',
    'RY Reyes': 'Raul Reyes',
    'S Yang': 'Shuo Yang',
}

MAIN_AUTHOR = 'Benjamin Ampel'


def normalize_name(name):
    """Normalize author name to canonical form."""
    name = name.strip()
    return AUTHOR_NORMALIZATION.get(name, name)


def is_main_author(name):
    """Check if this is the main author (Benjamin Ampel)."""
    normalized = normalize_name(name)
    return normalized == MAIN_AUTHOR or 'ampel' in name.lower()


def load_publications():
    """Load publications from JSON file."""
    with open(PUBLICATIONS_FILE, 'r') as f:
        return json.load(f)


def build_coauthor_counts(publications):
    """Build a dictionary of co-author collaboration counts."""
    counts = defaultdict(int)
    for pub in publications:
        authors = [normalize_name(a) for a in pub['authors']]
        for author in authors:
            if not is_main_author(author):
                counts[author] += 1
    return dict(counts)


def create_radial_layout(G, center_node, coauthor_counts):
    """Create a custom radial layout with the main author at center."""
    pos = {}
    pos[center_node] = (0, 0)
    
    # Sort co-authors by collaboration count (most frequent closest to center)
    other_nodes = [n for n in G.nodes() if n != center_node]
    other_nodes.sort(key=lambda x: coauthor_counts.get(x, 0), reverse=True)
    
    # Place nodes in concentric rings based on collaboration frequency
    frequent = [n for n in other_nodes if coauthor_counts.get(n, 0) >= 5]
    moderate = [n for n in other_nodes if 2 <= coauthor_counts.get(n, 0) < 5]
    occasional = [n for n in other_nodes if coauthor_counts.get(n, 0) < 2]
    
    def place_ring(nodes, radius, start_angle=0):
        if not nodes:
            return
        angle_step = 2 * math.pi / len(nodes)
        for i, node in enumerate(nodes):
            angle = start_angle + i * angle_step
            # Add slight randomness for organic feel
            r = radius + np.random.uniform(-0.1, 0.1)
            pos[node] = (r * math.cos(angle), r * math.sin(angle))
    
    np.random.seed(42)  # For reproducibility
    # Increased radii for larger nodes
    place_ring(frequent, 2.0, start_angle=0.2)
    place_ring(moderate, 3.8, start_angle=0.5)
    place_ring(occasional, 5.5, start_angle=0.1)
    
    return pos


def draw_network(dark_mode=False):
    """Generate the network visualization."""
    # Load data
    publications = load_publications()
    coauthor_counts = build_coauthor_counts(publications)
    
    # Create graph
    G = nx.Graph()
    G.add_node(MAIN_AUTHOR)
    
    for author, count in coauthor_counts.items():
        G.add_node(author)
        G.add_edge(MAIN_AUTHOR, author, weight=count)
    
    # Color schemes
    if dark_mode:
        bg_color = '#0d1117'
        text_color = '#e6edf3'
        primary_color = '#58a6ff'
        frequent_color = '#7ee787'
        moderate_color = '#d29922'
        occasional_color = '#8b949e'
        edge_color = 'rgba(88, 166, 255, 0.3)'
        glow_color = '#58a6ff'
    else:
        bg_color = '#ffffff'
        text_color = '#1f2328'
        primary_color = '#0969da'
        frequent_color = '#1a7f37'
        moderate_color = '#9a6700'
        occasional_color = '#656d76'
        edge_color = 'rgba(9, 105, 218, 0.2)'
        glow_color = '#0969da'
    
    # Create figure (larger to accommodate bigger nodes)
    fig, ax = plt.subplots(figsize=(18, 16), facecolor=bg_color)
    ax.set_facecolor(bg_color)
    
    # Get layout
    pos = create_radial_layout(G, MAIN_AUTHOR, coauthor_counts)
    
    # Draw edges with varying thickness and alpha
    for u, v, data in G.edges(data=True):
        weight = data['weight']
        alpha = min(0.2 + weight * 0.1, 0.7)
        width = 0.5 + weight * 0.8
        
        x = [pos[u][0], pos[v][0]]
        y = [pos[u][1], pos[v][1]]
        
        # Draw edge with gradient effect
        ax.plot(x, y, color=primary_color, alpha=alpha, linewidth=width, 
                solid_capstyle='round', zorder=1)
    
    # Draw nodes
    for node in G.nodes():
        x, y = pos[node]
        
        if node == MAIN_AUTHOR:
            # Main author - large prominent node with glow
            size = 5000
            color = primary_color
            
            # Glow effect
            for glow_size, glow_alpha in [(7000, 0.1), (6000, 0.15), (5500, 0.2)]:
                ax.scatter([x], [y], s=glow_size, c=glow_color, alpha=glow_alpha, zorder=2)
            
            ax.scatter([x], [y], s=size, c=color, edgecolors='white', 
                      linewidths=3, zorder=3)
            
            # Name label with shadow effect (white text, black outline)
            label_text = 'Benjamin\nAmpel'
            # Draw black shadow/outline
            for dx, dy in [(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)]:
                ax.annotate(label_text, (x + dx*0.02, y + dy*0.02), fontsize=13, fontweight='bold',
                           color='black', ha='center', va='center', zorder=4)
            # Draw white text on top
            ax.annotate(label_text, (x, y), fontsize=13, fontweight='bold',
                       color='white', ha='center', va='center', zorder=5)
        else:
            count = coauthor_counts.get(node, 0)
            
            # Determine color and size based on collaboration count (much larger nodes)
            if count >= 5:
                color = frequent_color
                size = 2500 + count * 150
                fontsize = 9
            elif count >= 2:
                color = moderate_color
                size = 1800 + count * 100
                fontsize = 8
            else:
                color = occasional_color
                size = 1400
                fontsize = 7
            
            # Draw node
            ax.scatter([x], [y], s=size, c=color, edgecolors='white', 
                      linewidths=2, alpha=0.9, zorder=3)
            
            # Use full name, split into two lines if needed
            parts = node.split()
            if len(parts) >= 2:
                # Split into first name(s) and last name
                display_name = ' '.join(parts[:-1]) + '\n' + parts[-1]
            else:
                display_name = node
            
            # Draw label inside the node with shadow effect
            # Draw black shadow/outline
            for dx, dy in [(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (1, 0), (0, -1), (0, 1)]:
                ax.annotate(display_name, (x + dx*0.015, y + dy*0.015), fontsize=fontsize,
                           color='black', ha='center', va='center', fontweight='bold', zorder=4)
            # Draw white text on top
            ax.annotate(display_name, (x, y), fontsize=fontsize,
                       color='white', ha='center', va='center', fontweight='bold', zorder=5)
    
    # Add title
    title_color = text_color
    ax.text(0, 7.2, 'Research Collaboration Network', fontsize=22, fontweight='bold',
            color=title_color, ha='center', va='center')
    
    # Add legend
    legend_elements = [
        mpatches.Patch(facecolor=primary_color, edgecolor='white', label='Benjamin Ampel'),
        mpatches.Patch(facecolor=frequent_color, edgecolor='white', label='Frequent (5+ papers)'),
        mpatches.Patch(facecolor=moderate_color, edgecolor='white', label='Moderate (2-4 papers)'),
        mpatches.Patch(facecolor=occasional_color, edgecolor='white', label='Occasional (1 paper)'),
    ]
    
    legend = ax.legend(handles=legend_elements, loc='upper left', 
                       frameon=True, fancybox=True, shadow=False,
                       fontsize=10, title='Collaboration Frequency',
                       title_fontsize=11)
    legend.get_frame().set_facecolor(bg_color)
    legend.get_frame().set_edgecolor(occasional_color)
    legend.get_frame().set_alpha(0.9)
    for text in legend.get_texts():
        text.set_color(text_color)
    legend.get_title().set_color(text_color)
    
    # Add stats
    total_collaborators = len(coauthor_counts)
    total_papers = len(publications)
    stats_text = f'{total_collaborators} Collaborators  •  {total_papers} Publications'
    ax.text(0, -7.0, stats_text, fontsize=11, color=occasional_color, 
            ha='center', va='center', style='italic')
    
    # Clean up axes
    ax.set_xlim(-7.5, 7.5)
    ax.set_ylim(-7.8, 7.8)
    ax.axis('off')
    ax.set_aspect('equal')
    
    plt.tight_layout()
    
    return fig


def main():
    """Generate both light and dark mode network images."""
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate light mode
    print("Generating light mode network...")
    fig_light = draw_network(dark_mode=False)
    light_path = OUTPUT_DIR / 'coauthor-network.png'
    fig_light.savefig(light_path, dpi=150, bbox_inches='tight', 
                      facecolor='white', edgecolor='none')
    plt.close(fig_light)
    print(f"  Saved: {light_path}")
    
    # Generate dark mode
    print("Generating dark mode network...")
    fig_dark = draw_network(dark_mode=True)
    dark_path = OUTPUT_DIR / 'coauthor-network-dark.png'
    fig_dark.savefig(dark_path, dpi=150, bbox_inches='tight', 
                     facecolor='#0d1117', edgecolor='none')
    plt.close(fig_dark)
    print(f"  Saved: {dark_path}")
    
    print("\nDone! Network images generated successfully.")


if __name__ == '__main__':
    main()
