// Freshness check for the CCAIR Student Guide. Run it by hand: `npm run guide:freshness` (not part of the Netlify
// build, because it makes network requests and its result changes from day to day).
//
// What it reports, as Markdown (to stdout, or to a file with --out report.md):
//   1. Pages whose verified date is older than --days (default 90): each page's `verified` date in students.json, or
//      the guide-wide `updated` date when a page has none, plus the outcomes page (outcomes.json `updated`).
//   2. Sources whose checked date is older than --days: each ref's `checked` date (YYYY-MM-DD) in students.json, or the
//      guide-wide `updated` date when a ref has none. With --datasets, also every dataset's `checked` date.
//   3. External links that fail: every ref URL and every http(s) link written into the guide copy (students.json).
//      Each URL gets a HEAD request, then a GET if HEAD fails or is refused. Requests go one at a time per host, with
//      a pause between them and a 15-second timeout, and identify themselves with a CCAIR user agent. 403 and 429
//      answers are listed separately as "blocked" (many sites refuse scripts; open those by hand). With --datasets the
//      246 dataset and paper links are checked too (slow). --no-links skips the network part.
//
// Quarterly process (January, April, July and October):
//   1. Run `npm run guide:freshness -- --out /tmp/guide-freshness.md` and read the report.
//   2. For each broken or stale source, open it, confirm or correct the fact on the guide page, and update the ref's
//      URL or title. Add "checked": "YYYY-MM-DD" to each ref you re-checked.
//   3. Change `verified` (for example "January 2027") and `updated` (YYYY-MM-DD) at the top of students.json once the
//      whole guide has been re-checked, or set a page's own `verified` date when only that page was.
//   4. Add one entry to `changes` in students.json for anything a student would notice (it feeds the hub's What changed
//      list and /ccair/students/feed.xml).
//   5. Run `npm run build:ccair`, then commit students.json and static/ccair/data/guide-lastmod.json together.
//      Pages whose content did not change keep their sitemap lastmod.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'static', 'ccair', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const DAYS = Number(opt('--days', 90));
const OUT = opt('--out', '');
const TIMEOUT = Number(opt('--timeout', 15000));
const GAP_MS = 700; // pause between two requests to the same host
const UA = 'CCAIR-guide-freshness/1.0 (+https://bampel.com/ccair/students/)';

const S = read('students.json');
const DS = read('datasets.json');
const OC = read('outcomes.json');
const today = new Date();
const ageDays = (d) => Math.floor((today - new Date(`${d}T12:00:00Z`)) / 86400000);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

/* ---------- Dates ---------- */
const pages = [...S.pages.map((p) => ({ name: p.nav, url: `/ccair/students/${p.slug ? p.slug + '/' : ''}`, date: isDate(p.verified) ? p.verified : S.updated })),
  { name: 'Where students go (outcomes)', url: '/ccair/students/outcomes/', date: OC.updated }];
const stalePages = pages.filter((p) => ageDays(p.date) > DAYS);
const refs = Object.entries(S.refs).map(([id, r]) => ({ id, ...r, date: isDate(r.checked) ? r.checked : S.updated }));
const staleRefs = refs.filter((r) => ageDays(r.date) > DAYS);
const staleDatasets = flag('--datasets') ? DS.datasets.filter((d) => !isDate(d.checked) || ageDays(d.checked) > DAYS) : [];

/* ---------- Links ---------- */
function copyLinks() {
  const found = new Map(); // url -> where
  const walk = (v, where) => {
    if (typeof v === 'string') { for (const m of v.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) found.set(m[1], where); if (/^https?:\/\/\S+$/.test(v)) found.set(v, where); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, where));
  };
  for (const p of S.pages) walk(p, `page ${p.nav}`);
  walk(S.outcomes, 'outcomes page');
  return found;
}
const targets = new Map();
for (const r of refs) targets.set(r.url, `ref ${r.id}`);
for (const [u, where] of copyLinks()) if (!targets.has(u)) targets.set(u, where);
if (flag('--datasets')) for (const d of DS.datasets) for (const k of ['link', 'paper']) if (d[k] && !targets.has(d[k])) targets.set(d[k], `dataset ${d.name} (${k})`);

async function probe(url) {
  const tryOnce = async (method) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/pdf,*/*;q=0.8' } });
      if (method === 'GET') res.body?.cancel().catch(() => {});
      return { status: res.status, final: res.url };
    } catch (e) { return { status: 0, error: e.name === 'AbortError' ? `timeout after ${TIMEOUT / 1000}s` : (e.cause?.code || e.message) }; }
    finally { clearTimeout(t); }
  };
  let r = await tryOnce('HEAD');
  if (r.status === 0 || r.status >= 400) r = await tryOnce('GET');
  return r;
}

async function checkLinks() {
  const byHost = new Map();
  for (const [u, where] of targets) { let h; try { h = new URL(u).host; } catch { h = 'invalid'; } if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push([u, where]); }
  const results = [];
  const hosts = [...byHost.values()];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Up to 6 hosts at a time; one request at a time within a host.
  let next = 0;
  async function worker() {
    while (next < hosts.length) {
      const list = hosts[next++];
      for (const [u, where] of list) { results.push({ url: u, where, ...(await probe(u)) }); await sleep(GAP_MS); }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return results;
}

/* ---------- Report ---------- */
const links = flag('--no-links') ? null : await checkLinks();
const broken = links ? links.filter((r) => r.status === 0 || (r.status >= 400 && r.status !== 403 && r.status !== 429)) : [];
const blocked = links ? links.filter((r) => r.status === 403 || r.status === 429) : [];
const moved = links ? links.filter((r) => r.status && r.status < 400 && r.final && r.final.replace(/\/$/, '') !== r.url.replace(/\/$/, '')) : [];
const cell = (s) => String(s).replace(/\|/g, '\\|');
const lines = [
  `# CCAIR Student Guide freshness report`,
  '',
  `Run ${today.toISOString().slice(0, 10)}. Threshold: ${DAYS} days. Guide verified "${S.verified}", updated ${S.updated}.`,
  '',
  `## Summary`,
  '',
  `- Pages older than ${DAYS} days: ${stalePages.length} of ${pages.length}`,
  `- Sources older than ${DAYS} days: ${staleRefs.length} of ${refs.length}`,
  ...(flag('--datasets') ? [`- Datasets with a link check older than ${DAYS} days: ${staleDatasets.length} of ${DS.datasets.length}`] : []),
  links ? `- Links checked: ${links.length}. Broken: ${broken.length}. Blocked to scripts (check by hand): ${blocked.length}. Redirected: ${moved.length}.` : '- Links: not checked (--no-links)',
  '',
  `## Pages older than ${DAYS} days`,
  '',
  ...(stalePages.length ? ['| Page | Verified | Age (days) |', '|---|---|---|', ...stalePages.map((p) => `| [${cell(p.name)}](https://bampel.com${p.url}) | ${p.date} | ${ageDays(p.date)} |`)] : ['None.']),
  '',
  `## Sources older than ${DAYS} days`,
  '',
  ...(staleRefs.length ? ['| Ref | Source | Checked | Age (days) |', '|---|---|---|---|', ...staleRefs.map((r) => `| ${r.id} | [${cell(r.publisher)}: ${cell(r.title)}](${r.url}) | ${r.date} | ${ageDays(r.date)} |`)] : ['None.']),
  ...(flag('--datasets') ? ['', `## Datasets whose link check is older than ${DAYS} days`, '', ...(staleDatasets.length ? ['| Dataset | Checked |', '|---|---|', ...staleDatasets.map((d) => `| [${cell(d.name)}](${d.link}) | ${d.checked || 'never'} |`)] : ['None.'])] : []),
  ...(links ? [
    '', '## Broken links', '',
    ...(broken.length ? ['| URL | Used in | Result |', '|---|---|---|', ...broken.map((r) => `| ${r.url} | ${cell(r.where)} | ${r.status || cell(r.error)} |`)] : ['None.']),
    '', '## Blocked to scripts (open by hand)', '',
    ...(blocked.length ? ['| URL | Used in | Status |', '|---|---|---|', ...blocked.map((r) => `| ${r.url} | ${cell(r.where)} | ${r.status} |`)] : ['None.']),
    '', '## Redirected (update the URL if the move is permanent)', '',
    ...(moved.length ? ['| URL | Now at | Used in |', '|---|---|---|', ...moved.map((r) => `| ${r.url} | ${r.final} | ${cell(r.where)} |`)] : ['None.'])
  ] : []),
  ''
];
const report = lines.join('\n');
if (OUT) { fs.writeFileSync(OUT, report); console.log(`Wrote ${OUT}`); } else process.stdout.write(report);
