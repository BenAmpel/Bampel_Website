// Sharing cards for the CCAIR home and app pages (2026-10-26). Runs after build-ccair.js, which writes the page shells
// (/ccair/<page>/index.html) from index.html. Each card shows the page's <PageHead> eyebrow and title from
// ccair-pages.jsx, so a retitled page gets a new card on the next build on a machine with Google Chrome (see ogImages in
// ccair-static.mjs). This script then points each page's og:image and twitter:image at its card. index.html is source,
// so its tags change here only when the home card changes; commit it with static/ccair/assets/og/.
import fs from 'node:fs';
import path from 'node:path';
import { CCAIR, SITE, esc, ogImages } from './ccair-static.mjs';

const pagesSrc = fs.readFileSync(path.join(CCAIR, 'ccair-pages.jsx'), 'utf8');
const pages = [{ key: 'index', file: 'index.html', eyebrow: 'AI-enabled cybersecurity research',
  title: 'Spotting malicious behavior before it turns into an attack', url: `${SITE}/ccair/` }];
// One card per page function, read the way build-ccair.js reads them (each function's own source, up to the next one).
const funcs = [...pagesSrc.matchAll(/^function (\w+)Page\(\)/gm)].map((m) => ({ name: m[1].toLowerCase(), at: m.index }));
funcs.forEach((f, i) => {
  if (f.name === 'home') return;
  const head = /<PageHead\s+eyebrow="([^"]*)"\s+title="([^"]*)"/.exec(pagesSrc.slice(f.at, i + 1 < funcs.length ? funcs[i + 1].at : undefined));
  if (!head) throw new Error(`ccair-pages.jsx: no PageHead for "${f.name}"`);
  if (!fs.existsSync(path.join(CCAIR, f.name, 'index.html'))) throw new Error(`/ccair/${f.name}/index.html is missing; run scripts/build-ccair.js first`);
  pages.push({ key: f.name, file: path.join(f.name, 'index.html'), eyebrow: head[1], title: head[2], url: `${SITE}/ccair/${f.name}/` });
});

const images = ogImages(pages.map((p) => ({ ...p, alt: `${p.title}. Center for CyberAI Research (CCAIR), Georgia State University.` })),
  { pngDir: path.join(CCAIR, 'assets', 'og'), svgDir: path.join(CCAIR, 'dist', 'og'), script: 'scripts/build-ccair-og.mjs' });

for (const p of pages) {
  const file = path.join(CCAIR, p.file), img = images[p.key];
  const before = fs.readFileSync(file, 'utf8');
  let html = before;
  for (const [re, value] of [
    [/(<meta property="og:image" content=")[^"]*/, img.url],
    [/(<meta property="og:image:width" content=")[^"]*/, img.width],
    [/(<meta property="og:image:height" content=")[^"]*/, img.height],
    [/(<meta property="og:image:alt" content=")[^"]*/, esc(img.alt)],
    [/(<meta name="twitter:image" content=")[^"]*/, img.url],
    [/(<meta name="twitter:image:alt" content=")[^"]*/, esc(img.alt)]
  ]) {
    if (!re.test(html)) throw new Error(`${p.file}: ${re} not found`);
    html = html.replace(re, `$1${value}`);
  }
  if (html !== before) fs.writeFileSync(file, html);
}
console.log('CCAIR sharing cards: %d pages', pages.length);
