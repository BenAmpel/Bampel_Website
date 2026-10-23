// The security headers production sends for a page, read from netlify.toml's [[headers]] blocks, so the lab's local
// server (server.mjs) sends the same Content-Security-Policy, Permissions-Policy, X-Robots-Tag and so on and the two
// cannot drift. Only what netlify.toml uses is read: [[headers]] with for = "..." and a [headers.values] table of
// one-line "Name = "value"" pairs. A "*" in a path matches anything (including nothing), as on Netlify.
//
// Combining rules, as Netlify does (checked on bampel.com; see the note in netlify.toml): every matching block applies,
// in file order, and a later block's value for a header replaces an earlier one's. The Wowchemy plugin's _headers adds
// HSTS, nosniff and Referrer-Policy for every page before these; PLUGIN_BASE stands in for the two that matter locally
// (HSTS means nothing on http://localhost).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const NETLIFY_TOML = fileURLToPath(new URL('../../netlify.toml', import.meta.url));
export const PLUGIN_BASE = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };

// [{ for, values: { Name: value } }] in file order.
export function parseHeaderRules(text) {
  const rules = []; let cur = null, inValues = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      if (line === '[[headers]]') { cur = { for: null, values: {} }; rules.push(cur); inValues = false; }
      else if (line === '[headers.values]' && cur) inValues = true;
      else { cur = null; inValues = false; }
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^([A-Za-z0-9-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/);
    if (!m) continue;
    const value = m[2].replace(/\\(["\\])/g, '$1');
    if (inValues) cur.values[m[1]] = value; else if (m[1] === 'for') cur.for = value;
  }
  return rules.filter(r => r.for);
}

const toRe = pattern => new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');

// Headers for one request path (the address as asked for, before any rewrite, as on Netlify).
export function headersFor(rules, path, base = PLUGIN_BASE) {
  const out = { ...base };
  for (const r of rules) {
    if (!(r.re || (r.re = toRe(r.for))).test(path)) continue;
    for (const [k, v] of Object.entries(r.values)) {
      for (const have of Object.keys(out)) if (have.toLowerCase() === k.toLowerCase()) delete out[have];
      out[k] = v;
    }
  }
  return out;
}

let cached;
export function productionRules(file = NETLIFY_TOML) {
  if (!cached) { try { cached = parseHeaderRules(readFileSync(file, 'utf8')); } catch { cached = []; } }
  return cached;
}
