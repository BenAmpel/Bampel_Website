// Font Awesome files under /webfonts/ get a 7-day cache, not immutable (same filenames across upgrades), and no other
// matching block in netlify.toml sets a conflicting Cache-Control. Reads the real netlify.toml like Netlify does.
import assert from 'node:assert/strict';
import { parseHeaderRules, headersFor, productionRules } from '../scripts/lab/headers.mjs';

const prod = productionRules();
const want = 'public, max-age=604800, stale-while-revalidate=86400';
for (const f of ['fa-solid-900.woff2', 'fa-brands-400.woff2', 'fa-regular-400.woff2', 'fa-v4compatibility.woff2', 'fa-solid-900.ttf']) {
  const path = '/webfonts/' + f;
  assert.equal(headersFor(prod, path)['Cache-Control'], want, path);
  const setters = prod.filter(r => headersFor([r], path)['Cache-Control'] !== undefined);
  assert.deepEqual(setters.map(r => r.for), ['/webfonts/*'], `${path}: only one block sets Cache-Control`);
}
assert.equal(headersFor(prod, '/webfonts/fa-solid-900.woff2')['X-Frame-Options'], 'DENY', '/* headers still apply');
assert.equal(headersFor(prod, '/other/fa-solid-900.woff2')['Cache-Control'], undefined, 'rule is scoped to /webfonts/');
console.log('webfonts cache rule ok');
