#!/usr/bin/env python3
"""
Generate a research impact dashboard image.

Usage:
    python generate_dashboard.py

Output:
    - ../static/images/impact-dashboard.png (light mode)
    - ../static/images/impact-dashboard-dark.png (dark mode)
"""

import json
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
METRICS_FILE = PROJECT_ROOT / "static" / "data" / "scholar-metrics.json"
OUTPUT_DIR = PROJECT_ROOT / "static" / "images"


def load_metrics():
    """Load metrics from JSON file."""
    with open(METRICS_FILE, 'r') as f:
        return json.load(f)


def draw_dashboard(dark_mode=False):
    """Generate the dashboard visualization."""
    data = load_metrics()
    
    # Colors
    if dark_mode:
        bg_color = '#0d1117'
        card_color = '#161b22'
        text_color = '#e6edf3'
        accent_color = '#58a6ff'
        bar_color = '#58a6ff'
        muted_color = '#8b949e'
    else:
        bg_color = '#ffffff'
        card_color = '#f6f8fa'
        text_color = '#1f2328'
        accent_color = '#0969da'
        bar_color = '#0969da'
        muted_color = '#656d76'
    
    fig = plt.figure(figsize=(12, 8), facecolor=bg_color)
    
    # Create grid layout
    gs = fig.add_gridspec(3, 4, hspace=0.4, wspace=0.3, 
                          left=0.05, right=0.95, top=0.92, bottom=0.08)
    
    # Title
    fig.suptitle('Research Impact Dashboard', fontsize=20, fontweight='bold', 
                 color=text_color, y=0.97)
    
    # Metric cards (top row)
    metrics = [
        ('Citations', data['metrics']['citations']),
        ('h-index', data['metrics']['hIndex']),
        ('i10-index', data['metrics']['i10Index']),
        ('Publications', data['metrics']['publications'])
    ]
    
    for i, (label, value) in enumerate(metrics):
        ax = fig.add_subplot(gs[0, i])
        ax.set_facecolor(card_color)
        
        # Remove axes
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis('off')
        
        # Draw card background
        card = mpatches.FancyBboxPatch((0.05, 0.05), 0.9, 0.9, 
                                        boxstyle="round,pad=0.05,rounding_size=0.1",
                                        facecolor=card_color, edgecolor='none')
        ax.add_patch(card)
        
        # Value
        ax.text(0.5, 0.6, str(value), fontsize=28, fontweight='bold',
               color=accent_color, ha='center', va='center')
        
        # Label
        ax.text(0.5, 0.25, label.upper(), fontsize=10, fontweight='medium',
               color=muted_color, ha='center', va='center')
    
    # Bar chart (bottom section)
    ax_chart = fig.add_subplot(gs[1:, :])
    ax_chart.set_facecolor(bg_color)
    
    years = [d['year'] for d in data['citationsByYear']]
    citations = [d['citations'] for d in data['citationsByYear']]
    
    bars = ax_chart.bar(years, citations, color=bar_color, alpha=0.8, 
                        width=0.6, edgecolor='white', linewidth=0.5)
    
    # Add value labels on bars
    for bar, val in zip(bars, citations):
        height = bar.get_height()
        ax_chart.text(bar.get_x() + bar.get_width()/2., height + 2,
                     str(val), ha='center', va='bottom', fontsize=10,
                     color=text_color, fontweight='medium')
    
    # Chart styling
    ax_chart.set_xlabel('Year', fontsize=11, color=text_color, labelpad=10)
    ax_chart.set_ylabel('Citations', fontsize=11, color=text_color, labelpad=10)
    ax_chart.set_title('Citations by Year', fontsize=14, fontweight='bold',
                       color=text_color, pad=15)
    
    ax_chart.tick_params(colors=text_color, labelsize=10)
    ax_chart.spines['top'].set_visible(False)
    ax_chart.spines['right'].set_visible(False)
    ax_chart.spines['bottom'].set_color(muted_color)
    ax_chart.spines['left'].set_color(muted_color)
    
    ax_chart.set_ylim(0, max(citations) * 1.15)
    
    # Footer
    fig.text(0.5, 0.02, f"Data from Google Scholar • Last updated: {data['lastUpdated']}", 
             ha='center', fontsize=9, color=muted_color, style='italic')
    
    return fig


def main():
    """Generate both light and dark mode dashboard images."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate light mode
    print("Generating light mode dashboard...")
    fig_light = draw_dashboard(dark_mode=False)
    light_path = OUTPUT_DIR / 'impact-dashboard.png'
    fig_light.savefig(light_path, dpi=150, bbox_inches='tight', 
                      facecolor='white', edgecolor='none')
    plt.close(fig_light)
    print(f"  Saved: {light_path}")
    
    # Generate dark mode
    print("Generating dark mode dashboard...")
    fig_dark = draw_dashboard(dark_mode=True)
    dark_path = OUTPUT_DIR / 'impact-dashboard-dark.png'
    fig_dark.savefig(dark_path, dpi=150, bbox_inches='tight', 
                     facecolor='#0d1117', edgecolor='none')
    plt.close(fig_dark)
    print(f"  Saved: {dark_path}")
    
    print("\nDone! Dashboard images generated successfully.")


if __name__ == '__main__':
    main()
