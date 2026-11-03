// Content-hashed names for the CCAIR app's own CSS and scripts (2026-11-03), so repeat visits use the cached copy.
// Runs on the built site, after the last Hugo pass (netlify.toml build command and .github/workflows/ci.yml):
//   node scripts/fingerprint-ccair.mjs public
// For each file below it writes a copy whose name carries the first 10 hex digits of its SHA-256 next to the original
// (public/ccair/assets/ccair.<hash>.css, public/ccair/dist/ccair.<hash>.js, public/ccair/assets/boot.<hash>.js) and points
// every CCAIR page shell (public/ccair/index.html and public/ccair/<page>/index.html) at the copies. netlify.toml caches
// only these hashed names for a year; the HTML, the data JSON and the unhashed originals keep "must-revalidate".
// It works on the build output, not on static/ccair/index.html, so the tracked shell does not change with every edit.
// The copies stay in the same folder as the originals, so relative url()s in the CSS (fonts/...) still resolve.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'public');
const ccair = path.join(root, 'ccair');
if (!fs.existsSync(path.join(ccair, 'index.html'))) { console.error(`no CCAIR build at ${ccair}`); process.exit(2); }

const assets = ['assets/ccair.css', 'dist/ccair.js', 'assets/boot.js'].map((rel) => {
  const file = path.join(ccair, rel);
  if (!fs.existsSync(file)) throw new Error(`fingerprint-ccair: ${file} is missing (run npm run build:ccair first)`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
  const ext = path.extname(rel);
  const hashed = `${rel.slice(0, -ext.length)}.${hash}${ext}`;
  fs.copyFileSync(file, path.join(ccair, hashed));
  // The reference as written in the shell, with or without an old hand-made ?v= query.
  const re = new RegExp(`(["'])/ccair/${rel.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\?[^"']*)?\\1`, 'g');
  return { rel, hashed, re };
});

// The page shells: index.html and every <page>/index.html that loads the app bundle (the Pathway Finder and student
// pages are separate static pages that do not load it).
const shells = [path.join(ccair, 'index.html')];
for (const e of fs.readdirSync(ccair, { withFileTypes: true })) {
  const f = path.join(ccair, e.name, 'index.html');
  if (e.isDirectory() && fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('/ccair/dist/ccair.js')) shells.push(f);
}

for (const file of shells) {
  let html = fs.readFileSync(file, 'utf8');
  for (const a of assets) {
    if (!html.match(a.re)) throw new Error(`fingerprint-ccair: ${path.relative(root, file)} does not load /ccair/${a.rel}`);
    html = html.replace(a.re, `$1/ccair/${a.hashed}$1`);
  }
  fs.writeFileSync(file, html);
}
console.log('CCAIR fingerprints: %s in %d page shells', assets.map((a) => a.hashed).join(', '), shells.length);
