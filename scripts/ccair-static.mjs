// Shared helpers for the static CCAIR pages that are generated at build time (Pathway Finder and Student Guide).
// Used by scripts/build-pathways.mjs and scripts/build-students.mjs. Both import the same <head>, header, footer,
// JSON-LD nodes and sitemap writer, so the two sections look and behave the same and the sitemap stays complete
// whichever generator runs last.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CCAIR = path.join(ROOT, 'static', 'ccair');
export const SITE = 'https://bampel.com';

const params = fs.readFileSync(path.join(ROOT, 'config', '_default', 'params.yaml'), 'utf8');
export const GA = (params.match(/google_analytics:\s*'([^']+)'/) || [])[1] || '';

export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(CCAIR, 'data', rel), 'utf8'));

export const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

export const person = { '@type': 'Person', '@id': `${SITE}/#person`, name: 'Benjamin M. Ampel', url: `${SITE}/`, jobTitle: 'Director, Center for CyberAI Research (CCAIR)' };
export const org = { '@type': 'ResearchOrganization', '@id': `${SITE}/ccair/#org`, name: 'Center for CyberAI Research (CCAIR)', url: `${SITE}/ccair/` };

// Short labels for pathways.json role fields, shared by the Pathway Finder and the Student Guide's role comparison table.
export const HIRING = { entry: 'Entry-level', step: 'Usually a second job', emerging: 'Emerging field' };
export const CODE_SHORT = { little: 'Little or none', some: 'Some scripting', lots: 'Regular programming' };

// The site-wide sharing card (1200 x 630), used when a page has no image of its own.
export const SHARE_IMAGE = { url: `${SITE}/media/sharing-card.png`, width: 1200, height: 630, alt: 'Benjamin M. Ampel, Assistant Professor of Computer Information Systems, Georgia State University. bampel.com' };

// <head> through the analytics tag. The caller adds its JSON-LD and closes </head>.
// Analytics is the plain gtag page view (the site-wide Google Analytics property); no custom events carry user data.
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
${GA ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>` : ''}`;
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

// Footer and closing tags. scripts: list of script URLs (deferred).
export function foot({ note, scripts = [] }) {
  return `<footer><div class="wrap">
  <span><b>Center for CyberAI Research (CCAIR)</b><br>Georgia State University · J. Mack Robinson College of Business<br>${esc(note)}</span>
  <span><a href="/ccair/">CCAIR</a> · <a href="/ccair/pathways/">Pathway Finder</a> · <a href="/ccair/students/">Student guide</a> · <a href="/teaching/">Teaching</a></span>
</div></footer>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// One sitemap for every generated CCAIR page. Each generator calls this after writing its pages, so the file is the
// same whichever runs last. Student Guide URLs and their lastmod dates come from static/ccair/data/guide-lastmod.json,
// which scripts/build-students.mjs keeps: a page's lastmod moves only when the hash of its content changes. Pages the
// store marks sitemap: false (for example the outcomes page while it has no data) are left out.
export const LASTMOD_STORE = path.join(CCAIR, 'data', 'guide-lastmod.json');
export function writeSitemap() {
  const P = readJson('pathways.json');
  const urls = [[`${SITE}/ccair/`, P.updated], [`${SITE}/ccair/pathways/`, P.updated], ...P.roles.map((r) => [`${SITE}/ccair/pathways/${r.slug}/`, P.updated])];
  if (fs.existsSync(LASTMOD_STORE)) {
    const store = JSON.parse(fs.readFileSync(LASTMOD_STORE, 'utf8'));
    for (const [u, e] of Object.entries(store.pages)) if (e.sitemap) urls.push([`${SITE}${u}`, e.lastmod]);
  }
  fs.writeFileSync(path.join(CCAIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  return urls.length;
}
