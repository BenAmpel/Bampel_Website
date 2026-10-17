#!/usr/bin/env node
/* Monthly refresh of the labor-market figures in static/ccair/data/pathways.json.
   Run by .github/workflows/pathways-refresh.yml, which opens a pull request when the file changes.

     node scripts/refresh-pathways-data.mjs [--dry-run] [--summary <file>] [--skip-links]

   Sources (each is skipped cleanly when unavailable):
     - CPS unemployment, monthly, not seasonally adjusted (the series behind Employment Situation table A-30).
       Series IDs are from https://download.bls.gov/pub/time.series/ln/ln.series:
         LNU04034021 Unemployment Rate - Computer and Mathematical Occupations
         LNU04034020 Unemployment Rate - Business and Financial Operations Occupations
         LNU04000000 Unemployment Rate (all workers, 16+)
     - OEWS national annual 10th, 25th and 50th percentile wages. Series ID layout and datatype codes are from
       https://download.bls.gov/pub/time.series/oe/ (oe.txt, oe.datatype):
         OEU N 0000000 000000 <SOC> <datatype>, datatype 11 = annual 10th pct, 12 = 25th, 13 = median.
     - CyberSeek career pathway CSV, found by reading the scripts that https://www.cyberseek.org/pathway.html loads.
     - USAJOBS open cybersecurity postings (a candidate stat; recorded in the summary only).
   BLS API: v2 with BLS_API_KEY if set, else v2 unregistered (25 queries a day). If the API refuses, CPS falls back to
   the data.bls.gov series page and OEWS falls back to the O*NET wage page the guide already cites.
   ISC2, SANS and Robert Half publish yearly reports with no API; they stay manual.

   Exit codes: 0 done (with or without changes), 2 a sanity check failed and nothing was written. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'static/ccair/data/pathways.json');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_LINKS = args.includes('--skip-links');
const SUMMARY = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null;
const UA = `bampel.com CCAIR pathways data refresh (${process.env.USAJOBS_EMAIL || 'https://bampel.com/ccair/'})`;
const WAGE_LIMIT = 0.15;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));

const SOC = { isa: '151212', ncsa: '151244', sd: '151252', cna: '151241', aa: '132011', co: '131041', tds: '131151' };
const CPS = { cm: 'LNU04034021', bf: 'LNU04034020', all: 'LNU04000000' };
const CPS_GROUP = { cm: 'computer and mathematical occupations', bf: 'business and financial operations occupations' };
/* Which CyberSeek pathway row (CSV "id") feeds which stat. id = the stat's headline posting count; notes = numbers
   inside the note text, matched by the regex's single capture group. */
const CYBERSEEK_MAP = {
  'soc-analyst': { id: 'm1', notes: [[/Average advertised salary \$([\d,]+)/, 'm1', 'average_salary'], [/counts ([\d,]+) postings for its entry-level/, 'e1', 'job_openings']] },
  'incident-responder': { id: 'e3', notes: [[/Average advertised salary \$([\d,]+)/, 'e3', 'average_salary']] },
  'digital-forensics-investigator': { id: 'e2', notes: [[/Average advertised salary \$([\d,]+)/, 'e2', 'average_salary']] },
  'threat-intelligence-analyst': { id: 'e2', notes: [[/Average advertised salary \$([\d,]+)/, 'e2', 'average_salary']] },
  'penetration-tester': { id: 'm3', notes: [[/Average advertised salary \$([\d,]+)/, 'm3', 'average_salary']] },
  'application-security-engineer': { id: 'h2', notes: [[/Average advertised salary \$([\d,]+)/, 'h2', 'average_salary']] },
  'cloud-security-engineer': { id: 'h2', notes: [[/Average advertised salary \$([\d,]+)/, 'h2', 'average_salary']] },
  'systems-security-administrator': { id: 'f1', notes: [[/IT support adds ([\d,]+) more/, 'f6', 'job_openings']] },
};

const log = [];          // markdown sections for the summary
const flags = [];        // things Ben should look at before merging
const failures = [];     // sanity failures: nothing is written
const changedRefs = new Set();
const changes = [];      // { where, from, to }
const sourceStatus = []; // [source, status]

const today = new Date();
const accessed = `${MON[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const num = (s) => Number(String(s).replace(/[$,%\s]/g, ''));
const r1 = (x) => (Math.round(x * 10 + 1e-9) / 10).toFixed(1); // one decimal, without 2.95 -> 2.9 float surprises
const pct = (a, b) => (b === 0 ? 0 : (a - b) / b);
const ym = (k) => ({ year: Math.floor((k - 1) / 12), month: ((k - 1) % 12) + 1 }); // month index k = year * 12 + month

async function get(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeout || 30000);
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: ctl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

function setField(obj, field, value, where, ref) {
  if (obj[field] === value) return;
  changes.push({ where, from: obj[field], to: value });
  obj[field] = value;
  if (ref) changedRefs.add(ref);
}

function setAccessed(ref) {
  const r = D.refs[ref];
  if (!r) return;
  const re = /accessed [A-Z][a-z]{2} \d{1,2}, \d{4}/;
  r.period = re.test(r.period || '') ? r.period.replace(re, `accessed ${accessed}`) : `${r.period ? `${r.period}; ` : ''}accessed ${accessed}`;
}

/* ---------- BLS API ---------- */
let blsRefused = false;
async function blsSeries(ids, startyear, endyear) {
  if (blsRefused) return null;
  const body = { seriesid: ids, startyear: String(startyear), endyear: String(endyear) };
  if (process.env.BLS_API_KEY) body.registrationkey = process.env.BLS_API_KEY;
  try {
    const res = await get('https://api.bls.gov/publicAPI/v2/timeseries/data/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json();
    if (j.status !== 'REQUEST_SUCCEEDED') {
      blsRefused = true;
      sourceStatus.push(['BLS API', `refused: ${(j.message || []).join(' ').slice(0, 200)}`]);
      return null;
    }
    const out = {};
    for (const s of j.Results.series) {
      out[s.seriesID] = s.data
        .filter((d) => /^M(0[1-9]|1[0-2])$|^A01$/.test(d.period))
        .map((d) => ({ year: Number(d.year), month: d.period === 'A01' ? 0 : Number(d.period.slice(1)), value: Number(d.value) }))
        .filter((d) => Number.isFinite(d.value)); // a month that was not collected comes back as "-"
    }
    return out;
  } catch (e) {
    blsRefused = true;
    sourceStatus.push(['BLS API', `error: ${e.message}`]);
    return null;
  }
}

/* Fallback for CPS: the data.bls.gov series page renders a Year x Jan..Dec table. A missing month shows as "-(9)". */
async function blsSeriesPage(id) {
  const res = await get(`https://data.bls.gov/timeseries/${id}?output_view=data&include_graphs=false`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const table = (await res.text()).match(/<TABLE id="table0"[\s\S]*?<\/TABLE>/i);
  if (!table) throw new Error('no data table on the page');
  const rows = [];
  for (const tr of table[0].matchAll(/<TR[^>]*>\s*<TH scope="row">(\d{4})<\/TH>([\s\S]*?)<\/TR>/gi)) {
    const cells = [...tr[2].matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gi)].map((c) => c[1].replace(/&nbsp;/g, '').trim());
    cells.slice(0, 12).forEach((c, i) => {
      const v = Number(c.replace(/\(.*?\)/g, ''));
      if (c && Number.isFinite(v)) rows.push({ year: Number(tr[1]), month: i + 1, value: v });
    });
  }
  return rows;
}

/* ---------- 1. CPS unemployment ---------- */
async function refreshUnemployment() {
  const y = today.getFullYear();
  let data = await blsSeries(Object.values(CPS), y - 2, y);
  let via = 'BLS API';
  if (!data) {
    via = 'data.bls.gov series pages (API unavailable)';
    data = {};
    for (const id of Object.values(CPS)) {
      try { data[id] = await blsSeriesPage(id); } catch (e) { sourceStatus.push(['CPS unemployment', `skipped: ${id} ${e.message}`]); return; }
    }
  }
  const key = (d) => d.year * 12 + d.month;
  const monthly = (id) => (data[id] || []).filter((d) => d.month > 0).sort((a, b) => key(b) - key(a));
  if (Object.values(CPS).some((id) => !monthly(id).length)) { sourceStatus.push(['CPS unemployment', 'skipped: a series came back empty']); return; }
  // 12-month window ending at the latest month all three series have
  const endK = Math.min(...Object.values(CPS).map((id) => key(monthly(id)[0])));
  const inWindow = (id) => monthly(id).filter((d) => key(d) <= endK && key(d) > endK - 12);
  const missing = [];
  for (let k = endK - 11; k <= endK; k++) {
    const { year, month } = ym(k);
    if (!inWindow(CPS.cm).some((d) => d.year === year && d.month === month)) missing.push(`${MONTHS[month - 1]} ${year}`);
  }
  const avg = (id) => { const w = inWindow(id); return w.reduce((s, d) => s + d.value, 0) / w.length; };
  const rate = { cm: avg(CPS.cm), bf: avg(CPS.bf), all: avg(CPS.all) };
  const start = ym(endK - 11), end = ym(endK);
  const span = `${MON[start.month - 1]} ${start.year} to ${MON[end.month - 1]} ${end.year}`;
  const n = inWindow(CPS.cm).length;
  sourceStatus.push(['CPS unemployment', `ok via ${via}; ${span}, ${n} months`]);
  log.push('### Unemployment (CPS, not seasonally adjusted)\n',
    `Window ${span}, ${n} months with data${missing.length ? ` (not collected: ${missing.join(', ')})` : ''}.\n`,
    '| Group | Series | Average |\n|---|---|---|',
    `| Computer and mathematical | ${CPS.cm} | ${rate.cm.toFixed(2)}% |`,
    `| Business and financial operations | ${CPS.bf} | ${rate.bf.toFixed(2)}% |`,
    `| All workers | ${CPS.all} | ${rate.all.toFixed(2)}% |\n`);

  const endStr = `${end.year}-${String(end.month).padStart(2, '0')}`;
  const rec = D.dataRefresh.cpsWindowEnd;
  if (rec && endStr < rec) { failures.push(`CPS window end ${endStr} is earlier than the recorded ${rec}`); return; }
  if (n < 9) flags.push(`CPS window has only ${n} months of data; check before merging`);

  for (const r of D.roles) {
    for (const s of r.numbers?.stats || []) {
      if (!(s.refs || []).includes('bls-cps25')) continue;
      const group = Object.keys(CPS_GROUP).find((g) => s.note.includes(CPS_GROUP[g]));
      if (!group) { failures.push(`${r.slug}: unemployment note names no known occupation group`); continue; }
      const move = num(s.value) ? rate[group] - num(s.value) : 0;
      if (Math.abs(move) >= 1) flags.push(`${r.slug}: unemployment moves ${move.toFixed(1)} points (${s.value} to ${r1(rate[group])}%)`);
      setField(s, 'value', `${r1(rate[group])}%`, `${r.slug} › ${s.label} › value`, 'bls-cps25');
      const note = s.note
        .replace(/^.*? for all (computer and mathematical|business and financial operations) occupations/, `Average, ${span}, for all $1 occupations`)
        .replace(/\(all US workers: [\d.]+%\)/, `(all US workers: ${r1(rate.all)}%)`);
      setField(s, 'note', note, `${r.slug} › ${s.label} › note`, 'bls-cps25');
    }
  }
  if (changedRefs.has('bls-cps25')) {
    const ref = D.refs['bls-cps25'];
    setField(ref, 'title', 'Table A-30: Unemployed persons by occupation and sex, not seasonally adjusted', 'refs.bls-cps25.title');
    setField(ref, 'url', 'https://www.bls.gov/web/empsit/cpseea30.htm', 'refs.bls-cps25.url');
    setField(ref, 'period', `average of monthly rates, ${span}${missing.length ? ` (${n} months; ${missing.join(', ')} not collected)` : ''}; series ${Object.values(CPS).join(', ')}; accessed ${accessed}`, 'refs.bls-cps25.period');
    D.dataRefresh.cpsWindowEnd = endStr;
  }
}

/* ---------- 2. OEWS wages ---------- */
async function onetWages(soc) {
  const code = `${soc.slice(0, 2)}-${soc.slice(2)}.00`;
  const res = await get(`https://www.onetonline.org/link/localwages/${code}`);
  if (!res.ok) throw new Error(`O*NET ${code}: HTTP ${res.status}`);
  const text = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const year = Number((text.match(/Bureau of Labor Statistics (\d{4}) wage data/) || [])[1]);
  const row = text.match(/Annual High \(90%\) United States \$([\d,]+) \$([\d,]+) \$([\d,]+)/);
  if (!year || !row) throw new Error(`O*NET ${code}: could not read the national annual wage row`);
  return { year, p10: num(row[1]), p25: num(row[2]), p50: num(row[3]) };
}

async function refreshWages() {
  const recYear = Number(D.sources.blsDate.match(/\d{4}/)[0]);
  const y = today.getFullYear();
  const sid = (soc, dt) => `OEUN0000000000000${soc}${dt}`;
  const api = await blsSeries(Object.values(SOC).flatMap((soc) => ['11', '12', '13'].map((dt) => sid(soc, dt))), y - 3, y);
  const wages = {};
  let via = 'BLS API';
  if (api) {
    for (const [k, soc] of Object.entries(SOC)) {
      const pick = (dt) => (api[sid(soc, dt)] || []).sort((a, b) => b.year - a.year)[0];
      const [a, b, c] = [pick('11'), pick('12'), pick('13')];
      if (!a || !b || !c || a.year !== c.year || b.year !== c.year) { sourceStatus.push(['OEWS wages', `no complete API data for ${soc}`]); continue; }
      wages[k] = { year: c.year, p10: a.value, p25: b.value, p50: c.value };
    }
  } else {
    via = 'O*NET wage pages (BLS API unavailable)';
    for (const [k, soc] of Object.entries(SOC)) {
      try { wages[k] = await onetWages(soc); } catch (e) { sourceStatus.push(['OEWS wages', e.message]); }
    }
  }
  if (!Object.keys(wages).length) { sourceStatus.push(['OEWS wages', 'skipped: no data']); return; }
  const newYear = Math.min(...Object.values(wages).map((w) => w.year));
  sourceStatus.push(['OEWS wages', `ok via ${via}; latest May ${newYear} (recorded ${D.sources.blsDate})`]);
  log.push('### Pay (OEWS national, annual)\n', `Latest: May ${newYear}. Recorded: ${D.sources.blsDate}.\n`,
    '| SOC | Occupation | 10th | 25th | Median | Median on the pages |\n|---|---|---|---|---|---|',
    ...Object.entries(wages).map(([k, w]) => `| ${SOC[k].slice(0, 2)}-${SOC[k].slice(2)} | ${D.bls[k]?.occupation || k} | ${money(w.p10)} | ${money(w.p25)} | ${money(w.p50)} | ${money(D.bls[k]?.median)} |`), '');

  if (newYear < recYear) { failures.push(`OEWS year ${newYear} is earlier than the recorded ${D.sources.blsDate}`); return; }
  const complete = Object.keys(wages).length === Object.keys(SOC).length;
  if (newYear === recYear) {
    // Same year: the pages should already match. A mismatch means a transcription error or a BLS revision.
    for (const [k, w] of Object.entries(wages)) {
      if (D.bls[k] && D.bls[k].median !== w.p50) flags.push(`${k}: page median ${money(D.bls[k].median)} differs from OEWS May ${newYear} ${money(w.p50)} (same year; not changed)`);
    }
    for (const r of D.roles) for (const s of r.numbers?.stats || []) {
      const ref = (s.refs || []).find((x) => x.startsWith('onet-'));
      const w = ref && wages[ref.slice(5)];
      if (w && s.value !== `${money(w.p10)} – ${money(w.p25)}`) flags.push(`${r.slug}: early-career band "${s.value}" differs from OEWS May ${newYear} (${money(w.p10)} – ${money(w.p25)}); not changed`);
    }
    return;
  }
  if (!complete) { failures.push(`OEWS May ${newYear} is out but not every occupation came back; not updating a partial set`); return; }

  // Newer year: update every wage figure and the "May YYYY" labels
  const label = `May ${newYear}`;
  for (const [k, w] of Object.entries(wages)) {
    const b = D.bls[k];
    const move = pct(w.p50, b.median);
    if (Math.abs(move) > WAGE_LIMIT) flags.push(`${k}: median moves ${(move * 100).toFixed(1)}% (${money(b.median)} to ${money(w.p50)}), over the ${WAGE_LIMIT * 100}% check`);
    setField(b, 'median', w.p50, `bls.${k}.median`, b.ref);
  }
  for (const r of D.roles) for (const s of r.numbers?.stats || []) {
    const onet = (s.refs || []).find((x) => x.startsWith('onet-'));
    const ooh = (s.refs || []).find((x) => x.startsWith('bls-ooh-'));
    if (onet && wages[onet.slice(5)]) {
      const w = wages[onet.slice(5)];
      const [o10, o25] = (s.value.match(/\$[\d,]+/g) || []).map(num);
      for (const [o, nw, nm] of [[o10, w.p10, '10th'], [o25, w.p25, '25th']]) {
        if (o && Math.abs(pct(nw, o)) > WAGE_LIMIT) flags.push(`${r.slug}: ${nm} percentile moves ${(pct(nw, o) * 100).toFixed(1)}% (${money(o)} to ${money(nw)}), over the ${WAGE_LIMIT * 100}% check`);
      }
      setField(s, 'value', `${money(w.p10)} – ${money(w.p25)}`, `${r.slug} › ${s.label} › value`, onet);
      setField(s, 'note', s.note.replace(/May \d{4}/g, label), `${r.slug} › ${s.label} › note`, onet);
    } else if (ooh && s.label === 'Median pay') {
      const k = Object.keys(D.bls).find((x) => D.bls[x].ref === ooh);
      if (!k) continue;
      setField(s, 'value', money(wages[k].p50), `${r.slug} › ${s.label} › value`, ooh);
      setField(s, 'note', s.note.replace(/May \d{4}/g, label), `${r.slug} › ${s.label} › note`, ooh);
    }
  }
  setField(D.sources, 'blsDate', label, 'sources.blsDate');
  for (const [id, r] of Object.entries(D.refs)) {
    if (id.startsWith('onet-')) { r.period = r.period.replace(/BLS \d{4} wage data/, `BLS ${newYear} wage data`); changedRefs.add(id); }
    if (id.startsWith('bls-ooh-')) { r.period = r.period.replace(/pay May \d{4}/, `pay ${label}`); changedRefs.add(id); }
  }
  flags.push(`OEWS moved to ${label}. Check that the OOH pages show the same medians, and update the OOH projections by hand if BLS has published new ones.`);
}

/* ---------- 3. CyberSeek ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

async function refreshCyberSeek() {
  const base = 'https://www.cyberseek.org/';
  let file;
  try {
    const html = await (await get(`${base}pathway.html`)).text();
    const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
    for (const src of [null, ...scripts]) {
      const text = src ? await (await get(new URL(src, base).href)).text() : html;
      const m = text.match(/data\/(career_pathway_(\d{4})_(\d{2})_(\d{2})\.csv)/);
      if (m) { file = { name: m[1], date: `${m[2]}-${m[3]}-${m[4]}`, url: new URL(`data/${m[1]}`, base).href }; break; }
    }
  } catch (e) { sourceStatus.push(['CyberSeek', `skipped: ${e.message}`]); return; }
  if (!file) { sourceStatus.push(['CyberSeek', 'skipped: no career_pathway_YYYY_MM_DD.csv reference found']); return; }
  const rec = D.dataRefresh.cyberseekFile || 'career_pathway_2025_05_20.csv';
  const recDate = rec.match(/(\d{4})_(\d{2})_(\d{2})/).slice(1).join('-');
  if (file.date < recDate) { failures.push(`CyberSeek file ${file.name} is older than the recorded ${rec}`); return; }
  const rows = parseCsv(await (await get(file.url)).text());
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const isNew = file.date > recDate;
  sourceStatus.push(['CyberSeek', `ok; ${file.name}, ${isNew ? `NEW (recorded ${rec})` : 'same as recorded'}, ${rows.length} roles`]);
  log.push(`### CyberSeek pathway (${file.name})\n`, isNew ? `Newer than the recorded ${rec}.\n` : 'Same file as recorded; the pages were checked against it.\n',
    '| Role | Figure | On the page | In the file |\n|---|---|---|---|');
  for (const [slug, map] of Object.entries(CYBERSEEK_MAP)) {
    const r = D.roles.find((x) => x.slug === slug);
    const s = r?.numbers?.stats?.find((x) => (x.refs || []).includes('cyberseek-pathway') && /^Job postings/.test(x.label));
    if (!s || !byId[map.id]) { flags.push(`CyberSeek: no posting stat or file row ${map.id} for ${slug}`); continue; }
    const row = byId[map.id];
    const oldV = num(s.value.match(/[\d,]+/)?.[0]), newV = num(row.job_openings);
    log.push(`| ${slug} | ${row.job_title} postings | ${oldV.toLocaleString('en-US')} | ${newV.toLocaleString('en-US')} |`);
    const value = oldV !== newV ? s.value.replace(/[\d,]+/, newV.toLocaleString('en-US')) : s.value;
    let note = s.note;
    for (const [re, id, field] of map.notes) {
      const m = note.match(re);
      const nv = Math.round(num(byId[id]?.[field])); // the file carries cents on salaries
      if (!m || !nv) { flags.push(`CyberSeek: could not match ${field} of ${id} in the ${slug} note`); continue; }
      log.push(`| ${slug} | ${byId[id].job_title} ${field.replace('_', ' ')} | ${m[1]} | ${nv.toLocaleString('en-US')} |`);
      if (num(m[1]) !== nv) note = note.replace(m[0], m[0].replace(m[1], nv.toLocaleString('en-US')));
    }
    if (isNew) {
      setField(s, 'value', value, `${slug} › ${s.label} › value`, 'cyberseek-pathway');
      setField(s, 'note', note, `${slug} › ${s.label} › note`, 'cyberseek-pathway');
    } else if (value !== s.value || note !== s.note) {
      flags.push(`CyberSeek: ${slug} figures differ from the same file ${file.name}; not changed`);
    }
  }
  log.push('');
  if (isNew) {
    const [yy, mm, dd] = file.date.split('-').map(Number);
    const ref = D.refs['cyberseek-pathway'];
    ref.period = ref.period.replace(/role data file dated [A-Z][a-z]+ \d{1,2}, \d{4}/, `role data file dated ${MONTHS[mm - 1]} ${dd}, ${yy}`);
    changedRefs.add('cyberseek-pathway');
    setField(D.dataRefresh, 'cyberseekFile', file.name, 'dataRefresh.cyberseekFile');
    flags.push(`CyberSeek published ${file.name}. Posting counts and salaries were updated; the state figures and AI share (cyberseek-2025, a press release) were not. Check cyberseek.org for a new release.`);
  }
}

/* ---------- 4. USAJOBS (candidate stat, summary only) ---------- */
async function usajobsCount() {
  const key = process.env.USAJOBS_API_KEY, email = process.env.USAJOBS_EMAIL;
  if (!key || !email) { sourceStatus.push(['USAJOBS', 'skipped: USAJOBS_API_KEY or USAJOBS_EMAIL not set']); return; }
  const queries = [['Keyword "cybersecurity"', 'Keyword=cybersecurity'], ['Series 2210 (IT Management) with keyword "cybersecurity"', 'JobCategoryCode=2210&Keyword=cybersecurity']];
  log.push('### USAJOBS (candidate stat, not on any page)\n', '| Query | Open postings |\n|---|---|');
  for (const [name, q] of queries) {
    try {
      const res = await get(`https://data.usajobs.gov/api/search?${q}&ResultsPerPage=1`, { headers: { Host: 'data.usajobs.gov', 'User-Agent': email, 'Authorization-Key': key } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      log.push(`| ${name} | ${Number(j.SearchResult.SearchResultCountAll).toLocaleString('en-US')} |`);
    } catch (e) { log.push(`| ${name} | error: ${e.message} |`); }
  }
  log.push(`\nCounted ${today.toISOString().slice(0, 10)}. Not added to any page; that needs Ben's OK.\n`);
  sourceStatus.push(['USAJOBS', 'ok']);
}

/* ---------- 5. Links ---------- */
async function checkLinks() {
  const urls = new Map();
  const add = (u, where) => { if (u) urls.set(u, [...(urls.get(u) || []), where]); };
  for (const [id, r] of Object.entries(D.refs)) add(r.url, `ref ${id}`);
  for (const r of D.roles) for (const x of r.resources || []) add(x.url, `${r.slug} resource "${x.name}"`);
  for (const [k, b] of Object.entries(D.bls)) add(b.url, `bls.${k}`);
  add(D.sources.nice, 'sources.nice');
  add(D.sources.cyberseek, 'sources.cyberseek');
  const bad = [], blocked = [];
  const list = [...urls.keys()];
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (u) => {
      let status;
      try {
        const res = await get(u, { timeout: 25000, headers: { Accept: 'text/html,application/xhtml+xml,*/*' } });
        status = res.status;
        await res.body?.cancel();
      } catch (e) { status = e.name === 'AbortError' ? 'timeout' : e.cause?.code || e.message; }
      if (typeof status === 'number' && status < 400) return;
      // bls.gov and bot-shielded sites answer automated requests with 403; that is not a broken page
      if (status === 403 || status === 429 || status === 'timeout') {
        if (!/(^|\.)bls\.gov$/.test(new URL(u).hostname)) blocked.push(`${u} (${status}): ${urls.get(u).join('; ')}`);
        return;
      }
      bad.push(`${u} (${status}): ${urls.get(u).join('; ')}`);
    }));
  }
  sourceStatus.push(['Links', `${list.length} checked, ${bad.length} broken, ${blocked.length} refused the checker`]);
  log.push('### Links\n', `${list.length} unique URLs checked.${bad.length ? '' : ' None broken.'}\n`);
  if (bad.length) { log.push('Broken:\n', ...bad.map((b) => `- ${b}`), ''); flags.push(`${bad.length} broken link(s); see Links`); }
  if (blocked.length) log.push('Refused the checker (403, 429 or timeout); open by hand if in doubt:\n', ...blocked.map((b) => `- ${b}`), '');
}

/* ---------- required fields ---------- */
function validate() {
  for (const k of ['updated', 'sources', 'bls', 'roles', 'refs']) if (!D[k]) failures.push(`missing top-level "${k}"`);
  if (!/^May \d{4}$/.test(D.sources?.blsDate || '')) failures.push('sources.blsDate is not "May YYYY"');
  for (const [k, b] of Object.entries(D.bls || {})) {
    if (!b.occupation || !Number.isFinite(b.median) || !b.url || !b.ref) failures.push(`bls.${k} is missing occupation, median, url or ref`);
  }
  for (const [id, r] of Object.entries(D.refs || {})) if (!r.publisher || !r.title || !r.url) failures.push(`ref ${id} is missing publisher, title or url`);
  for (const r of D.roles || []) {
    if (!r.slug || !r.name || !r.numbers) failures.push(`role ${r.slug || '?'} is missing slug, name or numbers`);
    for (const s of r.numbers?.stats || []) {
      if (!s.label || !s.value || !s.note || !s.refs?.length) failures.push(`${r.slug}: stat "${s.label}" is missing label, value, note or refs`);
      for (const id of s.refs || []) if (!D.refs?.[id]) failures.push(`${r.slug}: stat cites unknown ref ${id}`);
    }
  }
}

/* ---------- main ---------- */
const D = JSON.parse(fs.readFileSync(DATA, 'utf8'));
D.dataRefresh ||= {};
validate();
if (!failures.length) {
  for (const [name, fn] of [['CPS unemployment', refreshUnemployment], ['OEWS wages', refreshWages], ['CyberSeek', refreshCyberSeek], ['USAJOBS', usajobsCount]]) {
    try { await fn(); } catch (e) { sourceStatus.push([name, `error: ${e.message}`]); }
  }
  if (!SKIP_LINKS) await checkLinks();
  validate();
}
for (const id of changedRefs) setAccessed(id);
if (changes.length) D.updated = today.toISOString().slice(0, 10);

const esc = (v) => String(v).replace(/\|/g, '\\|');
const out = [
  `## Pathway Finder data refresh, ${today.toISOString().slice(0, 10)}${DRY ? ' (dry run)' : ''}\n`,
  failures.length ? `**A sanity check failed, so nothing was written.**\n\n${failures.map((f) => `- ${f}`).join('\n')}\n` : '',
  flags.length ? `### Needs a look\n\n${flags.map((f) => `- ${f}`).join('\n')}\n` : '',
  `### Sources\n\n| Source | Status |\n|---|---|\n${sourceStatus.map(([a, b]) => `| ${a} | ${esc(b)} |`).join('\n')}\n`,
  `### Changes to pathways.json (${changes.length})\n`,
  changes.length ? `| Where | From | To |\n|---|---|---|\n${changes.map((c) => `| ${c.where} | ${esc(c.from)} | ${esc(c.to)} |`).join('\n')}\n` : 'None.\n',
  changedRefs.size ? `New accessed date (${accessed}) on: ${[...changedRefs].join(', ')}.\n` : '',
].filter(Boolean).concat(log, [
  '### Not refreshed by this script\n\nISC2, SANS and Robert Half figures (yearly reports, no API), the BLS OOH 2025–35 projections and the CyberSeek press-release figures stay manual.\n',
]).join('\n');

if (SUMMARY) fs.writeFileSync(SUMMARY, out);
console.log(out);
if (failures.length) process.exit(2);
if (changes.length && !DRY) {
  fs.writeFileSync(DATA, `${JSON.stringify(D, null, 2)}\n`);
  console.error(`wrote ${path.relative(ROOT, DATA)} (${changes.length} changes)`);
} else if (changes.length) {
  console.error(`dry run: ${changes.length} changes not written`);
}
