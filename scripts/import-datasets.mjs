// Converts a CSV export of the cybersecurity dataset list into static/ccair/data/datasets.json for the Student Guide
// data page (/ccair/students/data/).
//
// How to update the catalog:
//   1. In the SharePoint list, choose Export > Export to CSV (all items, all columns in the view).
//   2. node scripts/import-datasets.mjs path/to/export.csv            (writes static/ccair/data/datasets.json)
//      node scripts/import-datasets.mjs path/to/export.csv --dry-run  (checks the file and prints a summary only)
//   3. npm run build:ccair, open /ccair/students/data/ locally, then commit datasets.json.
//
// Expected columns (header names are matched without regard to case, spaces or punctuation; extra columns are ignored):
//   Name (or Title) | Category | Subcategory | Description | Access | Link | Data type | Size | Time span | License |
//   Paper | Caveats | Link-checked date (or Link checked / Checked)
// Output schema (see scripts/build-students.mjs): { updated, datasets: [ { name, category, subcategory, description,
//   access, link, dataType, size, timeSpan, license, paper, caveats, checked } ] }
// Rows without a name are skipped. Rows missing a category, description or link, or with a link or paper that is not an
// http(s) URL, stop the import with a list of problems. Rows without caveats are imported with a warning: every public
// entry should name a known weakness. SharePoint hyperlink cells ("https://..., Display text") keep only the URL, and
// US dates (9/27/2026) become ISO dates (2026-09-27). Nothing is fetched or sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'static', 'ccair', 'data', 'datasets.json');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('Usage: node scripts/import-datasets.mjs <export.csv> [--dry-run]'); process.exit(2); }

// RFC 4180 CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, UTF-8 BOM.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const key = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMNS = {
  name: ['name', 'title', 'datasetname', 'dataset'],
  category: ['category'],
  subcategory: ['subcategory'],
  description: ['description'],
  access: ['access'],
  link: ['link', 'url', 'datasetlink'],
  dataType: ['datatype', 'type'],
  size: ['size'],
  timeSpan: ['timespan', 'timeperiod', 'period'],
  license: ['license', 'licence'],
  paper: ['paper', 'paperlink', 'citation'],
  caveats: ['caveats', 'caveat', 'knownweaknesses', 'weaknesses'],
  checked: ['linkcheckeddate', 'linkchecked', 'checked', 'lastchecked', 'datechecked']
};

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const url = (v) => { const s = clean(v); const m = s.match(/^(https?:\/\/[^\s,]+)/); return m ? m[1] : s; };
function isoDate(v) {
  const s = clean(v); if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return s;
}

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
if (rows.length < 2) { console.error('The CSV has no data rows.'); process.exit(1); }
const header = rows[0].map(key);
const idx = {};
for (const [field, names] of Object.entries(COLUMNS)) idx[field] = header.findIndex((h) => names.includes(h));
const missingCols = ['name', 'category', 'description', 'link', 'caveats'].filter((f) => idx[f] < 0);
if (missingCols.length) { console.error(`Missing column(s): ${missingCols.join(', ')}. Found: ${rows[0].join(' | ')}`); process.exit(1); }

const problems = [], warnings = [], datasets = [], seen = new Set();
rows.slice(1).forEach((r, i) => {
  const get = (f) => (idx[f] >= 0 ? r[idx[f]] : '');
  const d = {
    name: clean(get('name')), category: clean(get('category')), subcategory: clean(get('subcategory')),
    description: clean(get('description')), access: clean(get('access')), link: url(get('link')),
    dataType: clean(get('dataType')), size: clean(get('size')), timeSpan: clean(get('timeSpan')),
    license: clean(get('license')), paper: url(get('paper')), caveats: clean(get('caveats')), checked: isoDate(get('checked'))
  };
  const line = i + 2;
  if (!d.name) return;
  for (const f of ['category', 'description', 'link']) if (!d[f]) problems.push(`line ${line} (${d.name}): no ${f}`);
  for (const f of ['link', 'paper']) if (d[f] && !/^https?:\/\//.test(d[f])) problems.push(`line ${line} (${d.name}): ${f} is not an http(s) URL: ${d[f]}`);
  if (!d.caveats) warnings.push(`line ${line} (${d.name}): no caveats`);
  if (seen.has(d.name.toLowerCase())) warnings.push(`line ${line} (${d.name}): duplicate name`);
  seen.add(d.name.toLowerCase());
  datasets.push(d);
});

warnings.forEach((w) => console.warn('warning: ' + w));
if (problems.length) { problems.forEach((p) => console.error('error: ' + p)); console.error(`${problems.length} problem(s); nothing written.`); process.exit(1); }
datasets.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
const cats = [...new Set(datasets.map((d) => d.category))];
const today = new Date().toISOString().slice(0, 10);
console.log(`${datasets.length} datasets in ${cats.length} categories${dry ? ' (dry run, nothing written)' : ''}.`);
if (!dry) {
  fs.writeFileSync(OUT, JSON.stringify({ updated: today, datasets }, null, 2) + '\n');
  console.log(`Wrote ${path.relative(root, OUT)}. Run npm run build:ccair to rebuild the data page.`);
}
