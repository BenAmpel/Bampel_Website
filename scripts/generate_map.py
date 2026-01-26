#!/usr/bin/env python3
"""
Generate a beautiful research map image showing presentation venues and collaborator locations.
Includes a US inset map for better visualization of clustered US locations.

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
from matplotlib.patches import FancyBboxPatch, Rectangle
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
    """Generate a beautiful map visualization with US inset using cartopy."""
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
        inset_border = '#475569'  # Slate 600
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
        inset_border = '#94a3b8'  # Slate 400
    
    # Create figure
    fig = plt.figure(figsize=(16, 10), facecolor=bg_color)
    
    # Main world map (takes most of the space)
    ax_main = fig.add_axes([0.02, 0.15, 0.96, 0.75], projection=ccrs.Robinson())
    ax_main.set_facecolor(ocean_color)
    ax_main.set_global()
    
    # US inset map (bottom right)
    ax_us = fig.add_axes([0.58, 0.02, 0.40, 0.38], projection=ccrs.AlbersEqualArea(
        central_longitude=-96, central_latitude=37.5))
    ax_us.set_facecolor(ocean_color)
    ax_us.set_extent([-125, -66, 24, 50], crs=ccrs.PlateCarree())
    
    # Add subtle grid to main map
    gl = ax_main.gridlines(draw_labels=False, linewidth=0.3, color=border_color, 
                           alpha=0.5, linestyle='--')
    
    # Add map features to both maps
    for ax in [ax_main, ax_us]:
        ax.add_feature(cfeature.LAND, facecolor=land_color, edgecolor='none')
        ax.add_feature(cfeature.COASTLINE, linewidth=0.5, edgecolor=border_color)
        ax.add_feature(cfeature.BORDERS, linewidth=0.3, edgecolor=border_color, 
                       linestyle=':', alpha=0.7)
        if ax == ax_us:
            ax.add_feature(cfeature.STATES, linewidth=0.2, edgecolor=border_color, alpha=0.5)
    
    # Separate US vs international locations
    us_presentations = []
    intl_presentations = []
    us_collaborators = []
    intl_collaborators = []
    
    for loc in data['presentations']:
        if -130 <= loc['lng'] <= -60 and 20 <= loc['lat'] <= 55:
            us_presentations.append(loc)
        else:
            intl_presentations.append(loc)
    
    for loc in data['collaborators']:
        if -130 <= loc['lng'] <= -60 and 20 <= loc['lat'] <= 55:
            us_collaborators.append(loc)
        else:
            intl_collaborators.append(loc)
    
    # --- MAIN WORLD MAP ---
    # Plot international presentations with labels
    for loc in intl_presentations:
        # Glow effect
        ax_main.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=22, 
                color=presentation_glow, alpha=0.3,
                transform=ccrs.PlateCarree(), zorder=4)
        # Main marker
        ax_main.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=12, 
                color=presentation_color, 
                markeredgecolor='white', markeredgewidth=2,
                transform=ccrs.PlateCarree(), zorder=5)
        
        # Label
        name_parts = loc['name'].split('(')
        label = name_parts[0].strip() if len(name_parts[0].strip()) <= 8 else loc['name'].split()[0]
        years_str = ', '.join(loc['years'][-2:])
        
        offset_x, offset_y = 8, 8
        ha, va = 'left', 'bottom'
        if loc['lng'] > 50:
            offset_x = -8
            ha = 'right'
            
        ax_main.annotate(f"{label}\n({years_str})", 
                   xy=(loc['lng'], loc['lat']),
                   xytext=(offset_x, offset_y),
                   textcoords='offset points',
                   fontsize=9, fontweight='bold',
                   color=text_color, ha=ha, va=va,
                   transform=ccrs.PlateCarree(),
                   bbox=dict(boxstyle='round,pad=0.3', facecolor=bg_color, 
                            edgecolor=presentation_color, alpha=0.9, linewidth=1),
                   zorder=6)
    
    # Plot US locations on main map (smaller, no labels - those go in inset)
    for loc in us_presentations:
        ax_main.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=8, 
                color=presentation_color, 
                markeredgecolor='white', markeredgewidth=1.5,
                transform=ccrs.PlateCarree(), zorder=5)
    
    for loc in us_collaborators:
        is_current = 'Current' in str(loc.get('collaborators', []))
        if is_current:
            ax_main.plot(loc['lng'], loc['lat'], 
                    marker='*', markersize=12, 
                    color=accent_color, 
                    markeredgecolor='white', markeredgewidth=1,
                    transform=ccrs.PlateCarree(), zorder=6)
        else:
            ax_main.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=6,
                    color=collaborator_color,
                    markeredgecolor='white', markeredgewidth=1,
                    transform=ccrs.PlateCarree(), zorder=5)
    
    # Draw box indicating US inset area on main map
    us_box = Rectangle((-125, 24), 59, 26, 
                       fill=False, edgecolor=inset_border, linewidth=2,
                       linestyle='--', transform=ccrs.PlateCarree(), zorder=7)
    ax_main.add_patch(us_box)
    
    # --- US INSET MAP ---
    # Plot US presentations with labels (cleaner layout)
    label_positions = {}  # Track positions to avoid overlap
    
    for i, loc in enumerate(us_presentations):
        # Glow effect
        ax_us.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=18, 
                color=presentation_glow, alpha=0.3,
                transform=ccrs.PlateCarree(), zorder=4)
        # Main marker
        ax_us.plot(loc['lng'], loc['lat'], 
                marker='o', markersize=10, 
                color=presentation_color, 
                markeredgecolor='white', markeredgewidth=2,
                transform=ccrs.PlateCarree(), zorder=5)
        
        # Smart label with abbreviation
        name = loc['name']
        city = loc.get('city', '').split(',')[0]  # Just city name
        years_str = ', '.join(loc['years'][-2:]) if len(loc['years']) > 1 else loc['years'][0]
        
        # Determine label offset based on position to reduce overlap
        base_offset_x, base_offset_y = 6, 6
        ha, va = 'left', 'bottom'
        
        # Custom positioning for crowded areas
        if loc['lat'] < 32:  # Southern locations (San Antonio, Austin, Phoenix)
            if loc['lng'] < -100:  # Phoenix area
                offset_x, offset_y = -6, 6
                ha = 'right'
            elif loc['lng'] < -98:  # Texas area  
                offset_x, offset_y = 6, -8
                va = 'top'
            else:
                offset_x, offset_y = 6, 6
        elif loc['lat'] > 40:  # Northern (Rochester)
            offset_x, offset_y = 6, -6
            va = 'top'
        elif -90 < loc['lng'] < -80:  # East-central (Nashville, Charlotte, Atlanta)
            if loc['lat'] > 35:  # Nashville/Charlotte
                offset_x, offset_y = 8, 0
            else:  # Atlanta area
                offset_x, offset_y = 8, -6
                va = 'top'
        elif loc['lng'] < -120:  # West coast (SF)
            offset_x, offset_y = -6, 6
            ha = 'right'
        else:
            offset_x, offset_y = base_offset_x, base_offset_y
            
        ax_us.annotate(f"{name}\n{city} ({years_str})", 
                   xy=(loc['lng'], loc['lat']),
                   xytext=(offset_x, offset_y),
                   textcoords='offset points',
                   fontsize=7, fontweight='bold',
                   color=text_color, ha=ha, va=va,
                   transform=ccrs.PlateCarree(),
                   bbox=dict(boxstyle='round,pad=0.2', facecolor=bg_color, 
                            edgecolor=presentation_color, alpha=0.9, linewidth=0.8),
                   zorder=6)
    
    # Plot US collaborators in inset
    for loc in us_collaborators:
        is_current = 'Current' in str(loc.get('collaborators', []))
        if is_current:
            ax_us.plot(loc['lng'], loc['lat'], 
                    marker='*', markersize=18, 
                    color=accent_color, 
                    markeredgecolor='white', markeredgewidth=1.5,
                    transform=ccrs.PlateCarree(), zorder=6)
            # Label for current institution
            ax_us.annotate("GSU\n(Current)", 
                       xy=(loc['lng'], loc['lat']),
                       xytext=(8, 0),
                       textcoords='offset points',
                       fontsize=7, fontweight='bold',
                       color=text_color, ha='left', va='center',
                       transform=ccrs.PlateCarree(),
                       bbox=dict(boxstyle='round,pad=0.2', facecolor=bg_color, 
                                edgecolor=accent_color, alpha=0.9, linewidth=0.8),
                       zorder=7)
        else:
            # Glow
            ax_us.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=14, 
                    color=collaborator_glow, alpha=0.3,
                    transform=ccrs.PlateCarree(), zorder=4)
            # Main marker
            ax_us.plot(loc['lng'], loc['lat'], 
                    marker='D', markersize=8,
                    color=collaborator_color,
                    markeredgecolor='white', markeredgewidth=1.5,
                    transform=ccrs.PlateCarree(), zorder=5)
            
            # Short institution name
            inst = loc['institution']
            if 'Arizona' in inst:
                short_name = 'U of Arizona'
            elif 'Indiana' in inst:
                short_name = 'Indiana U'
            elif 'Texas' in inst:
                short_name = 'UTSA'
            elif 'Rochester' in inst:
                short_name = 'RIT'
            else:
                short_name = inst[:12]
            
            # Position labels to avoid overlap
            if loc['lng'] < -100:  # Western collaborators
                offset_x, offset_y = -6, 6
                ha = 'right'
            else:
                offset_x, offset_y = 6, -6
                ha = 'left'
                
            ax_us.annotate(short_name, 
                       xy=(loc['lng'], loc['lat']),
                       xytext=(offset_x, offset_y),
                       textcoords='offset points',
                       fontsize=6, fontweight='bold',
                       color=text_color, ha=ha, va='center',
                       transform=ccrs.PlateCarree(),
                       bbox=dict(boxstyle='round,pad=0.2', facecolor=bg_color, 
                                edgecolor=collaborator_color, alpha=0.9, linewidth=0.8),
                       zorder=6)
    
    # Add border to US inset
    for spine in ax_us.spines.values():
        spine.set_edgecolor(inset_border)
        spine.set_linewidth(2)
    
    # Inset title
    ax_us.set_title('United States Detail', fontsize=10, fontweight='bold', 
                    color=text_color, pad=5)
    
    # Main title
    fig.suptitle('Global Research Footprint', fontsize=22, fontweight='bold',
                 color=text_color, y=0.97)
    
    # Subtitle
    ax_main.set_title('Conference presentations and research collaborations worldwide', 
                 fontsize=11, color=muted_color, style='italic', pad=8)
    
    # Create legend (positioned in bottom left of main map)
    legend_elements = [
        plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=presentation_color,
                   markersize=10, markeredgecolor='white', markeredgewidth=1.5,
                   label='Conference Presentations'),
        plt.Line2D([0], [0], marker='D', color='w', markerfacecolor=collaborator_color,
                   markersize=8, markeredgecolor='white', markeredgewidth=1.5,
                   label='Collaborator Institutions'),
        plt.Line2D([0], [0], marker='*', color='w', markerfacecolor=accent_color,
                   markersize=12, markeredgecolor='white', markeredgewidth=1,
                   label='Current Institution'),
    ]
    
    legend = ax_main.legend(handles=legend_elements, loc='lower left', 
                       frameon=True, fontsize=9, facecolor=bg_color,
                       edgecolor=border_color, framealpha=0.95)
    legend.get_frame().set_linewidth(1.5)
    for text in legend.get_texts():
        text.set_color(text_color)
    
    # Stats footer
    num_presentations = len(data['presentations'])
    num_collaborators = len(data['collaborators'])
    total_years = set()
    for loc in data['presentations']:
        total_years.update(loc['years'])
    
    stats_text = f"{num_presentations} Conference Venues  |  {num_collaborators} Collaborating Institutions  |  {len(total_years)} Years Active"
    fig.text(0.28, 0.08, stats_text, ha='center', fontsize=10, 
             color=muted_color, style='italic')
    
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
