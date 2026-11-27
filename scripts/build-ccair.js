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
  // The dataset catalog's citation names its version; take it from datasets.json so a re-import cannot leave it stale.
  const catalogVersion = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'datasets.json'), 'utf8')).updated;
  for (const m of clean) if (m.title === 'CCAIR Cybersecurity Dataset Catalog' && m.cite) m.cite = m.cite.replace(/\(Version [^)]*\)/, `(Version ${catalogVersion})`).replace(/\(\d{4}\)/, `(${catalogVersion.slice(0, 4)})`);
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
  for (const group of ['students', 'sfsScholars', 'mentees', 'affiliates']) {
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
const ROUTE_HERO_SLOTS = { people: 'people-band' };
function heroLinkFor(page) {
  const slot = ROUTE_HERO_SLOTS[page];
  if (!slot) return '';
  const photo = (JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'photos.json'), 'utf8')).photos || []).find((p) => p.slot === slot);
  if (!photo || photo.mobile) return '';
  const set = photo.widths.map((w) => `/ccair/assets/photos/${photo.base}-${w}.avif ${w}w`).join(', ');
  return `\n  <link rel="preload" as="image" type="image/avif" imagesrcset="${set}" imagesizes="100vw" fetchpriority="high">\n  `;
}
// Static list of every publication for the /ccair/publications/ shell (2026-11-26), so crawlers and visitors without
// JavaScript get the same entries the app lists. Same data and default order as PublicationsPage (publications.json,
// stable sort by year, newest first); the title links to the bampel.com paper page when paper-pages.json has one, and
// the DOI links to doi.org. React replaces the whole #root summary on mount, so nothing here stays in the DOM.
function publicationsList(esc) {
  const pubs = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'publications.json'), 'utf8'));
  const pages = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'paper-pages.json'), 'utf8'));
  const items = pubs.slice().sort((a, b) => (b.year || 0) - (a.year || 0)).map((p) => {
    const site = pages[normTitle(p.title)] || {};
    const title = site.page ? `<a href="${esc(site.page)}">${esc(p.title)}</a>` : esc(p.title);
    const venue = `${p.venue || ''}${p.year ? `, ${p.year}` : ''}`;
    const doi = p.doi ? `<div class="side"><span class="links"><a href="${esc('https://doi.org/' + p.doi)}" aria-label="${esc('DOI for ' + p.title)}">DOI</a></span></div>` : '';
    return `        <li class="pub"><cite>${title}</cite><span class="authors">${esc(p.authors || '')}</span><span class="venue">${esc(venue)}</span>${doi}</li>`;
  });
  return `\n      <h2 class="pub-year">All ${pubs.length} publications</h2>\n      <ol class="pub-list">\n${items.join('\n')}\n      </ol>`;
}
// Static list of every person for the /ccair/people/ shell (2026-11-26), grouped and ordered exactly as PeoplePage reads
// people.json: director, then graduate researchers (Georgia State students, SFS scholars, current mentees, former
// mentees), then faculty affiliates. Records carry no personal link, so none is written. React replaces the whole #root
// summary on mount, so nothing here stays in the DOM.
function peopleList(esc) {
  const people = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'people.json'), 'utf8'));
  const li = (name, ...lines) => `          <li class="person"><strong>${esc(name)}</strong>${lines.filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('')}</li>`;
  const group = (title, items, level = 3) => items.length ? `\n      <h${level}>${esc(title)}</h${level}>\n        <ul class="people-list">\n${items.join('\n')}\n        </ul>` : '';
  const join = (...a) => a.filter(Boolean).join(' \u00b7 ');
  const d = people.director;
  const mentees = people.mentees || [];
  const out = [];
  if (d) out.push(`\n      <h2>Director</h2>\n        <ul class="people-list">\n${li('Dr. ' + d.name, `${d.title}, ${d.dept}`)}\n        </ul>`);
  out.push('\n      <h2>Graduate researchers</h2>');
  out.push(group('Georgia State University', (people.students || []).map((s) => li(s.name, s.role, join(s.org, s.years)))));
  out.push(group('NSF CyberCorps Scholarship for Service (SFS) scholars', (people.sfsScholars || []).map((s) => li(s.name, s.role, s.org))));
  out.push(group('Mentees at partner universities', mentees.filter((s) => !s.now).map((s) => li(s.name, s.role, join(s.org, s.years)))));
  out.push(group('Former mentees', mentees.filter((s) => s.now).map((s) => li(s.name, s.role, join(s.mentoredAt && `Mentored at ${s.mentoredAt}`, s.years), `Now at ${s.now}`))));
  out.push(`\n      <h2>Faculty affiliates</h2>${group('Faculty', (people.affiliates || []).map((a) => li(a.name, a.role, a.dept, a.synergy)), 3)}`);
  return out.join('');
}
// Static lists for the /ccair/research/ and /ccair/resources/ shells (2026-11-26). The research areas live as constants
// in ccair-pages.jsx, so they are read from that file (the literal is evaluated in an empty vm context) instead of being
// copied: one source for the page and the shell. Section titles and intros are read from the page's <Section> tags the
// same way. The resources come from resources.json in file order, grouped as the page's tabs are (datasets, benchmarks,
// tools; empty groups left out), all groups at once because there is no tab to switch without JavaScript. React replaces
// the whole #root summary on mount, so nothing here stays in the DOM.
function pageConst(pagesSrc, name) {
  const m = new RegExp(`^const ${name} = (\\[[\\s\\S]*?^\\]);`, 'm').exec(pagesSrc);
  if (!m) throw new Error(`ccair-pages.jsx: const ${name} not found`);
  return require('vm').runInNewContext(`(${m[1]})`, Object.create(null));
}
function sectionText(body, id) {
  const tag = new RegExp(`<Section id="${id}"[^>]*>`).exec(body);
  if (!tag) throw new Error(`ccair-pages.jsx: <Section id="${id}"> not found`);
  const attr = (n) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(tag[0]); return m ? m[1] : ''; };
  return { title: attr('title'), intro: attr('intro') };
}
function researchList(esc, pagesSrc, body) {
  const head = (id, level = 'h2') => { const t = sectionText(body, id); return `\n      <${level}>${esc(t.title)}</${level}>${t.intro ? `\n      <p>${esc(t.intro)}</p>` : ''}`; };
  const li = (name, desc) => `          <li class="static-item"><strong>${esc(name)}</strong><span>${esc(desc)}</span></li>`;
  const list = (items) => `\n        <ul class="static-list">\n${items.join('\n')}\n        </ul>`;
  const out = [head('primitives')];
  out.push(`\n        <ol class="static-list">\n${pageConst(pagesSrc, 'PILLARS').map((p) => `          <li class="static-item"><strong>${esc(p.title)}</strong><span>${esc(p.desc)}</span>\n            <ul class="static-points">${p.points.map((pt) => `<li>${esc(pt)}</li>`).join('')}</ul></li>`).join('\n')}\n        </ol>`);
  out.push(head('portfolio'));
  pageConst(pagesSrc, 'RESEARCH_PORTFOLIO').forEach((t) => out.push(`\n      <h3>${esc(t.tier)}: ${esc(t.risk)}</h3>${list(t.areas.map((a) => li(a.name, a.desc)))}`));
  out.push(head('constructs'), list(pageConst(pagesSrc, 'CONSTRUCTS').map((c) => li(c.name, c.desc))));
  out.push(head('outputs'), list(pageConst(pagesSrc, 'CENTER_OUTPUTS').map((o) => li(o.title, o.desc))));
  return out.join('');
}
function resourcesList(esc, body) {
  const all = JSON.parse(fs.readFileSync(path.join(ccairDir, 'data', 'resources.json'), 'utf8'));
  const t = sectionText(body, 'assets');
  const out = [`\n      <h2>${esc(t.title)}</h2>\n      <p>${esc(t.intro)}</p>`];
  for (const cat of ['dataset', 'benchmark', 'tool']) {
    const items = all.filter((r) => r.category === cat);
    if (!items.length) continue;
    const label = cat[0].toUpperCase() + cat.slice(1) + 's';
    out.push(`\n      <h3>${label}</h3>\n        <ul class="static-list">\n${items.map((r) => `          <li class="static-item"><strong>${esc(r.title)}</strong><span>${esc(r.status || '')}</span><span>${esc(r.description || '')}</span>${(r.tags || []).length ? `<span>${esc((r.tags || []).join(', '))}</span>` : ''}${r.link ? `<a href="${esc(r.link)}">${esc(r.linkLabel || 'Open')}</a>` : ''}</li>`).join('\n')}\n        </ul>`);
  }
  return out.join('');
}
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
    // People page: its hero is rendered by the app after the data loads, so the preload is written into the page's own
    // <head> (no script) for the same AVIF candidates the Picture component asks for.
    html = html.replace(/\n  <script src="\/ccair\/dist\/hero-preload.js"><\/script>\n  /, heroLinkFor(f.name));
    const extra = f.name === 'publications' ? publicationsList(esc) : f.name === 'people' ? peopleList(esc)
      : f.name === 'research' ? researchList(esc, pagesSrc, body) : f.name === 'resources' ? resourcesList(esc, body) : '';
    html = swap(html, /<div class="narrow" style="padding:64px 0">[\s\S]*?<\/nav>\n    <\/div>/,
      `<main id="main-content">\n    <div class="narrow" style="padding:64px 0">\n      <h1 style="font-size:40px;line-height:1.1;font-weight:300;margin-bottom:20px">${esc(heading)}</h1>\n      <p class="lede" style="margin-bottom:16px">${esc(lede)}</p>\n      <p style="margin-bottom:16px"><a href="/ccair/">Center for CyberAI Research (CCAIR), Georgia State University</a></p>\n      ${nav}${extra}\n    </div>\n    </main>`);
    fs.mkdirSync(path.join(ccairDir, f.name), { recursive: true });
    fs.writeFileSync(path.join(ccairDir, f.name, 'index.html'), html);
    written++;
  });
  return written;
}
console.log('CCAIR pages: %d prerendered page shells written to /ccair/<page>/index.html', writeRoutePages());

// Sitemap lastmod for the app pages (/ccair/ and /ccair/<page>/), the same way scripts/build-students.mjs dates the
// Student Guide: each page is hashed from its <Name>Page() function in ccair-pages.jsx plus the data files that function
// reads through useData(). data/ccair/app-lastmod.json (committed, unpublished) keeps the hash and the date, and
// scripts/ccair-lastmod.js decides the date without the clock: unchanged hash keeps the stored date, a changed hash takes
// the date of the last commit to the page's inputs, so the result is the same on any machine and on a rebuild of the same
// commit, and nobody has to remember to commit the file. A shallow clone keeps the stored date. scripts/ccair-static.mjs
// (writeSitemap) reads the file.
const APP_LASTMOD_STORE = path.join(root, 'data', 'ccair', 'app-lastmod.json');
function writeAppLastmod() {
  const crypto = require('crypto');
  const { makeGit, resolveLastmod } = require('./ccair-lastmod');
  const g = makeGit(root);
  const pagesSrc = fs.readFileSync(path.join(ccairDir, 'ccair-pages.jsx'), 'utf8');
  // Data key (ccair-data.jsx DATA_FILES) -> [published file it hashes, source file whose commits date it].
  const dataFile = (key) => ({
    materials: ['static/ccair/data/materials.json', 'data/ccair/materials-source.json'],
    paperPages: ['static/ccair/data/paper-pages.json', 'content'],
  }[key] || [`static/ccair/data/${key}.json`, `static/ccair/data/${key}.json`]);
  const funcs = [...pagesSrc.matchAll(/^function (\w+)Page\(\)/gm)].map((m) => ({ name: m[1].toLowerCase(), at: m.index }));
  const store = fs.existsSync(APP_LASTMOD_STORE) ? JSON.parse(fs.readFileSync(APP_LASTMOD_STORE, 'utf8')) : { pages: {} };
  const next = { note: 'Written by scripts/build-ccair.js. lastmod is the date the hash of the page\'s function in ccair-pages.jsx and the data files it reads last changed. Dates come from git history (scripts/ccair-lastmod.js), not the clock, so a rebuild of the same commit rewrites this file identically; committing it keeps shallow clones accurate.', pages: {} };
  funcs.forEach((f, i) => {
    const body = pagesSrc.slice(f.at, i + 1 < funcs.length ? funcs[i + 1].at : undefined);
    const used = /const \{([^}]*)\} = useData\(\)/.exec(body);
    const keys = used ? used[1].split(',').map((k) => k.split(':')[0].trim()).filter(Boolean).sort() : [];
    // Data is hashed with its object keys sorted, so the order a file was written in (paper-pages.json follows
    // readdirSync, which differs between macOS and Netlify's Linux) does not change the date.
    const canon = (v) => Array.isArray(v) ? v.map(canon)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
    const hash = crypto.createHash('sha256').update(body);
    for (const k of keys) {
      const file = path.join(root, dataFile(k)[0]);
      hash.update(`\n${k}\n`).update(fs.existsSync(file) ? JSON.stringify(canon(JSON.parse(fs.readFileSync(file, 'utf8')))) : '');
    }
    const digest = hash.digest('hex');
    const u = f.name === 'home' ? '/ccair/' : `/ccair/${f.name}/`, prev = store.pages[u];
    const lastmod = resolveLastmod(prev, digest, ['static/ccair/ccair-pages.jsx', ...keys.map((k) => dataFile(k)[1])], g);
    next.pages[u] = { hash: digest, lastmod };
  });
  const text = JSON.stringify(next, null, 2) + '\n';
  if (!fs.existsSync(APP_LASTMOD_STORE) || fs.readFileSync(APP_LASTMOD_STORE, 'utf8') !== text) {
    fs.writeFileSync(APP_LASTMOD_STORE, text);
    console.log('app-lastmod.json updated (a CCAIR page\'s content changed since it was last committed).');
  }
  return Object.keys(next.pages).length;
}
console.log('CCAIR page dates: %d app pages dated in data/ccair/app-lastmod.json', writeAppLastmod());

// Official lockup switch (static/ccair/assets/brand/official/lockup.json): inlined into the bundle as CCAIR_LOCKUP, the
// config when it is switched on and has a light file, else null, so the app does not fetch it on every load.
const lockup = JSON.parse(fs.readFileSync(path.join(ccairDir, 'assets', 'brand', 'official', 'lockup.json'), 'utf8'));
const lockupDefine = lockup.enabled && lockup.files && lockup.files.light ? JSON.stringify(lockup) : 'null';
console.log('CCAIR official lockup: %s', lockupDefine === 'null' ? 'off (text wordmark)' : 'on');

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
      define: { CCAIR_LOCKUP: lockupDefine },
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
