// Internal link check for a built site: every href and src in the HTML that points at this site (a relative path, a
// root path, or https://bampel.com/...) must resolve to a file in the build. External links are not fetched (CI would
// flake on sites that block bots; scripts/check-guide-freshness.mjs covers the guide's sources).
//   node scripts/check-links.mjs public
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'public');
if (!fs.existsSync(root)) { console.error(`no build at ${root}`); process.exit(2); }
const SITE = /^https?:\/\/(www\.)?bampel\.com/i;
const pages = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p); } })(root);
const exists = (rel) => {
  const p = path.join(root, rel);
  if (!p.startsWith(root)) return false;
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
  return fs.existsSync(path.join(p, 'index.html'));
};
const broken = new Map();
let checked = 0;
for (const page of pages) {
  const html = fs.readFileSync(page, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const dir = '/' + path.relative(root, path.dirname(page)).split(path.sep).join('/');
  for (const m of html.matchAll(/\s(?:href|src)=(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi)) {
    let url = (m[1] ?? m[2] ?? m[3] ?? '').trim().replace(/&amp;/g, '&');
    if (!url || /^(#|mailto:|tel:|javascript:|data:|blob:|about:)/i.test(url)) continue;
    if (SITE.test(url)) url = url.replace(SITE, '') || '/';
    else if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url)) continue;               // another site
    if (url.includes('{{') || url.includes('${')) continue;                     // template text inside the page
    url = url.split('#')[0].split('?')[0];
    if (!url) continue;
    let rel; try { rel = decodeURIComponent(url.startsWith('/') ? url : path.posix.join(dir, url)); } catch { rel = url; }
    checked++;
    if (!exists(rel)) {
      const from = path.relative(root, page);
      if (!broken.has(rel)) broken.set(rel, new Set());
      broken.get(rel).add(from);
    }
  }
}
console.log(`${pages.length} pages, ${checked} internal links and assets checked, ${broken.size} broken targets`);
for (const [target, from] of [...broken].slice(0, 50)) console.log(`  ${target}  <- ${[...from].slice(0, 3).join(', ')}${from.size > 3 ? ` (+${from.size - 3} more)` : ''}`);
process.exit(broken.size ? 1 : 0);
