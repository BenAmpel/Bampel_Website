// The Academicons font is a 4-glyph subset (static/vendor/academicons/1.9.2-subset). Checks that the integrity hash in
// layouts/partials/site_head.html matches the css file, and that no template, content file or script uses an icon the
// subset lacks (it would render as an empty box).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'static/vendor/academicons/1.9.2-subset');
const css = readFileSync(join(dir, 'css/academicons.min.css'));
const sri = 'sha512-' + createHash('sha512').update(css).digest('base64');
const head = readFileSync(join(root, 'layouts/partials/site_head.html'), 'utf8');
assert.ok(head.includes(sri), 'site_head.html integrity hash matches the subset css');
assert.ok(statSync(join(dir, 'fonts/academicons-subset.woff2')).size < 5000, 'font is the small subset');

const have = new Set([...css.toString().matchAll(/\.(ai-[a-z0-9-]+):before/g)].map(m => m[1]));
assert.ok(have.size >= 4);
const used = new Set();
const walk = d => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!['vendor', 'node_modules', 'lab'].includes(e.name)) walk(p); continue; }
    if (!/\.(html|md|js|jsx|json|yaml|toml)$/.test(e.name)) continue;
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/\bai ai-([a-z0-9-]+)/g)) used.add('ai-' + m[1]);
    // Front matter social links: "icon: name" then other keys, then "icon_pack: ai".
    for (const m of text.matchAll(/icon:\s*["']?([a-z0-9-]+)["']?[ \t]*\n(?:[ \t]+(?!icon:)[a-z_]+:[^\n]*\n)*?[ \t]+icon_pack:\s*ai\b/g)) used.add('ai-' + m[1]);
  }
};
for (const d of ['layouts', 'content', 'static/js', 'data', 'config', 'assets']) walk(join(root, d));
for (const u of used) assert.ok(have.has(u), `${u} is used but missing from the Academicons subset`);
console.log('academicons subset ok:', [...used].join(', '));
