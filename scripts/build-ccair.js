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

Promise.all(
  files.map((f) =>
    esbuild.build({
      entryPoints: [path.join(ccairDir, `${f}.jsx`)],
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
  .then(() => console.log('CCAIR build complete: %d files transpiled', files.length))
  .catch((err) => {
    console.error('CCAIR build failed:', err);
    process.exit(1);
  });
