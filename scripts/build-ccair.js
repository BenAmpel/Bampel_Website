const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const files = ['ccair-data', 'ccair-components', 'ccair-pages', 'ccair-app'];
const root = path.join(__dirname, '..');
const ccairDir = path.join(root, 'static', 'ccair');

// Map each website publication (content/*_publication/*/index.md) to its bampel.com paper page, PDF and code,
// keyed by normalized title, so CCAIR can link papers without duplicating their pages (one Scholar record each).
// Keep in sync with normTitle in static/ccair/ccair-components.jsx (CCAIR titles abbreviate ML and AI).
const normTitle = (s) => String(s).replace(/\bML\b/g, 'Machine Learning').replace(/\bAI\b/g, 'Artificial Intelligence').toLowerCase().replace(/[^a-z0-9]/g, '');
function buildPaperPages() {
  const out = {};
  for (const section of ['journal_publication', 'conference_publication', 'workshop_publication']) {
    const dir = path.join(root, 'content', section);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name, 'index.md');
      if (!entry.isDirectory() || !fs.existsSync(file)) continue;
      const fm = (fs.readFileSync(file, 'utf8').match(/^---\n([\s\S]*?)\n---/) || [])[1] || '';
      const field = (k) => { const m = fm.match(new RegExp('^' + k + ':\\s*["\']?(.*?)["\']?\\s*$', 'm')); return m && m[1].trim() ? m[1].trim() : null; };
      const title = field('title'), url = field('url');
      if (!title || !url || /^draft:\s*true/m.test(fm)) continue;
      const abs = (u) => (u && !/^https?:/.test(u) ? 'https://bampel.com/' + u.replace(/^\//, '') : u);
      out[normTitle(title)] = { page: abs(url), pdf: abs(field('url_pdf')), code: field('url_code'), data: field('url_dataset') };
    }
  }
  fs.writeFileSync(path.join(ccairDir, 'data', 'paper-pages.json'), JSON.stringify(out, null, 1) + '\n');
  return Object.keys(out).length;
}
console.log('CCAIR paper links: %d website publications mapped', buildPaperPages());

// Research materials: Ben edits data/ccair/materials-source.json (outside static/, so it is never published), which may
// hold placeholder entries and internal notes ("To be added by Ben.", "Placeholder: ...", "Ben to confirm ...").
// The public static/ccair/data/materials.json (gitignored) is written here with placeholder entries dropped and any
// field holding an internal note removed. The Materials page keeps its own placeholder filter as a second guard.
const INTERNAL_NOTE = /^\s*(to be added|placeholder)\b|\bben to confirm\b|\b(TBD|TODO|FIXME)\b/i;
function buildMaterials() {
  const src = path.join(root, 'data', 'ccair', 'materials-source.json');
  const items = JSON.parse(fs.readFileSync(src, 'utf8'));
  const clean = items
    .filter((m) => !m.placeholder && !INTERNAL_NOTE.test(m.description || '') && m.description)
    .map((m) => {
      const out = {};
      for (const [k, v] of Object.entries(m)) {
        if (k === 'placeholder') continue;
        if (typeof v === 'string' && INTERNAL_NOTE.test(v)) continue;
        out[k] = k === 'links' && Array.isArray(v) ? v.filter((l) => l && l.href && !INTERNAL_NOTE.test(l.label || '')) : v;
      }
      return out;
    });
  const json = JSON.stringify(clean, null, 2) + '\n';
  if (INTERNAL_NOTE.test(json)) throw new Error('materials.json still contains an internal note after cleaning');
  fs.writeFileSync(path.join(ccairDir, 'data', 'materials.json'), json);
  return [clean.length, items.length];
}
console.log('CCAIR materials: %d of %d source entries published', ...buildMaterials());

// Second guard for the other hand-edited CCAIR data files, which are published as they are.
for (const f of fs.readdirSync(path.join(ccairDir, 'data'))) {
  if (!f.endsWith('.json') || f === 'materials.json' || f === 'paper-pages.json') continue;
  const hits = fs.readFileSync(path.join(ccairDir, 'data', f), 'utf8').split('\n').filter((l) => INTERNAL_NOTE.test(l.replace(/^\s*"[^"]*":\s*"/, '')));
  if (hits.length) console.warn('CCAIR warning: %s looks like it holds internal notes:\n  %s', f, hits.join('\n  '));
}

// Friends of CCAIR: every entry needs a name, link, source page and retrieval date, and either a self-hosted logo (whose
// size must match the file, so the page reserves the right space) or a text wordmark. SVG logos must carry no scripts or
// external references, since the site's CSP serves images only from 'self'.
function checkFriends() {
  const list = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'friends.json'), 'utf8')).friends || [];
  for (const f of list) {
    for (const k of ['id', 'name', 'description', 'url', 'source', 'retrieved']) if (!f[k]) throw new Error(`friends.json: "${f.id || f.name}" needs ${k}`);
    if (!f.logo) { if (!f.wordmark || !f.wordmark.name) throw new Error(`friends.json: "${f.id}" needs a logo or a wordmark`); continue; }
    const file = path.join(ccairDir, 'assets', 'friends', f.logo.file);
    if (!fs.existsSync(file)) throw new Error(`friends.json: missing file assets/friends/${f.logo.file}`);
    if (!f.logo.alt || !f.logo.width || !f.logo.height) throw new Error(`friends.json: "${f.id}" logo needs alt, width and height`);
    const buf = fs.readFileSync(file);
    if (f.logo.file.endsWith('.png') && (buf.readUInt32BE(16) !== f.logo.width || buf.readUInt32BE(20) !== f.logo.height)) throw new Error(`friends.json: "${f.id}" width/height do not match ${f.logo.file}`);
    if (f.logo.file.endsWith('.svg') && /<script|\bon\w+\s*=|(?:xlink:)?href\s*=\s*["'](?!#)|<foreignObject/i.test(buf.toString('utf8'))) throw new Error(`friends.json: ${f.logo.file} has scripts or external references`);
  }
  return list.length;
}
console.log('CCAIR friends: %d organizations checked', checkFriends());

// People and publications: a missing field would print "undefined" on the page or throw (initialsOf needs a name).
function checkPeopleAndPublications() {
  const people = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'people.json'), 'utf8'));
  if (people.director) for (const k of ['name', 'title', 'dept', 'email']) if (!people.director[k]) throw new Error(`people.json: director needs ${k}`);
  for (const group of ['students', 'mentees', 'affiliates']) {
    for (const p of people[group] || []) for (const k of ['name', 'role']) if (!p[k]) throw new Error(`people.json: ${group} entry "${p.name || '?'}" needs ${k}`);
  }
  const pubs = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'publications.json'), 'utf8'));
  for (const p of pubs) {
    for (const k of ['title', 'authors', 'venue', 'year', 'type']) if (!p[k]) throw new Error(`publications.json: "${p.title || '?'}" needs ${k}`);
    if (!Number.isInteger(p.year)) throw new Error(`publications.json: "${p.title}" year must be a number`);
    if (!['journal', 'conference', 'workshop'].includes(p.type)) throw new Error(`publications.json: "${p.title}" has unknown type "${p.type}"`);
  }
  return pubs.length;
}
console.log('CCAIR people and publications: %d publications checked', checkPeopleAndPublications());

// Home hero preload. The hero <picture> is rendered only after the scripts and data/photos.json load, so the browser
// would find the LCP image three round trips late. dist/hero-preload.js (written here from the "home-hero"
// slot and loaded from between the markers in index.html, so the page has no inline script) that preloads the same AVIF candidates the Picture component asks for, and
// only when the address is the home route, so the inner pages (which have their own heroes or none) do not fetch it.
let heroPreloadJs = '';
function writeHeroPreload() {
  const file = path.join(ccairDir, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const start = '<!-- hero-preload:start (written by scripts/build-ccair.js) -->', end = '<!-- hero-preload:end -->';
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error('index.html: hero-preload markers missing');
  const photo = (JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'photos.json'), 'utf8')).photos || []).find((p) => p.slot === 'home-hero');
  const set = (base, widths) => widths.map((w) => `/ccair/assets/photos/${base}-${w}.avif ${w}w`).join(', ');
  const links = [];
  if (photo) {
    // Same media split as the <source> elements: the portrait crop on phones, the landscape one everywhere else.
    if (photo.mobile) links.push({ media: photo.mobile.media, srcset: set(photo.mobile.base, photo.mobile.widths) });
    links.push({ media: photo.mobile ? `not all and ${photo.mobile.media}` : 'all', srcset: set(photo.base, photo.widths) });
  }
  const js = !links.length ? '' : `/* Written by scripts/build-ccair.js from data/photos.json (slot "home-hero"). */
(function () {
  if (!/^(#\\/?)?$/.test(location.hash.split('?')[0])) return;
  ${JSON.stringify(links)}.forEach(function (l) {
    var el = document.createElement('link');
    el.rel = 'preload'; el.as = 'image'; el.type = 'image/avif'; el.media = l.media;
    el.setAttribute('imagesrcset', l.srcset); el.setAttribute('imagesizes', '100vw'); el.setAttribute('fetchpriority', 'high');
    document.head.appendChild(el);
  });
})();
`;
  heroPreloadJs = js; // written into dist/ after the bundle step resets that folder
  const script = !links.length ? '' : '\n  <script src="/ccair/dist/hero-preload.js"></script>\n  ';
  const next = html.slice(0, a + start.length) + script + html.slice(b);
  if (next !== html) fs.writeFileSync(file, next);
  return links.length;
}
console.log('CCAIR home hero: %d preload candidates written to dist/hero-preload.js', writeHeroPreload());

// One HTML file per CCAIR page (2026-10-24): /ccair/<page>/index.html is the same app shell as index.html with that
// page's title, description, canonical address and social tags, and a short static summary (its heading and lede, read
// from the page's <PageHead> in ccair-pages.jsx, plus links to every page) in place of the home summary, so search engines
// index each page and shared links show the right card. The app reads the page from the path (ccair-app.jsx).
// The files are build output (.gitignore).
function writeRoutePages() {
  const shell = fs.readFileSync(path.join(ccairDir, 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ccairDir, 'ccair-app.jsx'), 'utf8');
  const pagesSrc = fs.readFileSync(path.join(ccairDir, 'ccair-pages.jsx'), 'utf8');
  const titles = Object.fromEntries([...appSrc.matchAll(/\b([a-z]+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Search descriptions: the whole lede when it fits, else its first sentence when that fits, else a cut at a word.
  const describe = (t) => {
    if (t.length <= 155) return t;
    const first = /^.*?[.!?](?=\s|$)/.exec(t);
    if (first && first[0].length >= 70 && first[0].length <= 155) return first[0];
    const cut = t.slice(0, 152); return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '…';
  };
  const funcs = [...pagesSrc.matchAll(/^function (\w+)Page\(\)/gm)].map((m) => ({ name: m[1].toLowerCase(), at: m.index }));
  const navStart = shell.indexOf('<nav aria-label="CCAIR pages"');
  if (navStart < 0) throw new Error('index.html: the CCAIR pages <nav> is missing from the summary');
  const nav = shell.slice(navStart, shell.indexOf('</nav>', navStart) + 6);
  let written = 0;
  funcs.forEach((f, i) => {
    if (f.name === 'home') return;
    const body = pagesSrc.slice(f.at, i + 1 < funcs.length ? funcs[i + 1].at : undefined);
    const head = /<PageHead\s+eyebrow="([^"]*)"\s+title="([^"]*)"\s+lede="([^"]*)"/.exec(body);
    if (!head || !titles[f.name]) throw new Error(`ccair-pages.jsx: no PageHead or title for "${f.name}"`);
    const [, , heading, lede] = head;
    const url = `https://bampel.com/ccair/${f.name}/`, title = titles[f.name], desc = describe(lede);
    const swap = (html, re, value) => { if (!re.test(html)) throw new Error(`index.html: ${re} not found`); return html.replace(re, value); };
    let html = shell;
    html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = swap(html, /(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`);
    html = swap(html, /(<link rel="canonical" href=")[^"]*/, `$1${url}`);
    html = swap(html, /(<meta property="og:url" content=")[^"]*/, `$1${url}`);
    html = swap(html, /(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`);
    html = swap(html, /(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`);
    html = swap(html, /(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`);
    html = swap(html, /(<meta name="twitter:description" content=")[^"]*/, `$1${esc(desc)}`);
    // The home page's hero image preload is for the home route only.
    html = html.replace(/\n  <script src="\/ccair\/dist\/hero-preload.js"><\/script>\n  /, '');
    html = swap(html, /<div class="narrow" style="padding:64px 0">[\s\S]*?<\/nav>\n    <\/div>/,
      `<div class="narrow" style="padding:64px 0">\n      <h1 style="font-size:40px;line-height:1.1;font-weight:300;margin-bottom:20px">${esc(heading)}</h1>\n      <p class="lede" style="margin-bottom:16px">${esc(lede)}</p>\n      <p style="margin-bottom:16px"><a href="/ccair/">Center for CyberAI Research (CCAIR), Georgia State University</a></p>\n      ${nav}\n    </div>`);
    fs.mkdirSync(path.join(ccairDir, f.name), { recursive: true });
    fs.writeFileSync(path.join(ccairDir, f.name, 'index.html'), html);
    written++;
  });
  return written;
}
console.log('CCAIR pages: %d prerendered page shells written to /ccair/<page>/index.html', writeRoutePages());

// One file for the whole app (was four requests). Each source file is still transpiled on its own and wrapped in its own
// function, exactly as before (they share state only through window.CCAIR), then joined in load order.
Promise.all(
  files.map((f) =>
    esbuild.build({
      entryPoints: [path.join(ccairDir, `${f}.jsx`)],
      write: false,
      outfile: path.join(ccairDir, 'dist', `${f}.js`),
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020',
      minify: true,
      bundle: false,
      banner: { js: '(function(){' },
      footer: { js: '})();' },
    })
  )
)
  .then((results) => {
    const dist = path.join(ccairDir, 'dist');
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'ccair.js'), results.map((r) => r.outputFiles[0].text.trimEnd()).join('\n') + '\n');
    if (heroPreloadJs) fs.writeFileSync(path.join(dist, 'hero-preload.js'), heroPreloadJs);
    console.log('CCAIR build complete: %d files bundled into dist/ccair.js', files.length);
  })
  .catch((err) => {
    console.error('CCAIR build failed:', err);
    process.exit(1);
  });
