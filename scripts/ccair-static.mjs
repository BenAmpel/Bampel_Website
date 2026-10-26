// Shared helpers for the static CCAIR pages that are generated at build time (Pathway Finder and Student Guide).
// Used by scripts/build-pathways.mjs and scripts/build-students.mjs. Both import the same <head>, header, footer,
// JSON-LD nodes and sitemap writer, so the two sections look and behave the same and the sitemap stays complete
// whichever generator runs last.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CCAIR = path.join(ROOT, 'static', 'ccair');
export const SITE = 'https://bampel.com';

const params = fs.readFileSync(path.join(ROOT, 'config', '_default', 'params.yaml'), 'utf8');
// Quoted with single or double quotes, or not at all. An empty value means no analytics on the generated pages.
export const GA = (params.match(/^\s*google_analytics:\s*['"]?([^'"\s#]+)['"]?/m) || [])[1] || '';
if (!GA) console.warn('ccair-static: no google_analytics id found in config/_default/params.yaml; the generated pages carry no analytics tag.');

export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(CCAIR, 'data', rel), 'utf8'));

// The data files are published as they are (/ccair/data/*.json), so an internal note must not sit in one: a key named
// TODO, FIXME, NOTE or XXX, or a value that reads like one. Stops the build and names the place. Keep notes for editors
// in the generator's comments or in a README next to the data file.
const NOTE_KEY = /^_?(TODO|FIXME|NOTE|XXX)$/;
const NOTE_VALUE = /^\s*(to be added|placeholder)\b|\bben to confirm\b|\b(TBD|TODO|FIXME)\b/i;
export function assertNoInternalNotes(obj, file) {
  const walk = (v, at) => {
    if (typeof v === 'string') { if (NOTE_VALUE.test(v)) throw new Error(`${file}: ${at} looks like an internal note: "${v.slice(0, 60)}"`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (NOTE_KEY.test(k)) throw new Error(`${file}: key "${at ? at + '.' : ''}${k}" is an internal note; move it out of the published data file`);
      walk(x, at ? `${at}.${k}` : k);
    }
  };
  walk(obj, '');
}

export const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// "October 17, 2026" from "2026-10-17": the one date format on every generated page.
export const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
// Appended inside every link that opens in a new tab, so screen reader users hear it before they follow it (WCAG 3.2.5).
export const NEW_TAB = '<span class="sr-only"> (opens in a new tab)</span>';
export const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

export const person = { '@type': 'Person', '@id': `${SITE}/#person`, name: 'Benjamin M. Ampel', url: `${SITE}/`, jobTitle: 'Director, Center for CyberAI Research (CCAIR)' };
export const org = { '@type': 'ResearchOrganization', '@id': `${SITE}/ccair/#org`, name: 'Center for CyberAI Research (CCAIR)', url: `${SITE}/ccair/` };

// Short labels for pathways.json role fields, shared by the Pathway Finder and the Student Guide's role comparison table.
export const HIRING = { entry: 'Entry-level', step: 'Usually a second job', emerging: 'Emerging field' };
export const CODE_SHORT = { little: 'Little or none', some: 'Some scripting', lots: 'Regular programming' };

// The site-wide sharing card (1200 x 630), used when a page has no image of its own.
export const SHARE_IMAGE = { url: `${SITE}/media/sharing-card.png`, width: 1200, height: 630, alt: 'Benjamin M. Ampel, Assistant Professor of Computer Information Systems, Georgia State University. bampel.com' };

// Sharing cards (1200 x 630): the page title in the CCAIR palette, one per page. Moved here from build-students.mjs
// (2026-10-26) so the Pathway Finder and the CCAIR app pages have them too. When a card changes and Google Chrome is
// installed, ogImages renders the PNG and records the SVG's hash in the PNG folder's manifest.json. Netlify builds have no
// Chrome, so they use the committed PNGs, and a page whose PNG is missing or out of date uses SHARE_IMAGE.
const OG_VERSION = 'og-2-gsu';
// No logo on the cards: GSU does not allow a center to make its own (commkit.gsu.edu); the text names the center instead.
// Lato comes from the self-hosted files by a relative URL, so the SVG and its hash are the same on every machine. The SVG
// folder must therefore sit two folders below static/ccair/ (for example static/ccair/students/og/).
function wrap(text, max) {
  const lines = []; let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
export function ogSvg(title, eyebrow, pathLabel) {
  let size = 66, lines = wrap(title, 28);
  if (lines.length > 3) { size = 54; lines = wrap(title, 34); }
  const lh = Math.round(size * 1.18), y0 = 296 - ((lines.length - 1) * lh) / 2;
  const F = "'Lato', 'Helvetica Neue', Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<style>
@font-face { font-family: 'Lato'; font-weight: 400; src: url('../../assets/fonts/lato-400.woff2') format('woff2'); }
@font-face { font-family: 'Lato'; font-weight: 700; src: url('../../assets/fonts/lato-700.woff2') format('woff2'); }
</style>
<rect width="1200" height="630" fill="#FFFFFF"/>
<rect x="0" y="0" width="1200" height="14" fill="#0039A6"/>
<rect x="0" y="470" width="1200" height="160" fill="#EEEEEE"/>
<text x="80" y="122" font-family="${F}" font-weight="700" font-size="24" letter-spacing="3" fill="#0039A6">${esc(eyebrow.toUpperCase())}</text>
${lines.map((l, i) => `<text x="80" y="${Math.round(y0 + i * lh + size * 0.35)}" font-family="${F}" font-weight="700" font-size="${size}" fill="#000000">${esc(l)}</text>`).join('\n')}
<text x="80" y="530" font-family="${F}" font-weight="700" font-size="28" fill="#000000">Center for CyberAI Research (CCAIR)</text>
<text x="80" y="568" font-family="${F}" font-weight="400" font-size="22" fill="#374057">Georgia State University · J. Mack Robinson College of Business</text>
<text x="1120" y="122" text-anchor="end" font-family="${F}" font-weight="400" font-size="20" fill="#5A5D66">${esc(pathLabel)}</text>
</svg>
`;
}

function findChrome() {
  if (process.env.NETLIFY === 'true' || process.env.GUIDE_OG === '0') return '';
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || '';
}

// pages: [{ key, title, eyebrow, url, alt, label }]; label (default: the url) is the address printed top right. pngDir holds the committed PNGs and manifest.json; svgDir is build output.
// script names the generator in the manifest note. Returns { key: image } for head().
export function ogImages(pages, { pngDir, svgDir, script }) {
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  fs.mkdirSync(pngDir, { recursive: true });
  const mPath = path.join(pngDir, 'manifest.json'), rel = path.relative(ROOT, pngDir);
  const manifest = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : { note: '', images: {} };
  manifest.note = `Written by ${script}. hash is the SHA-256 of the SVG card the PNG was rendered from; a page whose hash differs uses the site sharing card until the PNG is rendered again.`;
  const chrome = findChrome();
  fs.mkdirSync(svgDir, { recursive: true });
  const images = {};
  let rendered = 0;
  for (const { key, title, eyebrow, url, alt, label = url } of pages) {
    const svg = ogSvg(title, eyebrow, label.replace(SITE + '/', 'bampel.com/'));
    const hash = sha(OG_VERSION + svg);
    const svgFile = path.join(svgDir, `${key}.svg`), png = path.join(pngDir, `${key}.png`);
    fs.writeFileSync(svgFile, svg);
    const fresh = fs.existsSync(png) && manifest.images[key]?.hash === hash;
    if (!fresh && chrome) {
      const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(os.tmpdir(), 'ccair-og-chrome')}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=FFFFFFFF',
        '--window-size=1200,630', `--screenshot=${png}`, `file://${svgFile}`], { stdio: 'ignore', timeout: 30000 });
      if (r.status === 0 && fs.existsSync(png)) { manifest.images[key] = { hash, title }; rendered++; }
    }
    const ok = fs.existsSync(png) && manifest.images[key]?.hash === hash;
    if (!ok) console.warn(`Sharing image for ${url} is missing or out of date; using the site sharing card. Run npm run build:ccair on a machine with Google Chrome and commit ${rel}/.`);
    images[key] = ok ? { url: `${SITE}/${path.relative(path.join(ROOT, 'static'), png)}?v=${hash.slice(0, 8)}`, width: 1200, height: 630, alt } : SHARE_IMAGE;
  }
  if (rendered) {
    fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Rendered %d sharing image(s) with headless Chrome; commit %s/.', rendered, rel);
  }
  return images;
}

// <head> through the analytics tag. The caller adds its JSON-LD and closes </head>.
// Analytics is the plain gtag page view (the site-wide Google Analytics property); no custom events carry user data.
// page_location leaves out the URL fragment: a shared quiz results link carries the packed answers in #r=..., and GA's
// default page_location is the full location.href.
// image: { url, width, height, alt } for og:image (defaults to the site sharing card). robots: the robots meta value.
// extra: more <head> lines (for example a feed <link>).
export function head({ title, desc, url, ogTitle, ogType = 'website', css = [], image = SHARE_IMAGE, robots = 'index, follow, max-image-preview:large', extra = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${esc(robots)}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#11172A" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="CCAIR, Center for CyberAI Research">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image.url}">
<meta property="og:image:width" content="${image.width}">
<meta property="og:image:height" content="${image.height}">
<meta property="og:image:alt" content="${esc(image.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image:alt" content="${esc(image.alt)}">
<link rel="icon" type="image/svg+xml" href="/ccair/assets/brand/favicon.svg">
<link rel="icon" type="image/png" sizes="64x64" href="/ccair/assets/brand/favicon-64.png">
<link rel="apple-touch-icon" href="/ccair/assets/brand/apple-touch-icon.png">
<link rel="preload" href="/ccair/assets/fonts/lato-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/ccair/assets/fonts/lato-700.woff2" as="font" type="font/woff2" crossorigin>
${css.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}${extra ? '\n' + extra : ''}
${GA ? `<script src="/ccair/assets/ga-init.js" data-ga-id="${GA}"></script>` : ''}`;
}

// Brand: GSU does not allow a center to make its own logo (commkit.gsu.edu). The header shows a plain-text wordmark until
// the official Robinson sub-brand lockup is dropped into static/ccair/assets/brand/official/ and switched on in its
// lockup.json (see the README there); then the supplied file replaces the wordmark, unaltered.
const LOCKUP_DIR = path.join(CCAIR, 'assets', 'brand', 'official');
export const LOCKUP = (() => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(LOCKUP_DIR, 'lockup.json'), 'utf8'));
    return c.enabled && c.files && c.files.light && fs.existsSync(path.join(LOCKUP_DIR, c.files.light)) ? c : null;
  } catch { return null; }
})();
export function brand() {
  if (LOCKUP) {
    const f = LOCKUP.files, src = (n) => `/ccair/assets/brand/official/${n}`;
    return `<a class="brand" href="/ccair/" aria-label="${esc(LOCKUP.alt)}, home"><picture class="lockup">${f.reversed ? `<source srcset="${src(f.reversed)}" media="(prefers-color-scheme: dark)">` : ''}<img src="${src(f.light)}" alt="${esc(LOCKUP.alt)}" width="${LOCKUP.width}" height="${LOCKUP.height}"></picture></a>`;
  }
  // On phones the header keeps the short name so the page links fit; the footer always carries the full name.
  return `<a class="brand" href="/ccair/"><span class="wordmark"><span class="wm-full">Center for CyberAI Research</span><span class="wm-short">CCAIR</span><small>Georgia State University</small></span></a>`;
}

// Sticky header. links: [{ href, label, current?, hideSm? }]
export function top(links) {
  return `<a class="skip" href="#main">Skip to content</a>
<div class="backdrop" aria-hidden="true"><div class="glow g1"></div><div class="glow g2"></div></div>
<header class="top"><div class="wrap">
  ${brand()}
  <nav aria-label="Main">
    ${links.map((l) => `<a href="${l.href}"${l.hideSm ? ' class="hide-sm"' : ''}${l.current ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`).join('\n    ')}
  </nav>
</div></header>`;
}

/* ---------- Photos ----------
   static/ccair/data/photos.json lists every photo and the slot it fills; files are /ccair/assets/photos/<base>-<w>.<ext>.
   photoHtml writes the same <picture> markup as Picture/PhotoBand in static/ccair/ccair-components.jsx. Swapping a slot
   for a GSU Digital Asset Library photo is an edit to photos.json (see static/ccair/assets/photos/README.md). */
export const PHOTOS = (() => { try { return readJson('photos.json').photos || []; } catch { return []; } })();
const PHOTO_DIR = '/ccair/assets/photos/';
for (const p of PHOTOS) {
  for (const set of [p, p.mobile].filter(Boolean)) for (const ext of ['avif', 'webp', 'jpg']) {
    for (const w of ext === 'jpg' ? (set.fallbackWidths || set.widths) : set.widths) {
      if (!fs.existsSync(path.join(CCAIR, 'assets', 'photos', `${set.base}-${w}.${ext}`))) throw new Error(`photos.json: missing file assets/photos/${set.base}-${w}.${ext} (photo "${p.id}")`);
    }
  }
  if (!p.alt || !p.credit || !p.credit.author) throw new Error(`photos.json: photo "${p.id}" needs alt text and a credit with an author`);
}
export const photoFor = (slot) => PHOTOS.find((p) => p.slot === slot) || null;
const srcset = (base, widths, ext) => widths.map((w) => `${PHOTO_DIR}${base}-${w}.${ext} ${w}w`).join(', ');
// "Photo: Author / License", the author linking to the source page and the license to its deed.
export function photoCredit(p) {
  const c = p.credit;
  const who = c.sourceUrl ? `<a href="${esc(c.sourceUrl)}">${esc(c.author)}</a>` : esc(c.author);
  const lic = c.license ? ` / ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" rel="license">${esc(c.license)}</a>` : esc(c.license)}` : '';
  return `Photo: ${who}${lic}`;
}
// A <figure> with the photo in a rounded frame and its short credit underneath. priority: an above-the-fold hero image.
export function photoHtml(slot, { sizes = '(min-width: 1200px) 1120px, calc(100vw - 32px)', priority = false, className = 'photo-band' } = {}) {
  const p = photoFor(slot);
  if (!p) return '';
  const fb = p.fallbackWidths || p.widths;
  return `<figure class="${className} reveal">
    <div class="photo-frame"><picture>
      <source type="image/avif" srcset="${srcset(p.base, p.widths, 'avif')}" sizes="${sizes}">
      <source type="image/webp" srcset="${srcset(p.base, p.widths, 'webp')}" sizes="${sizes}">
      <img src="${PHOTO_DIR}${p.base}-${fb[fb.length - 1]}.jpg" srcset="${srcset(p.base, fb, 'jpg')}" sizes="${sizes}" width="${p.width}" height="${p.height}" alt="${esc(p.alt)}" style="--focal: ${esc(p.focal || '50% 50%')}" decoding="async" ${priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>
    </picture></div>
    <figcaption class="photo-credit">${photoCredit(p)}</figcaption>
  </figure>`;
}
// Full attribution (title, author, license, source, changes) for every photo, shown in the footer.
function photoCreditsHtml() {
  if (!PHOTOS.length) return '';
  const item = (p) => {
    const c = p.credit;
    const title = c.sourceUrl ? `<a href="${esc(c.sourceUrl)}">${esc(c.title || p.id)}</a>` : esc(c.title || p.id);
    const lic = c.license ? `, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}" rel="license">${esc(c.license)}</a>` : esc(c.license)}` : '';
    return `<li>${title} by ${esc(c.author)}${lic}${c.source ? `, via ${esc(c.source)}` : ''}.${c.changes ? ` Changes: ${esc(c.changes)}.` : ''}</li>`;
  };
  return `\n  <details class="photo-credits"><summary>Photo credits</summary><ul>${PHOTOS.map(item).join('')}</ul>
    <p>Photos under CC BY-SA stay under CC BY-SA after our cropping and resizing.</p></details>`;
}

// Footer and closing tags. scripts: list of script URLs (deferred). photoCredits: list full attribution for every photo.
export function foot({ note, scripts = [], photoCredits = false }) {
  return `<footer><div class="wrap">
  <span><b>Center for CyberAI Research (CCAIR)</b><br>Georgia State University · J. Mack Robinson College of Business<br>${esc(note)}</span>
  <span><a href="/ccair/">CCAIR</a> · <a href="/ccair/pathways/">Pathway Finder</a> · <a href="/ccair/students/">Student guide</a> · <a href="/teaching/">Teaching</a></span>${photoCredits ? photoCreditsHtml() : ''}
</div></footer>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// One sitemap for every generated CCAIR page. Each generator calls this after writing its pages, so the file is the
// same whichever runs last. Student Guide URLs and their lastmod dates come from static/ccair/data/guide-lastmod.json,
// which scripts/build-students.mjs keeps: a page's lastmod moves only when the hash of its content changes. Pages the
// store marks sitemap: false (for example the outcomes page while it has no data) are left out. /ccair/ (the React app
// home) has no lastmod: no single data file dates its content.
export const LASTMOD_STORE = path.join(CCAIR, 'data', 'guide-lastmod.json');
export function writeSitemap() {
  const P = readJson('pathways.json');
  // The CCAIR app's own pages (/ccair/<page>/, prerendered by scripts/build-ccair.js) have no lastmod either.
  const appPages = ['research', 'publications', 'people', 'resources', 'materials', 'about', 'contact'].map((p) => [`${SITE}/ccair/${p}/`, null]);
  const urls = [[`${SITE}/ccair/`, null], ...appPages, [`${SITE}/ccair/pathways/`, P.updated], ...P.roles.map((r) => [`${SITE}/ccair/pathways/${r.slug}/`, P.updated])];
  if (fs.existsSync(LASTMOD_STORE)) {
    const store = JSON.parse(fs.readFileSync(LASTMOD_STORE, 'utf8'));
    for (const [u, e] of Object.entries(store.pages)) if (e.sitemap) urls.push([`${SITE}${u}`, e.lastmod]);
  }
  fs.writeFileSync(path.join(CCAIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
  return urls.length;
}
