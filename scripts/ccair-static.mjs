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

// <head> through the analytics tag. The caller adds its JSON-LD and closes </head>.
// Analytics is the plain gtag page view (the site-wide Google Analytics property); no custom events carry user data.
export function head({ title, desc, url, ogTitle, ogType = 'website', css = [] }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#FBF6EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1D171F" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="CCAIR, Center for CyberAI Research">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/media/sharing-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="64x64" href="/ccair/uploads/brand/logo-mark-64.png">
<link rel="apple-touch-icon" href="/ccair/uploads/brand/apple-touch-icon.png">
${css.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
${GA ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>` : ''}`;
}

// Sticky header. links: [{ href, label, current?, hideSm? }]
export function top(links) {
  return `<a class="skip" href="#main">Skip to content</a>
<div class="backdrop" aria-hidden="true"><div class="glow g1"></div><div class="glow g2"></div></div>
<header class="top"><div class="wrap">
  <a class="brand" href="/ccair/"><img src="/ccair/uploads/brand/logo-mark-64.png" alt="" width="30" height="30">CCAIR</a>
  <nav aria-label="Main">
    ${links.map((l) => `<a href="${l.href}"${l.hideSm ? ' class="hide-sm"' : ''}${l.current ? ' aria-current="page"' : ''}>${esc(l.label)}</a>`).join('\n    ')}
  </nav>
</div></header>`;
}

// Footer and closing tags. scripts: list of script URLs (deferred).
export function foot({ note, scripts = [] }) {
  return `<footer><div class="wrap">
  <span>Center for CyberAI Research (CCAIR) · Georgia State University · ${esc(note)}</span>
  <span><a href="/ccair/">CCAIR</a> · <a href="/ccair/pathways/">Pathway Finder</a> · <a href="/ccair/students/">Student guide</a> · <a href="/teaching/">Teaching</a></span>
</div></footer>
${scripts.map((s) => `<script src="${s}" defer></script>`).join('\n')}
</body>
</html>
`;
}

// One sitemap for every generated CCAIR page. Each generator calls this after writing its pages, so the file is the
// same whichever runs last.
export function writeSitemap() {
  const P = readJson('pathways.json');
  const urls = [[`${SITE}/ccair/`, P.updated], [`${SITE}/ccair/pathways/`, P.updated], ...P.roles.map((r) => [`${SITE}/ccair/pathways/${r.slug}/`, P.updated])];
  const sPath = path.join(CCAIR, 'data', 'students.json');
  if (fs.existsSync(sPath)) {
    const S = readJson('students.json');
    const D = readJson('datasets.json');
    for (const p of S.pages) {
      const mod = p.slug === 'data' && D.updated > S.updated ? D.updated : S.updated;
      urls.push([`${SITE}/ccair/students/${p.slug ? p.slug + '/' : ''}`, mod]);
    }
  }
  fs.writeFileSync(path.join(CCAIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  return urls.length;
}
