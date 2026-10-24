// Self-hosted Google Fonts for the bampel.com pages (2026-10-24): fetches the css2 stylesheet the site used to load from
// fonts.googleapis.com, downloads every woff2 it names into static/fonts/google/, and writes static/fonts/google/fonts.css
// pointing at those copies. Browsers still fetch only the unicode-range subsets a page needs. Rerun after changing the
// font families (layouts/partials/site_head.html loads /fonts/google/fonts.css):
//   node scripts/self-host-google-fonts.mjs "https://fonts.googleapis.com/css2?family=...&display=swap"
// The fonts are under the SIL Open Font License (see static/fonts/google/README.md).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const url = process.argv[2];
if (!url || !url.startsWith('https://fonts.googleapis.com/css2?')) { console.error('usage: node scripts/self-host-google-fonts.mjs <css2 url>'); process.exit(1); }
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'static', 'fonts', 'google');
// A current Chrome user agent makes Google answer with woff2 files split by unicode-range.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
if (!css.includes('@font-face')) throw new Error('no @font-face in the response');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = new Map();
for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)) files.set(m[1], null);
for (const remote of files.keys()) {
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`${res.status} for ${remote}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const name = crypto.createHash('sha256').update(remote).digest('hex').slice(0, 16) + '.woff2';
  fs.writeFileSync(path.join(out, name), buf);
  files.set(remote, name);
}
const local = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g, (_, r) => `url(/fonts/google/${files.get(r)})`);
fs.writeFileSync(path.join(out, 'fonts.css'), `/* Self-hosted copy of ${url}\n   written by scripts/self-host-google-fonts.mjs; do not edit by hand. */\n${local}`);
fs.writeFileSync(path.join(out, 'README.md'), `# Self-hosted Google Fonts\n\nFira Code, Merriweather, Playfair Display and Roboto Mono, downloaded from Google Fonts by\n\`scripts/self-host-google-fonts.mjs\` so pages make no request to Google. All four are licensed under the SIL Open Font\nLicense 1.1 (https://openfontlicense.org), which allows redistribution with the site.\n\nSource stylesheet: ${url}\n`);
console.log(`fonts.css with ${files.size} woff2 files, ${[...css.matchAll(/@font-face/g)].length} @font-face rules`);
