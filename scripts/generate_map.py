#!/usr/bin/env python3
"""
Generate a research map image showing presentation venues and collaborator locations.

Usage:
    pip install matplotlib cartopy
    python generate_map.py

Output:
    - ../static/images/research-map.png (light mode)
    - ../static/images/research-map-dark.png (dark mode)
"""

import json
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
LOCATIONS_FILE = PROJECT_ROOT / "static" / "data" / "locations.json"
OUTPUT_DIR = PROJECT_ROOT / "static" / "images"


def load_locations():
    """Load locations from JSON file."""
    with open(LOCATIONS_FILE, 'r') as f:
        return json.load(f)


def draw_map(dark_mode=False):
    """Generate the map visualization using basic matplotlib."""
    data = load_locations()
    
    # Colors
    if dark_mode:
        bg_color = '#0d1117'
        text_color = '#e6edf3'
        presentation_color = '#58a6ff'
        collaborator_color = '#3fb950'
        land_color = '#21262d'
        border_color = '#30363d'
        muted_color = '#8b949e'
    else:
        bg_color = '#ffffff'
        text_color = '#1f2328'
        presentation_color = '#0969da'
        collaborator_color = '#1a7f37'
        land_color = '#f0f0f0'
        border_color = '#d0d7de'
        muted_color = '#656d76'
    
    fig, ax = plt.subplots(figsize=(14, 8), facecolor=bg_color)
    ax.set_facecolor(bg_color)
    
    # Simple world map background (rough outline)
    # US bounding box approximate
    ax.set_xlim(-170, 30)
    ax.set_ylim(0, 75)
    
    # Draw a simple representation
    ax.fill([-125, -125, -65, -65, -125], [25, 50, 50, 25, 25], 
            color=land_color, alpha=0.5, edgecolor=border_color, linewidth=1)
    
    # Europe rough
    ax.fill([-10, -10, 40, 40, -10], [35, 60, 60, 35, 35], 
            color=land_color, alpha=0.5, edgecolor=border_color, linewidth=1)
    
    # Asia rough (for Thailand)
    ax.fill([90, 90, 110, 110, 90], [5, 25, 25, 5, 5], 
            color=land_color, alpha=0.5, edgecolor=border_color, linewidth=1)
    
    # Plot presentation venues
    for loc in data['presentations']:
        ax.scatter(loc['lng'], loc['lat'], s=200, c=presentation_color, 
                  edgecolors='white', linewidths=2, zorder=5, alpha=0.9)
        
        # Label
        offset_x = 3 if loc['lng'] < -100 else -3
        ha = 'left' if loc['lng'] < -100 else 'right'
        ax.annotate(f"{loc['name']}\n({', '.join(loc['years'])})", 
                   (loc['lng'], loc['lat']),
                   xytext=(offset_x, 5), textcoords='offset points',
                   fontsize=8, color=text_color, ha=ha, va='bottom',
                   fontweight='medium')
    
    # Plot collaborator institutions
    for loc in data['collaborators']:
        ax.scatter(loc['lng'], loc['lat'], s=150, c=collaborator_color,
                  edgecolors='white', linewidths=2, zorder=5, alpha=0.9,
                  marker='s')
        
        # Label
        offset_x = 3 if loc['lng'] < -100 else -3
        ha = 'left' if loc['lng'] < -100 else 'right'
        ax.annotate(f"{loc['institution']}", 
                   (loc['lng'], loc['lat']),
                   xytext=(offset_x, -10), textcoords='offset points',
                   fontsize=7, color=muted_color, ha=ha, va='top')
    
    # Title
    ax.set_title('Research Footprint', fontsize=18, fontweight='bold',
                color=text_color, pad=20)
    
    # Legend
    legend_elements = [
        plt.scatter([], [], s=100, c=presentation_color, edgecolors='white', 
                   linewidths=1.5, label='Conference Presentations'),
        plt.scatter([], [], s=80, c=collaborator_color, edgecolors='white',
                   linewidths=1.5, marker='s', label='Collaborator Institutions'),
    ]
    legend = ax.legend(handles=legend_elements, loc='lower left', 
                       frameon=True, fontsize=9)
    legend.get_frame().set_facecolor(bg_color)
    legend.get_frame().set_edgecolor(border_color)
    for text in legend.get_texts():
        text.set_color(text_color)
    
    ax.axis('off')
    
    return fig


def main():
    """Generate both light and dark mode map images."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate light mode
    print("Generating light mode map...")
    fig_light = draw_map(dark_mode=False)
    light_path = OUTPUT_DIR / 'research-map.png'
    fig_light.savefig(light_path, dpi=150, bbox_inches='tight', 
                      facecolor='white', edgecolor='none')
    plt.close(fig_light)
    print(f"  Saved: {light_path}")
    
    # Generate dark mode
    print("Generating dark mode map...")
    fig_dark = draw_map(dark_mode=True)
    dark_path = OUTPUT_DIR / 'research-map-dark.png'
    fig_dark.savefig(dark_path, dpi=150, bbox_inches='tight', 
                     facecolor='#0d1117', edgecolor='none')
    plt.close(fig_dark)
    print(f"  Saved: {dark_path}")
    
    print("\nDone! Map images generated successfully.")


if __name__ == '__main__':
    main()
