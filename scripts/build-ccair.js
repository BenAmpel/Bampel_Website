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
