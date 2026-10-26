// Sharing cards for publication pages (2026-10-25): a 1200 x 630 image per paper for link previews (og:image,
// twitter:image), in the colors of the site sharing card (static/media/sharing-card.png). Pages with a featured image of
// their own keep it; seo_tags.html uses static/media/papers/<slug>.png before the site card.
// Input:  static/data/publications.json (title, authors, year, type, venue, url) and content/*_publication/*/index.md
//         (to skip papers that have a featured image).
// Output: static/media/papers/<slug>.png and manifest.json (hash of each card's SVG). Committed: Netlify has no Chrome,
//         so it uses the PNGs as they are. Rerun after a title, author or venue change:  node scripts/build-paper-cards.mjs
// Each card has a small network drawing seeded by the paper's title, so cards differ but stay the same between builds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'static', 'media', 'papers');
const VERSION = 'cards-3';
const C = { bg1: '#0a1628', bg2: '#111f35', accent: '#00ddb3', text: '#ffffff', sub: '#c9d4e6', muted: '#8b9ab8' };
const TYPE = { journal: 'Journal article', conference: 'Conference paper', workshop: 'Workshop paper' };
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const raw = JSON.parse(fs.readFileSync(path.join(root, 'static', 'data', 'publications.json'), 'utf8'));
const pubs = Array.isArray(raw) ? raw : raw.publications || [];

// Titles of papers whose folder has a featured image (matched on the front matter title).
const featured = new Set();
for (const section of fs.readdirSync(path.join(root, 'content')).filter((d) => d.endsWith('_publication'))) {
  for (const dir of fs.readdirSync(path.join(root, 'content', section))) {
    const folder = path.join(root, 'content', section, dir);
    if (!fs.statSync(folder).isDirectory() || !fs.readdirSync(folder).some((f) => /^featured\./i.test(f))) continue;
    const md = fs.readFileSync(path.join(folder, 'index.md'), 'utf8');
    const m = /^title:\s*["']?(.*?)["']?\s*$/m.exec(md);
    if (m) featured.add(norm(m[1]));
  }
}
function norm(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function wrap(text, max) {
  const lines = []; let line = '';
  for (const w of String(text).split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

// mulberry32, seeded from the title, for the network drawing.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function network(title) {
  const r = rng(parseInt(crypto.createHash('sha256').update(title).digest('hex').slice(0, 8), 16));
  const cx = 1000, cy = 315, R = 130, nodes = [];
  while (nodes.length < 17) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
    const p = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, s: 3 + r() * 5 };
    if (nodes.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 30)) nodes.push(p);
  }
  nodes[0] = { x: cx, y: cy, s: 11 };
  const edges = [];
  nodes.forEach((p, i) => {
    nodes.map((q, j) => ({ j, d: Math.hypot(q.x - p.x, q.y - p.y) })).filter((e) => e.j !== i).sort((a, b) => a.d - b.d).slice(0, 2)
      .forEach((e) => { if (!edges.some(([a, b]) => (a === e.j && b === i))) edges.push([i, e.j]); });
  });
  const f = (n) => n.toFixed(1);
  return `<circle cx="${cx}" cy="${cy}" r="${R + 22}" fill="none" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="2"/>
  ${edges.map(([a, b]) => `<line x1="${f(nodes[a].x)}" y1="${f(nodes[a].y)}" x2="${f(nodes[b].x)}" y2="${f(nodes[b].y)}" stroke="${C.accent}" stroke-opacity="0.45" stroke-width="1.6"/>`).join('\n  ')}
  ${nodes.map((p, i) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.s)}" fill="${i === 0 ? C.accent : C.sub}" fill-opacity="${i === 0 ? 1 : 0.85}"/>`).join('\n  ')}`;
}

// Text sits in a 690 px column left of the drawing. Title: the largest size (54 to 32 px) that fits in four lines (five at 34 px and below),
// starting under the eyebrow. Authors: up to two lines, Ben in white bold.
const COL = 690;
const perLine = (size) => Math.floor(COL / (size * 0.53));
const fits = (size, text, lines) => wrap(text, perLine(size)).length <= lines;
function cardSvg(p) {
  const eyebrow = [TYPE[p.type] || 'Paper', p.venue, p.year].filter(Boolean).join('  ·  ').toUpperCase();
  const size = [54, 48, 42, 38, 34, 32].find((s) => fits(s, p.title, s >= 54 ? 3 : s <= 34 ? 5 : 4)) || 32;
  const maxLines = size <= 34 ? 5 : 4;
  let lines = wrap(p.title, perLine(size));
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  const lh = Math.round(size * 1.16);
  const titleTop = 150 + size;
  const names = (p.authors || []).slice(0, 8).map((a, i, all) => a + (i < all.length - 1 ? ',' : (p.authors.length > 8 ? ', et al.' : '')));
  const aLines = []; let cur = [];
  for (const n of names) { if ([...cur, n].join(' ').length > 54 && cur.length) { aLines.push(cur); cur = [n]; } else cur.push(n); }
  if (cur.length) aLines.push(cur);
  if (aLines.length > 2) { aLines.length = 2; aLines[1].push('et al.'); }
  const aTop = titleTop + (lines.length - 1) * lh + 62;
  const span = (n) => /ampel/i.test(n) ? `<tspan fill="${C.text}" font-weight="700">${esc(n)}</tspan>` : esc(n);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="14" height="630" fill="${C.accent}"/>
  ${network(p.title)}
  <text x="70" y="100" font-family="${FONT}" font-size="21" font-weight="700" letter-spacing="2" fill="${C.accent}">${esc(eyebrow)}</text>
  <text font-family="${FONT}" font-size="${size}" font-weight="700" fill="${C.text}">${lines.map((l, i) => `<tspan x="70" y="${titleTop + i * lh}">${esc(l)}</tspan>`).join('')}</text>
  <text font-family="${FONT}" font-size="24" fill="${C.muted}">${aLines.map((l, i) => `<tspan x="70" y="${aTop + i * 34}">${l.map(span).join(' ')}</tspan>`).join('')}</text>
  <text x="70" y="556" font-family="${FONT}" font-size="28" fill="${C.text}">bampel.com</text>
  <text x="70" y="590" font-family="${FONT}" font-size="20" fill="${C.muted}">Benjamin M. Ampel  ·  Georgia State University</text>
</svg>`;
}

function findChrome() {
  return [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .filter(Boolean).find((c) => fs.existsSync(c));
}

fs.mkdirSync(out, { recursive: true });
const manifestFile = path.join(out, 'manifest.json');
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-cards-'));
const next = {};
let rendered = 0, kept = 0, missing = 0;
for (const p of pubs) {
  if (!p.url || featured.has(norm(p.title))) continue;
  const slug = p.url.replace(/\/+$/, '').split('/').pop();
  const svg = cardSvg(p);
  const hash = crypto.createHash('sha256').update(VERSION + svg).digest('hex').slice(0, 16);
  const png = path.join(out, `${slug}.png`);
  next[slug] = hash;
  if (manifest[slug] === hash && fs.existsSync(png)) { kept++; continue; }
  if (!chrome) { missing++; continue; }
  const svgFile = path.join(tmp, `${slug}.svg`);
  fs.writeFileSync(svgFile, svg);
  spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(tmp, 'chrome')}`,
    '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--screenshot=${png}`, `file://${svgFile}`], { stdio: 'ignore', timeout: 30000 });
  if (fs.existsSync(png)) rendered++; else { missing++; delete next[slug]; }
}
for (const f of fs.readdirSync(out)) if (f.endsWith('.png') && !(f.slice(0, -4) in next)) fs.unlinkSync(path.join(out, f));
fs.writeFileSync(manifestFile, JSON.stringify(next, null, 1) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`paper cards: ${rendered} rendered, ${kept} unchanged, ${missing} missing${missing && !chrome ? ' (no Chrome; set CHROME_PATH)' : ''}, ${featured.size} papers use their featured image`);
