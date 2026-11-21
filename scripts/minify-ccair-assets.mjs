// Minifies the Pathway Finder and student-guide scripts and styles in the built site (2026-11-15).
//   node scripts/minify-ccair-assets.mjs public
// The files in static/ccair/assets/pathways/ and static/ccair/assets/students/ stay readable in the repo. This runs on the
// build output, after the last Hugo pass and scripts/fingerprint-ccair.mjs (netlify.toml and .github/workflows/ci.yml), and
// rewrites each file in public/ with esbuild's minifier (whitespace, names and syntax only; no bundling, no behaviour change).
// Cache busting: these files keep their names, so every page's "?v=" query is replaced with the first 10 hex digits of the
// SHA-256 of the minified bytes. A changed file always gets a new URL. The suffix VALUES in build-pathways.mjs and
// build-students.mjs no longer matter, but a "?v=" must still be there: only an existing query is rewritten, so a bare
// URL would stay unversioned (and an unmatched build throws below).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const root = path.resolve(process.argv[2] || 'public');
const assetDir = path.join(root, 'ccair', 'assets');
const files = ['pathways/pathways.js', 'pathways/pathways-motion.js', 'pathways/pathways.css',
  'students/students.js', 'students/students.css', 'students/print.css'];

const versions = new Map();
let before = 0, after = 0;
for (const rel of files) {
  const file = path.join(assetDir, rel);
  if (!fs.existsSync(file)) throw new Error(`minify-ccair-assets: ${file} is missing (run hugo first)`);
  const src = fs.readFileSync(file, 'utf8');
  const loader = rel.endsWith('.css') ? 'css' : 'js';
  const out = transformSync(src, { loader, minify: true, legalComments: 'none', target: 'es2019' }).code;
  if (!out.trim()) throw new Error(`minify-ccair-assets: ${rel} minified to nothing`);
  fs.writeFileSync(file, out);
  versions.set(rel, crypto.createHash('sha256').update(out).digest('hex').slice(0, 10));
  before += Buffer.byteLength(src); after += Buffer.byteLength(out);
}

// Every built page that references one of the files.
const re = new RegExp(`(/ccair/assets/(${files.map((f) => f.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|')}))\\?v=[^"'\\s>]+`, 'g');
let pages = 0, refs = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) {
      const html = fs.readFileSync(p, 'utf8');
      let n = 0;
      const next = html.replace(re, (_, url, rel) => { n++; return `${url}?v=${versions.get(rel)}`; });
      if (n) { fs.writeFileSync(p, next); pages++; refs += n; }
    }
  }
};
walk(path.join(root, 'ccair'));
if (!refs) throw new Error('minify-ccair-assets: no page references the minified files');
console.log('CCAIR minify: %d files, %d -> %d bytes, %d references in %d pages', files.length, before, after, refs, pages);
