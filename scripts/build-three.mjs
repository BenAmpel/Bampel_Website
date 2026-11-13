// The site's 3D views (assets/js/three/index.mjs: globe, graph, fan, heroes), bundled with only the three.js pieces they import.
// Rerun after changing any module under assets/js/three or the globe:  node scripts/build-three.mjs
// Output: static/vendor/three/<version>/site-3d.min.js (window.Site3D, window.FootprintGlobe). Self-hosted, so CSP script-src 'self' covers it.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'three', 'package.json'), 'utf8')).version;
const out = path.join(root, 'static', 'vendor', 'three', version, 'site-3d.min.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
await build({
  entryPoints: [path.join(root, 'assets', 'js', 'three', 'index.mjs')],
  bundle: true, minify: true, format: 'iife', target: 'es2018', outfile: out, legalComments: 'none',
  banner: { js: `/*! three.js ${version} (MIT, https://threejs.org) + bampel.com 3D views. Built by scripts/build-three.mjs. */` },
});
console.log(`three ${version}: ${fs.statSync(out).size} bytes -> ${path.relative(root, out)}`);
