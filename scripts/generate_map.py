#!/usr/bin/env python3
"""
Generate a beautiful research map image showing presentation venues and collaborator locations.

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
from matplotlib.patches import FancyBboxPatch
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
    """Generate a beautiful map visualization using cartopy."""
    if not HAS_CARTOPY:
        print("Cartopy required for map generation")
        return None
        
    data = load_locations()
    
    # Color schemes - more vibrant and modern
    if dark_mode:
        bg_color = '#0f172a'  # Slate 900
        land_color = '#1e293b'  # Slate 800
        ocean_color = '#0c1929'  # Deep navy
        border_color = '#334155'  # Slate 700
        text_color = '#f1f5f9'  # Slate 100
        presentation_color = '#3b82f6'  # Blue 500
        presentation_glow = '#60a5fa'  # Blue 400
        collaborator_color = '#10b981'  # Emerald 500
        collaborator_glow = '#34d399'  # Emerald 400
        accent_color = '#8b5cf6'  # Violet 500
        muted_color = '#94a3b8'  # Slate 400
    else:
        bg_color = '#f8fafc'  # Slate 50
        land_color = '#e2e8f0'  # Slate 200
        ocean_color = '#dbeafe'  # Blue 100
        border_color = '#cbd5e1'  # Slate 300
        text_color = '#1e293b'  # Slate 800
        presentation_color = '#2563eb'  # Blue 600
        presentation_glow = '#3b82f6'  # Blue 500
        collaborator_color = '#059669'  # Emerald 600
        collaborator_glow = '#10b981'  # Emerald 500
        accent_color = '#7c3aed'  # Violet 600
        muted_color = '#64748b'  # Slate 500
    
    # Create figure with Robinson projection
    fig = plt.figure(figsize=(16, 9), facecolor=bg_color)
    ax = fig.add_subplot(1, 1, 1, projection=ccrs.Robinson())
    ax.set_facecolor(ocean_color)
    
    # Set global extent
    ax.set_global()
    
    # Add subtle grid
    gl = ax.gridlines(draw_labels=False, linewidth=0.3, color=border_color, 
                      alpha=0.5, linestyle='--')
    
    # Add map features with styling
    ax.add_feature(cfeature.LAND, facecolor=land_color, edgecolor='none')
    ax.add_feature(cfeature.COASTLINE, linewidth=0.5, edgecolor=border_color)
    ax.add_feature(cfeature.BORDERS, linewidth=0.3, edgecolor=border_color, 
                   linestyle=':', alpha=0.7)
    
    # Plot presentation venues with glow effect
    for loc in data['presentations']:
        # Glow effect (larger, transparent circle behind)
        ax.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=28, 
                color=presentation_glow, alpha=0.3,
                transform=ccrs.PlateCarree(), zorder=4)
        ax.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=20, 
                color=presentation_glow, alpha=0.4,
                transform=ccrs.PlateCarree(), zorder=4)
        # Main marker
        ax.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=14, 
                color=presentation_color, 
                markeredgecolor='white', markeredgewidth=2.5,
                transform=ccrs.PlateCarree(), zorder=5)
        
        # Get short label
        name_parts = loc['name'].split('(')
        label = name_parts[0].strip() if len(name_parts[0].strip()) <= 6 else loc['name'].split()[0]
        years_str = ', '.join(loc['years'][-2:])  # Last 2 years
        
        # Smart label positioning
        offset_x, offset_y = 8, 8
        ha = 'left'
        va = 'bottom'
        
        # Adjust for crowded areas
        if loc['lng'] > 50:  # Asia
            offset_x = -8
            ha = 'right'
        if loc['lat'] < 25:  # Lower latitudes
            offset_y = -8
            va = 'top'
            
        ax.annotate(f"{label}\n({years_str})", 
                   xy=(loc['lng'], loc['lat']),
                   xytext=(offset_x, offset_y),
                   textcoords='offset points',
                   fontsize=8, fontweight='bold',
                   color=text_color, ha=ha, va=va,
                   transform=ccrs.PlateCarree(),
                   bbox=dict(boxstyle='round,pad=0.3', facecolor=bg_color, 
                            edgecolor=presentation_color, alpha=0.9, linewidth=1),
                   zorder=6)
    
    # Plot collaborator institutions with glow effect
    for loc in data['collaborators']:
        # Skip "Current" location (GSU)
        if 'Current' in str(loc.get('collaborators', [])):
            # Special marker for current location
            ax.plot(loc['lng'], loc['lat'], 
                    marker='*', markersize=22, 
                    color=accent_color, 
                    markeredgecolor='white', markeredgewidth=2,
                    transform=ccrs.PlateCarree(), zorder=6)
        else:
            # Glow effect
            ax.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=18, 
                    color=collaborator_glow, alpha=0.3,
                    transform=ccrs.PlateCarree(), zorder=4)
            ax.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=14, 
                    color=collaborator_glow, alpha=0.4,
                    transform=ccrs.PlateCarree(), zorder=4)
            # Main marker
            ax.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=11,
                    color=collaborator_color,
                    markeredgecolor='white', markeredgewidth=2,
                    transform=ccrs.PlateCarree(), zorder=5)
    
    # Title with styling
    fig.suptitle('Global Research Footprint', fontsize=22, fontweight='bold',
                 color=text_color, y=0.96)
    
    # Subtitle
    ax.set_title('Conference presentations and research collaborations worldwide', 
                 fontsize=11, color=muted_color, style='italic', pad=10)
    
    # Create custom legend with better styling
    legend_elements = [
        plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=presentation_color,
                   markersize=12, markeredgecolor='white', markeredgewidth=2,
                   label='Conference Presentations'),
        plt.Line2D([0], [0], marker='D', color='w', markerfacecolor=collaborator_color,
                   markersize=10, markeredgecolor='white', markeredgewidth=2,
                   label='Collaborator Institutions'),
        plt.Line2D([0], [0], marker='*', color='w', markerfacecolor=accent_color,
                   markersize=14, markeredgecolor='white', markeredgewidth=1.5,
                   label='Current Institution (GSU)'),
    ]
    
    legend = ax.legend(handles=legend_elements, loc='lower left', 
                       frameon=True, fontsize=10, facecolor=bg_color,
                       edgecolor=border_color, framealpha=0.95)
    legend.get_frame().set_linewidth(1.5)
    for text in legend.get_texts():
        text.set_color(text_color)
    
    # Add stats footer
    num_presentations = len(data['presentations'])
    num_collaborators = len(data['collaborators'])
    total_years = set()
    for loc in data['presentations']:
        total_years.update(loc['years'])
    
    stats_text = f"{num_presentations} Conference Venues  |  {num_collaborators} Collaborating Institutions  |  {len(total_years)} Years of Presentations"
    fig.text(0.5, 0.02, stats_text, ha='center', fontsize=10, 
             color=muted_color, style='italic')
    
    plt.tight_layout(rect=[0, 0.04, 1, 0.94])
    
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
                          facecolor='#f8fafc', edgecolor='none')
        plt.close(fig_light)
        print(f"  Saved: {light_path}")
    
    # Generate dark mode
    print("Generating dark mode map...")
    fig_dark = draw_map(dark_mode=True)
    if fig_dark:
        dark_path = OUTPUT_DIR / 'research-map-dark.png'
        fig_dark.savefig(dark_path, dpi=150, bbox_inches='tight', 
                         facecolor='#0f172a', edgecolor='none')
        plt.close(fig_dark)
        print(f"  Saved: {dark_path}")
    
    print("\nDone! Map images generated successfully.")


if __name__ == '__main__':
    main()
