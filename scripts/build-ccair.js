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
    console.log('CCAIR build complete: %d files bundled into dist/ccair.js', files.length);
  })
  .catch((err) => {
    console.error('CCAIR build failed:', err);
    process.exit(1);
  });
