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

try:
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature
    HAS_CARTOPY = True
except ImportError:
    HAS_CARTOPY = False
    print("Warning: cartopy not installed. Run: pip install cartopy")

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
LOCATIONS_FILE = PROJECT_ROOT / "static" / "data" / "locations.json"
OUTPUT_DIR = PROJECT_ROOT / "static" / "images"


def load_locations():
    """Load locations from JSON file."""
    with open(LOCATIONS_FILE, 'r') as f:
        return json.load(f)


def draw_map(dark_mode=False):
    """Generate the map visualization using cartopy."""
    if not HAS_CARTOPY:
        print("Cartopy required for map generation")
        return None
        
    data = load_locations()
    
    # Colors
    if dark_mode:
        bg_color = '#0d1117'
        land_color = '#21262d'
        ocean_color = '#0d1117'
        border_color = '#30363d'
        text_color = '#e6edf3'
        presentation_color = '#58a6ff'
        collaborator_color = '#3fb950'
        muted_color = '#8b949e'
    else:
        bg_color = '#ffffff'
        land_color = '#e8e8e8'
        ocean_color = '#f0f7ff'
        border_color = '#cccccc'
        text_color = '#1f2328'
        presentation_color = '#0969da'
        collaborator_color = '#1a7f37'
        muted_color = '#656d76'
    
    # Create figure with Robinson projection (good for world maps)
    fig = plt.figure(figsize=(14, 7), facecolor=bg_color)
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.Robinson())
    ax.set_facecolor(ocean_color)
    
    # Set global extent
    ax.set_global()
    
    # Add map features
    ax.add_feature(cfeature.LAND, facecolor=land_color, edgecolor=border_color, linewidth=0.5)
    ax.add_feature(cfeature.COASTLINE, linewidth=0.3, edgecolor=border_color)
    ax.add_feature(cfeature.BORDERS, linewidth=0.2, edgecolor=border_color, linestyle=':')
    
    # Plot presentation venues
    for loc in data['presentations']:
        ax.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=12, 
                color=presentation_color, 
                markeredgecolor='white', markeredgewidth=2,
                transform=ccrs.PlateCarree(), zorder=5)
        
        # Add label with offset
        label = loc['name'].split('(')[0].strip()  # Get short name
        if len(label) > 10:
            label = loc['name'].split()[0]  # Just first word for long names
        
        # Determine label position based on location
        offset_x = 5
        ha = 'left'
        if loc['lng'] > 50:  # Asia
            offset_x = -5
            ha = 'right'
            
        ax.annotate(label, 
                   xy=(loc['lng'], loc['lat']),
                   xytext=(offset_x, 5),
                   textcoords='offset points',
                   fontsize=8, fontweight='bold',
                   color=text_color, ha=ha,
                   transform=ccrs.PlateCarree(),
                   zorder=6)
    
    # Plot collaborator institutions
    for loc in data['collaborators']:
        ax.plot(loc['lng'], loc['lat'], 
                marker='s', markersize=10,
                color=collaborator_color,
                markeredgecolor='white', markeredgewidth=2,
                transform=ccrs.PlateCarree(), zorder=5)
    
    # Title
    fig.suptitle('Research Footprint', fontsize=18, fontweight='bold',
                 color=text_color, y=0.95)
    
    # Legend
    legend_elements = [
        plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=presentation_color,
                   markersize=10, markeredgecolor='white', markeredgewidth=1.5,
                   label='Conference Presentations'),
        plt.Line2D([0], [0], marker='s', color='w', markerfacecolor=collaborator_color,
                   markersize=9, markeredgecolor='white', markeredgewidth=1.5,
                   label='Collaborator Institutions'),
    ]
    
    legend = ax.legend(handles=legend_elements, loc='lower left', 
                       frameon=True, fontsize=9, facecolor=bg_color,
                       edgecolor=border_color)
    for text in legend.get_texts():
        text.set_color(text_color)
    
    plt.tight_layout()
    
    return fig


def main():
    """Generate both light and dark mode map images."""
    if not HAS_CARTOPY:
        print("Error: cartopy is required. Install with: pip install cartopy")
        return
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate light mode
    print("Generating light mode map...")
    fig_light = draw_map(dark_mode=False)
    if fig_light:
        light_path = OUTPUT_DIR / 'research-map.png'
        fig_light.savefig(light_path, dpi=150, bbox_inches='tight', 
                          facecolor='white', edgecolor='none')
        plt.close(fig_light)
        print(f"  Saved: {light_path}")
    
    # Generate dark mode
    print("Generating dark mode map...")
    fig_dark = draw_map(dark_mode=True)
    if fig_dark:
        dark_path = OUTPUT_DIR / 'research-map-dark.png'
        fig_dark.savefig(dark_path, dpi=150, bbox_inches='tight', 
                         facecolor='#0d1117', edgecolor='none')
        plt.close(fig_dark)
        print(f"  Saved: {dark_path}")
    
    print("\nDone! Map images generated successfully.")


if __name__ == '__main__':
    main()
