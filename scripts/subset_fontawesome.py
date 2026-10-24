"""Font Awesome, cut down to the icons the site uses (2026-10-24).

The theme ships the full Font Awesome 6.4 fonts (solid, regular and brands: about 280 KB of woff2) for the twenty or so
icons the pages use. This keeps every <i class="fas fa-..."> as it is and replaces the font files with subsets that
hold only the glyphs in use; static/webfonts/ overrides the theme's copies of the same names.

  Subset (after adding an icon, rebuild the site, then):
    python scripts/subset_fontawesome.py --build public --theme <path to the wowchemy/v5 module>
  Check that every icon the built site uses is in the subset fonts (CI runs this):
    python scripts/subset_fontawesome.py --build public --check

An icon counts as used when a built page, script or data file names its fa- class, or a site stylesheet rule that uses a
Font Awesome font draws a code point with content: (the search box and info boxes do). Needs fonttools and brotli.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "webfonts"
FONTS = ["fa-solid-900", "fa-regular-400", "fa-brands-400"]
MODIFIERS = {"fa-solid", "fa-regular", "fa-brands", "fa-fw", "fa-lg", "fa-xs", "fa-sm", "fa-2x", "fa-3x", "fa-spin",
             "fa-pulse", "fa-stack", "fa-stack-1x", "fa-stack-2x", "fa-inverse", "fa-ul", "fa-li", "fa-border",
             "fa-pull-left", "fa-pull-right", "fa-rotate-90", "fa-flip-horizontal"}


def class_map(css: str) -> dict[str, int]:
    """fa- class name -> code point, from Font Awesome's all.css rules like .fa-x:before,.fa-y:before{content:"\\f0e0"}."""
    out = {}
    for selectors, code in re.findall(r'((?:\.fa-[a-z0-9-]+:+before,?)+)\{content:"\\([0-9a-f]+)"\}', css):
        for name in re.findall(r"\.(fa-[a-z0-9-]+):+before", selectors):
            out[name] = int(code, 16)
    return out


def used(build: Path, fa_css_name: str) -> tuple[set[str], set[int]]:
    names, points = set(), set()
    for path in build.rglob("*"):
        rel = path.relative_to(build).as_posix()
        if not path.is_file() or rel.startswith(("ccair/", "lab/")):
            continue
        if path.suffix in (".html", ".js", ".json"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            names.update(n for n in re.findall(r"\bfa-[a-z0-9]+(?:-[a-z0-9]+)*", text) if n not in MODIFIERS)
        elif path.suffix == ".css" and fa_css_name not in path.name:
            text = path.read_text(encoding="utf-8", errors="ignore")
            # Only rules that draw with a Font Awesome font: other icon fonts (Academicons) use the same private-use range.
            blocks = [b for b in re.findall(r"\{([^{}]*)\}", text) if "awesome" in b.lower() and "content" in b]
            for value in re.findall(r'content:\s*["\']([^"\']*)["\']', "\n".join(blocks)):
                points.update(int(h, 16) for h in re.findall(r"\\([0-9a-fA-F]{4,5})", value) if 0xE000 <= int(h, 16) <= 0xF8FF)
                points.update(ord(c) for c in value if 0xE000 <= ord(c) <= 0xF8FF)
    return names, points


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", required=True, type=Path, help="built site (public/)")
    ap.add_argument("--theme", type=Path, help="wowchemy/v5 module folder (has static/webfonts and assets/css/libs/fontawesome)")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    from fontTools.ttLib import TTFont

    css_path = next(args.build.glob("css/vendor-bundle*.css"), None)
    if css_path is None:
        print("no css/vendor-bundle*.css in the build", file=sys.stderr)
        return 2
    mapping = class_map(css_path.read_text(encoding="utf-8"))
    names, points = used(args.build, "vendor-bundle")
    unknown = sorted(n for n in names if n not in mapping)
    points |= {mapping[n] for n in names if n in mapping}

    if args.check:
        have = set()
        for name in FONTS:
            have |= set(TTFont(OUT / f"{name}.woff2").getBestCmap())
        missing = sorted(points - have)
        print(f"{len(names)} icon classes and {len(points)} code points in use; missing from static/webfonts: {len(missing)}")
        for cp in missing:
            print(f"  U+{cp:04X} " + ", ".join(n for n in names if mapping.get(n) == cp))
        if missing:
            print("Run: python scripts/subset_fontawesome.py --build public --theme <wowchemy/v5 module>", file=sys.stderr)
        return 1 if missing else 0

    if not args.theme:
        ap.error("--theme is required when subsetting")
    from fontTools import subset
    OUT.mkdir(parents=True, exist_ok=True)
    text_points = sorted(points)
    for name in FONTS:
        for flavor, ext in (("woff2", "woff2"), (None, "ttf")):
            font = TTFont(args.theme / "static" / "webfonts" / f"{name}.ttf")
            opts = subset.Options()
            opts.flavor = flavor
            opts.layout_features = ["*"]
            opts.name_IDs = ["*"]
            opts.notdef_outline = True
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=text_points)
            sub.subset(font)
            font.flavor = flavor
            font.save(OUT / f"{name}.{ext}")
        kept = len(set(TTFont(OUT / f"{name}.woff2").getBestCmap()) & set(text_points))
        print(f"{name}: {kept} glyphs, {(OUT / f'{name}.woff2').stat().st_size} B woff2")
    (OUT / "README.md").write_text(
        "# Font Awesome subsets\n\nWritten by `scripts/subset_fontawesome.py`: Font Awesome Free 6.4.0 (fonts under the SIL Open Font License 1.1,\n"
        "icons CC BY 4.0) cut down to the icons the site uses. They override the theme's full fonts of the same names.\n"
        f"Icons in use when written: {', '.join(sorted(names))}.\n", encoding="utf-8")
    if unknown:
        print("class names with no Font Awesome glyph (ignored):", ", ".join(unknown))
    return 0


if __name__ == "__main__":
    sys.exit(main())
