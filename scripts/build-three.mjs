// three.js globe for the Research Footprint (assets/js/footprint-globe.mjs), bundled with only the three.js pieces it imports.
// Rerun after changing the globe module or the three version:  node scripts/build-three.mjs
// Output: static/vendor/three/<version>/footprint-globe.min.js (window.FootprintGlobe). Self-hosted, so CSP script-src 'self' covers it.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'three', 'package.json'), 'utf8')).version;
const out = path.join(root, 'static', 'vendor', 'three', version, 'footprint-globe.min.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(root, 'assets', 'js', 'footprint-globe.mjs')],
  bundle: true, minify: true, format: 'iife', target: 'es2018', outfile: out, legalComments: 'none',
  banner: { js: `/*! three.js ${version} (MIT, https://threejs.org) + Research Footprint globe. Built by scripts/build-three.mjs. */` },
});
console.log(`three ${version}: ${fs.statSync(out).size} bytes -> ${path.relative(root, out)}`);
