// Builds the CCAIR Student Guide as plain, indexable HTML (same approach as the Pathway Finder).
// Input:  static/ccair/data/students.json  (page copy, sources, change log, Ask CCAIR settings, outcomes page copy)
//         static/ccair/data/datasets.json  (dataset catalog for /ccair/students/data/; refresh it with scripts/import-datasets.mjs)
//         static/ccair/data/pathways.json  (role names and the role comparison table)
//         static/ccair/data/outcomes.json  (aggregate student outcomes for /ccair/students/outcomes/; empty until data arrives)
// Output: static/ccair/students/ (the guide pages, the outcomes page, two printable one-pagers under print/, the Atom feed
//         feed.xml, and the catalog downloads data/ccair-cyber-datasets.csv and .json), static/ccair/sitemap.xml.
//         Committed and updated here: static/ccair/data/guide-lastmod.json (content hash and lastmod per page) and
//         static/ccair/assets/students/og/ (one 1200 x 630 sharing image per page, plus manifest.json).
// Run by `npm run build:ccair` after build-pathways.mjs (netlify.toml runs it before Hugo copies static/ into public/).
//
// Copy markup in students.json: [text](url) link, **text** bold lead-in, {{refId}} numbered citation to refs.refId,
// [[role:slug]] link to a Pathway Finder role guide, [[count:datasets]] the number of datasets. Every citation renders
// as [n] and the page's Sources list is numbered in order of first use. An unknown refId or role slug stops the build,
// and so does a link to a guide anchor that does not exist.
//
// Sections: { h, id, toc, answer, blocks }. h is the heading (usually the question a student would search), answer is
// the one- or two-sentence reply shown under it, toc is the short label for "On this page", and id is the anchor. Keep
// an id unchanged once published, because other pages and outside sites link to it. When a heading is reworded, its id
// stays the old one.
//
// Sitemap lastmod: each page's <main> is hashed. guide-lastmod.json keeps the hash and the date it last changed, so
// lastmod (and dateModified) move only when a page's content really changes. Commit guide-lastmod.json after a build
// that changes it; the build prints a reminder. A build that cannot write it (or a Netlify build of an uncommitted
// change) uses the build date for the changed page, which is still the date the change went live.
//
// Sharing images: each page gets an SVG card (title in the CCAIR palette). When the card changes and Google Chrome is
// available (a local build; set CHROME_PATH to point at it), the build renders it to PNG with headless Chrome and
// records its hash in og/manifest.json. Netlify builds have no Chrome, so they use the committed PNGs, and any page
// whose PNG is missing or out of date falls back to the site sharing card with a warning.
//
// datasets.json schema: { updated: 'YYYY-MM-DD', datasets: [ { name, category, subcategory, description, access, link,
// dataType, size, timeSpan, license, paper, caveats, checked } ] }. All values are plain text (no markup); link and paper
// are http(s) URLs; checked is the date the link was last checked (YYYY-MM-DD). Empty strings render as "Not stated".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { CCAIR, ROOT, SITE, esc, ld, person, org, head as baseHead, top as baseTop, foot as baseFoot, writeSitemap, readJson,
  HIRING, CODE_SHORT, SHARE_IMAGE, LASTMOD_STORE, photoHtml, fmtDate, NEW_TAB, assertNoInternalNotes } from './ccair-static.mjs';

const S = readJson('students.json');
const DS = readJson('datasets.json');
const P = readJson('pathways.json');
// GUIDE_OUTCOMES points at another outcomes file (used to test the page with sample data; never set it on Netlify).
const OUT_FILE = process.env.GUIDE_OUTCOMES ? path.resolve(process.env.GUIDE_OUTCOMES) : path.join(CCAIR, 'data', 'outcomes.json');
const OC = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
const ROLE = Object.fromEntries(P.roles.map((r) => [r.slug, r]));
const out = path.join(CCAIR, 'students');
const OG_DIR = path.join(CCAIR, 'assets', 'students', 'og');
const BASE = `${SITE}/ccair/students/`;
const ASSET_V = S.updated.replace(/-/g, '');
const PUBLISHED = '2026-10-22'; // datePublished for a page without its own "published" date (YYYY-MM-DD) in students.json
const TODAY = new Date().toISOString().slice(0, 10);
const CATALOG_TARGET = 10; // below this many entries the data page says the full catalog is still being added
const CSV_PATH = '/ccair/students/data/ccair-cyber-datasets.csv';
const JSON_PATH = '/ccair/students/data/ccair-cyber-datasets.json';
const FEED_PATH = '/ccair/students/feed.xml';
const pageUrl = (p) => `/ccair/students/${p.slug ? p.slug + '/' : ''}`;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sectionId = (s) => s.id || slugify(s.h);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const OUTCOMES_LIVE = OC.rows.length > 0;
const OUTCOMES = { ...S.outcomes, sections: [] };

/* ---------- Copy markup ---------- */
function makeCiter() {
  const order = [];
  const cite = (id) => {
    if (!S.refs[id]) throw new Error(`Unknown reference id: ${id}`);
    let n = order.indexOf(id); if (n < 0) { order.push(id); n = order.length - 1; }
    return `<sup class="cite"><a href="#ref-${n + 1}" aria-label="Source ${n + 1}">[${n + 1}]</a></sup>`;
  };
  const list = () => order.length ? `<section id="sources" aria-labelledby="sources-h"><h2 id="sources-h">Sources</h2>
    <p class="body">We checked each source in ${esc(S.verified)}. Rules, prices and dates change, so confirm them on the source before you act.</p>
    <ol class="refs">${order.map((id, i) => { const x = S.refs[id];
      return `<li id="ref-${i + 1}"><span class="mono">[${i + 1}]</span> ${esc(x.publisher)}. <a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.title)}${NEW_TAB}</a>.</li>`; }).join('')}</ol></section>` : '';
  return { cite, list, order };
}

function md(text, cite) {
  let h = esc(text);
  h = h.replace(/\[\[count:datasets\]\]/g, String(DS.datasets.length));
  h = h.replace(/\[\[role:([a-z0-9-]+)\]\]/g, (_, slug) => {
    if (!ROLE[slug]) throw new Error(`Unknown role slug: ${slug}`);
    return `<a href="/ccair/pathways/${slug}/">${esc(ROLE[slug].name)}</a>`;
  });
  h = h.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id) => cite(id));
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u);
    return `<a href="${u}"${ext ? ' rel="noopener" target="_blank"' : ''}>${t}${ext ? NEW_TAB : ''}</a>`;
  });
  return h;
}

// Plain text for printables, the feed and sharing images: markup removed, citations dropped.
function plain(text) {
  return String(text)
    .replace(/\[\[count:datasets\]\]/g, String(DS.datasets.length))
    .replace(/\[\[role:([a-z0-9-]+)\]\]/g, (_, slug) => (ROLE[slug] ? ROLE[slug].name : slug))
    .replace(/\{\{[a-z0-9-]+\}\}/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1');
}

/* ---------- Blocks ---------- */
function cardsHtml() {
  const cards = S.pages.filter((p) => p.slug).map((p, i) => `<a class="card reveal" style="--d:${((i % 2) * 0.06).toFixed(2)}s" href="${pageUrl(p)}">
    <h3>${esc(p.nav)}</h3><p>${esc(p.summary)}</p><span class="go">Read &rarr;</span></a>`);
  cards.push(`<a class="card reveal${OUTCOMES_LIVE ? '' : ' soon'}" href="${pageUrl(OUTCOMES)}">
    ${OUTCOMES_LIVE ? '' : '<span class="badge emerging">Coming soon</span>'}<h3>${esc(OUTCOMES.nav)}</h3><p>${OUTCOMES_LIVE ? 'Internships and first jobs of CCAIR and CIS students, as group counts.' : 'Internships and first jobs of CCAIR and CIS students. The data is being collected.'}</p><span class="go">${OUTCOMES_LIVE ? 'Read' : 'What it will show'} &rarr;</span></a>`);
  return `<div class="guide-cards">${cards.join('')}</div>`;
}

function audiencesHtml(list, cite) {
  return `<div class="audiences">${list.map((a, i) => `<article class="aud reveal${a.wide ? ' wide' : ''}" style="--d:${((i % 2) * 0.06).toFixed(2)}s" id="for-${a.id}" aria-labelledby="for-${a.id}-h">
    <h3 id="for-${a.id}-h">${esc(a.h)}</h3>
    <p>${md(a.p, cite)}</p>
    ${a.ul ? `<ul class="list">${a.ul.map((x) => `<li>${md(x, cite)}</li>`).join('')}</ul>` : ''}
    <ul class="aud-links">${a.links.map(([t, u]) => `<li>${md(`[${t}](${u})`, cite)}</li>`).join('')}</ul>
  </article>`).join('')}</div>`;
}

function tableHtml(t, cite, cls = '') {
  return `<div class="table-wrap reveal" role="region" aria-label="${esc(t.caption)}" tabindex="0"><table${cls ? ` class="${cls}"` : ''}>
      <caption>${esc(t.caption)}</caption>
      <thead><tr>${t.head.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${md(c, cite)}</th>` : `<td>${md(c, cite)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

// The Pathway Finder roles compared. Every cell comes from pathways.json (no new numbers). A role with no starter
// certification shows its certsNote instead.
const roleRows = () => P.roles.map((r) => ({ r, cells: [HIRING[r.hiring], CODE_SHORT[r.code], r.certsStart.length ? r.certsStart.join(', ') : r.certsNote, r.feeder] }));
function roleTableHtml() {
  return `<div class="table-wrap reveal" role="region" aria-label="The ${P.roles.length} Pathway Finder roles compared" tabindex="0"><table class="wide">
      <caption>The ${P.roles.length} Pathway Finder roles compared (from each role guide)</caption>
      <thead><tr><th scope="col">Role</th><th scope="col">First job?</th><th scope="col">Coding</th><th scope="col">Starter certifications</th><th scope="col">Usual way in</th></tr></thead>
      <tbody>${roleRows().map(({ r, cells }) => `<tr><th scope="row"><a href="/ccair/pathways/${r.slug}/">${esc(r.name)}</a></th>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}

function blockHtml(b, cite, page) {
  if (b.p) return `<p class="body reveal">${md(b.p, cite)}</p>`;
  if (b.h3) return `<h3 class="sub-h reveal">${md(b.h3, cite)}</h3>`;
  if (b.ul) return `<ul class="list">${b.ul.map((x) => `<li class="reveal">${md(x, cite)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol class="list">${b.ol.map((x) => `<li class="reveal">${md(x, cite)}</li>`).join('')}</ol>`;
  if (b.note) return `<div class="note reveal">${md(b.note, cite)}</div>`;
  if (b.warn) return `<div class="warn reveal">${md(b.warn, cite)}</div>`;
  if (b.table) return tableHtml(b.table, cite, b.table.head.length > 3 ? 'wide' : '');
  if (b.cards) return cardsHtml();
  if (b.audiences) return audiencesHtml(b.audiences, cite);
  if (b.roleTable) return roleTableHtml();
  if (b.catalog) return catalogHtml();
  if (b.html) return b.html; // generated blocks only (outcomes page); never set in students.json
  throw new Error(`Unknown block in page "${page.slug}": ${JSON.stringify(b).slice(0, 80)}`);
}

/* ---------- Dataset catalog ---------- */
const orNot = (v) => (v && String(v).trim() ? esc(v) : '<span class="muted">Not stated</span>');
const CATALOG_NAME = 'CCAIR Cybersecurity Dataset Catalog';
const CITATION = `Center for CyberAI Research (CCAIR). (${DS.updated.slice(0, 4)}). ${CATALOG_NAME} (Version ${DS.updated}) [Data set]. Georgia State University. ${BASE}data/`;
const COLUMNS = [
  ['name', 'Dataset name'], ['category', 'CCAIR category'], ['subcategory', 'Narrower topic'], ['description', 'What the dataset contains'],
  ['access', 'How to get it (open download, request, registration)'], ['link', 'Dataset page (URL)'], ['dataType', 'Kind of data and file format'],
  ['size', 'Size as stated by the creators'], ['timeSpan', 'Period the data covers'], ['license', 'License as stated by the creators'],
  ['paper', 'Paper the creators ask you to cite (URL)'], ['caveats', 'Known weaknesses'], ['checked', 'Date CCAIR last checked the link (YYYY-MM-DD)']
];

function datasetHtml(d) {
  const id = `ds-${slugify(d.name)}`;
  return `<li class="ds reveal" data-cat="${esc(d.category)}">
  <article aria-labelledby="${id}">
    <h3 id="${id}">${esc(d.name)}</h3>
    <p class="ds-tags"><span class="badge entry">${esc(d.category)}</span>${d.subcategory ? `<span class="ds-sub">${esc(d.subcategory)}</span>` : ''}</p>
    <p class="ds-desc">${esc(d.description)}</p>
    <div class="ds-caveat"><p class="ds-caveat-h">Known weaknesses</p><p>${d.caveats ? esc(d.caveats) : 'None recorded yet. Treat that as a gap in this entry, not as a clean dataset.'}</p></div>
    <dl class="ds-facts">
      <div><dt>Access</dt><dd>${orNot(d.access)}</dd></div>
      <div><dt>License</dt><dd>${orNot(d.license)}</dd></div>
      <div><dt>Data type</dt><dd>${orNot(d.dataType)}</dd></div>
      <div><dt>Size</dt><dd>${orNot(d.size)}</dd></div>
      <div><dt>Time span</dt><dd>${orNot(d.timeSpan)}</dd></div>
      <div><dt>Link checked</dt><dd>${orNot(d.checked)}</dd></div>
    </dl>
    <p class="ds-links">${d.link ? `<a href="${esc(d.link)}" rel="noopener" target="_blank">Dataset page<span class="sr-only"> for ${esc(d.name)} (opens in a new tab)</span></a>` : ''}${d.paper ? `<a href="${esc(d.paper)}" rel="noopener" target="_blank">Paper to cite<span class="sr-only"> for ${esc(d.name)} (opens in a new tab)</span></a>` : ''}</p>
  </article>
</li>`;
}

const sortedDatasets = () => [...DS.datasets].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const kb = (text) => `${Math.max(1, Math.round(Buffer.byteLength(text, 'utf8') / 1000))} KB`;
function downloadHtml() {
  const rows = `${DS.datasets.length} rows`;
  return `<div class="download reveal" id="download" style="--d:.2s">
    <p class="download-h">Download the whole catalog</p>
    <p class="download-links"><a class="btn-dl" href="${CSV_PATH}" download>CSV<span class="sr-only"> file of the dataset catalog</span>, ${rows}, ${kb(DOWNLOADS.csv)}</a><a class="btn-dl" href="${JSON_PATH}" download>JSON<span class="sr-only"> file of the dataset catalog</span>, ${rows}, ${kb(DOWNLOADS.json)}</a></p>
    <p class="download-cite"><b>How to cite this catalog:</b> ${esc(CITATION)}</p>
    <p class="download-note">Version ${esc(DS.updated)}. Cite each dataset's own paper as well, and follow each dataset's own license.</p>
  </div>`;
}

function catalogHtml() {
  const list = sortedDatasets();
  const cats = [...new Set(list.map((d) => d.category))].sort();
  const n = list.length;
  const word = (k) => `${k} dataset${k === 1 ? '' : 's'}`;
  return `<p class="body reveal">${word(n)} in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}. Search by name, topic or data type, or filter by category.</p>
  ${n < CATALOG_TARGET ? `<div class="note reveal"><b>The catalog is growing.</b> This page lists ${word(n)} so far. The full catalog of cybersecurity datasets is being added.</div>` : ''}
  <form class="ds-controls" data-ds-controls hidden role="search" aria-label="Filter datasets">
    <div class="field"><label for="ds-q">Search datasets</label><input id="ds-q" type="search" autocomplete="off" spellcheck="false" placeholder="For example: phishing, PCAP, malware"></div>
    <div class="field"><label for="ds-cat">Category</label><select id="ds-cat"><option value="">All categories</option>${cats.map((c) => `<option value="${esc(c)}">${esc(c)} (${list.filter((d) => d.category === c).length})</option>`).join('')}</select></div>
  </form>
  <p class="ds-status" id="ds-status" role="status" aria-live="polite">Showing ${word(n)}.</p>
  <ul class="ds-list" id="ds-list" data-total="${n}">${list.map(datasetHtml).join('\n')}</ul>
  <p class="ds-empty body" id="ds-empty" hidden>No datasets match. Clear the search or choose another category.</p>
  <p class="body reveal">Descriptions and caveats come from the CCAIR dataset catalog. Each entry shows the date its link was last checked; confirm access and license terms on the dataset's own page before you use it.</p>`;
}

// schema.org Dataset for the catalog itself (Google Dataset Search: name and description are required).
// No license is stated: the catalog's own license is Ben's decision (bampel.com's footer uses CC BY-NC-ND 4.0).
function datasetLd() {
  const cats = [...new Set(DS.datasets.map((d) => d.category))].sort();
  const orgFull = { '@type': 'ResearchOrganization', '@id': org['@id'], name: org.name, url: org.url,
    parentOrganization: { '@type': 'CollegeOrUniversity', name: 'Georgia State University', url: 'https://www.gsu.edu/' } };
  return {
    '@type': 'Dataset', '@id': `${BASE}data/#dataset`, name: CATALOG_NAME, alternateName: 'CCAIR dataset catalog',
    description: `A catalog of ${DS.datasets.length} public cybersecurity datasets in ${cats.length} categories, compiled by the Center for CyberAI Research (CCAIR) at Georgia State University for student research. Each entry gives the dataset's access method, license, data type, size, time span, the paper its creators ask you to cite, the date CCAIR last checked its link, and at least one known weakness.`,
    url: `${BASE}data/`, version: DS.updated, datePublished: (S.pages.find((p) => p.slug === 'data') || {}).published || PUBLISHED, dateModified: DS.updated, inLanguage: 'en-US', isAccessibleForFree: true,
    creator: orgFull, publisher: orgFull, maintainer: { '@type': 'Person', '@id': person['@id'], name: person.name, url: person.url },
    keywords: ['cybersecurity datasets', 'security research data', 'machine learning for security', ...cats],
    creditText: CITATION,
    variableMeasured: COLUMNS.map(([name, description]) => ({ '@type': 'PropertyValue', name, description })),
    distribution: [
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}${CSV_PATH}`, name: `${CATALOG_NAME} (CSV)` },
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}${JSON_PATH}`, name: `${CATALOG_NAME} (JSON)` }
    ]
  };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// The CSV and JSON text, built once so the download buttons can state their sizes.
function downloadFiles() {
  const list = sortedDatasets();
  // UTF-8 with a byte order mark so spreadsheet apps read accented characters correctly; CRLF rows (RFC 4180).
  const csv = '﻿' + [COLUMNS.map(([k]) => k), ...list.map((d) => COLUMNS.map(([k]) => d[k]))].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const json = JSON.stringify({
    name: CATALOG_NAME, version: DS.updated, url: `${BASE}data/`, publisher: org.name, citation: CITATION,
    note: 'Each dataset keeps its own license and terms; check them on the dataset page before use.',
    fields: Object.fromEntries(COLUMNS), datasets: list.map((d) => Object.fromEntries(COLUMNS.map(([k]) => [k, d[k] ?? ''])))
  }, null, 2) + '\n';
  return { csv, json };
}
function writeDownloads() {
  const dir = path.join(out, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ccair-cyber-datasets.csv'), DOWNLOADS.csv);
  fs.writeFileSync(path.join(dir, 'ccair-cyber-datasets.json'), DOWNLOADS.json);
}

/* ---------- Outcomes ---------- */
const OC_KEYS = new Set(['year', 'program', 'level', 'kind', 'employerType', 'role', 'count', 'medianPay', 'employerName', 'employerConsent', 'source']);
const OC_ENUM = { level: ['undergraduate', 'masters', 'doctoral'], kind: ['internship', 'full-time'],
  employerType: ['Private sector', 'Government', 'Nonprofit', 'Higher education', 'Continuing education'] };
function checkOutcomes() {
  const { minCell, minPayN } = OC.rules;
  OC.rows.forEach((r, i) => {
    const where = `outcomes.json row ${i + 1}`;
    for (const k of Object.keys(r)) if (!OC_KEYS.has(k)) throw new Error(`${where}: field "${k}" is not allowed (rows hold group counts only, never details about one person)`);
    for (const k of ['year', 'program', 'level', 'kind', 'employerType', 'role', 'count', 'source']) if (r[k] === undefined || r[k] === '') throw new Error(`${where}: missing ${k}`);
    for (const [k, vals] of Object.entries(OC_ENUM)) if (!vals.includes(r[k])) throw new Error(`${where}: ${k} must be one of ${vals.join(', ')}`);
    if (!Number.isInteger(r.count) || r.count < 0) throw new Error(`${where}: count must be a whole number`);
    if (r.medianPay !== undefined && r.count < minPayN) throw new Error(`${where}: medianPay needs count >= ${minPayN}`);
    if (r.employerName && r.employerConsent !== true) throw new Error(`${where}: employerName needs employerConsent: true`);
  });
  if (!(minCell >= 5)) throw new Error('outcomes.json: rules.minCell must be at least 5');
}

// Sums counts by a key and applies small-cell suppression: groups under minCell are pooled into "Other (smaller groups)",
// which is itself shown only if it reaches minCell. No total is shown when anything was suppressed, so hidden cells
// cannot be worked out by subtraction.
function groupTable(rows, keyFn, label) {
  const { minCell } = OC.rules;
  const sums = new Map();
  for (const r of rows) { const k = keyFn(r); if (k) sums.set(k, (sums.get(k) || 0) + r.count); }
  const shown = [...sums].filter(([, n]) => n >= minCell).sort((a, b) => b[1] - a[1]);
  const small = [...sums].filter(([, n]) => n < minCell).reduce((a, [, n]) => a + n, 0);
  const rowsOut = shown.map(([k, n]) => [esc(k), String(n)]);
  if (small >= minCell) rowsOut.push(['Other (smaller groups)', String(small)]);
  const suppressed = small > 0;
  if (!suppressed && rowsOut.length) rowsOut.push(['<b>Total</b>', `<b>${shown.reduce((a, [, n]) => a + n, 0)}</b>`]);
  if (!rowsOut.length) return `<p class="body reveal">Every group is smaller than ${minCell} students, so nothing is shown yet.</p>`;
  return `<div class="table-wrap reveal" role="region" aria-label="${esc(label)}" tabindex="0"><table><caption>${esc(label)}</caption>
    <thead><tr><th scope="col">Group</th><th scope="col">Students</th></tr></thead>
    <tbody>${rowsOut.map(([a, b]) => `<tr><th scope="row">${a}</th><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
}

function outcomesSections() {
  const { minCell, minPayN } = OC.rules;
  const what = { h: 'What will this page show?', id: 'what', toc: 'What it will show',
    answer: '**Counts of students by year, program, kind of job, employer type and role.** Nothing here is an estimate, and no individual student appears.',
    blocks: [{ ul: [
      '**Internships and full-time jobs, by year.** How many students in each program reported each kind of job.',
      '**Employer types.** Private sector, government, nonprofit, higher education and continuing education.',
      '**Roles.** Job families, matched to [Pathway Finder](/ccair/pathways/) roles where possible.',
      `**Pay, only for large groups.** A median base salary appears only for groups of at least ${minPayN} students.`,
      '**Employer names, only with consent.** An employer is named only if it agreed. Otherwise it counts toward its employer type.'
    ] }] };
  const privacy = { h: 'How is student privacy protected?', id: 'privacy', toc: 'Privacy',
    answer: `**The page reports group counts only, and it hides any group smaller than ${minCell} students.** It never shows names or details about one person.`,
    blocks: [{ ul: [
      `**No individuals.** The data file holds group counts. The build rejects any field that could identify a student.`,
      `**Small groups hidden.** Any group under ${minCell} students is pooled into "Other (smaller groups)," which appears only if it reaches ${minCell} itself.`,
      '**No totals that give groups away.** A table shows no total when any group in it was hidden.',
      `**Pay only for groups of ${minPayN} or more.** Smaller groups show no pay figure at all.`
    ] }] };
  const source = { h: 'Where does the data come from?', id: 'source', toc: 'Data sources',
    answer: '**From Georgia State career office reports and from CCAIR\'s own students, as group totals.**',
    blocks: [{ p: 'Every count records its source and year. Want your outcome counted, or have a correction? Use the [contact page](/ccair/#/contact).' }] };
  if (!OUTCOMES_LIVE) {
    return [{ h: 'Is there data yet?', id: 'status', toc: 'Status',
      answer: '**Not yet. The data is being collected.** This page will show outcomes once enough students are counted to protect their privacy.',
      blocks: [{ p: 'Until then, the [Pathway Finder role guides](/ccair/pathways/#roles) show national pay and job data from the U.S. Bureau of Labor Statistics and CyberSeek.' }] }, what, privacy, source];
  }
  const R = OC.rows;
  const results = { h: 'Where did students go?', id: 'results', toc: 'Results',
    answer: `**Counts for ${[...new Set(R.map((r) => r.year))].sort().join(', ')}, by kind of job, employer type and role.** Groups under ${minCell} students are hidden.`,
    blocks: [
      { html: groupTable(R, (r) => `${r.year}, ${r.kind}`, 'Students by year and kind of job') },
      { html: groupTable(R, (r) => r.employerType, 'Students by employer type') },
      { html: groupTable(R, (r) => r.role, 'Students by role') },
      { html: groupTable(R.filter((r) => r.employerConsent === true && r.employerName), (r) => r.employerName, 'Employers that agreed to be named') },
      ...(R.some((r) => r.medianPay !== undefined) ? [{ html: tableHtml({ caption: `Median base pay (groups of ${minPayN} or more)`, head: ['Group', 'Students', 'Median base pay'],
        rows: R.filter((r) => r.medianPay !== undefined).map((r) => [`${r.year}, ${r.program}, ${r.role}, ${r.kind}`, String(r.count), '$' + r.medianPay.toLocaleString('en-US')]) }, () => '') }] : [])
    ] };
  return [results, what, privacy, source];
}

/* ---------- Sharing images ---------- */
const OG_VERSION = 'og-2-gsu';
// No logo on the cards: GSU does not allow a center to make its own (commkit.gsu.edu); the text names the center instead.
// Lato comes from the self-hosted files by a relative URL (the SVG sits in static/ccair/students/og/), so the SVG and its
// hash are the same on every machine.
function wrap(text, max) {
  const lines = []; let line = '';
  for (const w of text.split(/\s+/)) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}
function ogSvg(title, eyebrow, pathLabel) {
  let size = 66, lines = wrap(title, 28);
  if (lines.length > 3) { size = 54; lines = wrap(title, 34); }
  const lh = Math.round(size * 1.18), y0 = 296 - ((lines.length - 1) * lh) / 2;
  const F = "'Lato', 'Helvetica Neue', Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<style>
@font-face { font-family: 'Lato'; font-weight: 400; src: url('../../assets/fonts/lato-400.woff2') format('woff2'); }
@font-face { font-family: 'Lato'; font-weight: 700; src: url('../../assets/fonts/lato-700.woff2') format('woff2'); }
</style>
<rect width="1200" height="630" fill="#FFFFFF"/>
<rect x="0" y="0" width="1200" height="14" fill="#0039A6"/>
<rect x="0" y="470" width="1200" height="160" fill="#EEEEEE"/>
<text x="80" y="122" font-family="${F}" font-weight="700" font-size="24" letter-spacing="3" fill="#0039A6">${esc(eyebrow.toUpperCase())}</text>
${lines.map((l, i) => `<text x="80" y="${Math.round(y0 + i * lh + size * 0.35)}" font-family="${F}" font-weight="700" font-size="${size}" fill="#000000">${esc(l)}</text>`).join('\n')}
<text x="80" y="530" font-family="${F}" font-weight="700" font-size="28" fill="#000000">Center for CyberAI Research (CCAIR)</text>
<text x="80" y="568" font-family="${F}" font-weight="400" font-size="22" fill="#374057">Georgia State University · J. Mack Robinson College of Business</text>
<text x="1120" y="122" text-anchor="end" font-family="${F}" font-weight="400" font-size="20" fill="#5A5D66">${esc(pathLabel)}</text>
</svg>
`;
}

function findChrome() {
  if (process.env.NETLIFY === 'true' || process.env.GUIDE_OG === '0') return '';
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  return c.find((p) => fs.existsSync(p)) || '';
}

function ogImages(pages) {
  fs.mkdirSync(OG_DIR, { recursive: true });
  const mPath = path.join(OG_DIR, 'manifest.json');
  const manifest = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf8')) : { note: '', images: {} };
  manifest.note = 'Written by scripts/build-students.mjs. hash is the SHA-256 of the SVG card the PNG was rendered from; a page whose hash differs uses the site sharing card until the PNG is rendered again.';
  const chrome = findChrome();
  const svgDir = path.join(out, 'og');
  fs.mkdirSync(svgDir, { recursive: true });
  const images = {};
  let rendered = 0;
  for (const { key, title, eyebrow, url } of pages) {
    const svg = ogSvg(title, eyebrow, url.replace(SITE + '/', 'bampel.com/'));
    const hash = sha(OG_VERSION + svg);
    const svgFile = path.join(svgDir, `${key}.svg`), png = path.join(OG_DIR, `${key}.png`);
    fs.writeFileSync(svgFile, svg);
    const fresh = fs.existsSync(png) && manifest.images[key]?.hash === hash;
    if (!fresh && chrome) {
      const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${path.join(os.tmpdir(), 'ccair-og-chrome')}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--default-background-color=FFFFFFFF',
        '--window-size=1200,630', `--screenshot=${png}`, `file://${svgFile}`], { stdio: 'ignore', timeout: 30000 });
      if (r.status === 0 && fs.existsSync(png)) { manifest.images[key] = { hash, title }; rendered++; }
    }
    const ok = fs.existsSync(png) && manifest.images[key]?.hash === hash;
    if (!ok) console.warn(`Sharing image for ${url} is missing or out of date; using the site sharing card. Run npm run build:ccair on a machine with Google Chrome and commit static/ccair/assets/students/og/.`);
    images[key] = ok ? { url: `${SITE}/ccair/assets/students/og/${key}.png?v=${hash.slice(0, 8)}`, width: 1200, height: 630,
      alt: `${title}. CCAIR Student Guide, Center for CyberAI Research, Georgia State University.` } : SHARE_IMAGE;
  }
  if (rendered) {
    fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('Rendered %d sharing image(s) with headless Chrome; commit static/ccair/assets/students/og/.', rendered);
  }
  return images;
}

/* ---------- Page ---------- */
const navLinks = (p) => [
  { href: '/ccair/', label: 'Center home', hideSm: true },
  { href: '/ccair/students/', label: 'Student guide', current: !p.slug },
  { href: '/ccair/pathways/', label: 'Pathway Finder' },
  { href: '/', label: 'bampel.com', hideSm: true }
];

const mailto = (subject, body) => `mailto:${S.alerts.email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;

// Office hours: put them in ask.officeHours in students.json (for example "Tuesdays, 2 to 4 p.m., by appointment") to
// show them in the Ask CCAIR box on every guide page. Leave it empty to show nothing.
function askHtml() {
  const a = S.ask;
  return `<aside class="ask reveal" aria-labelledby="ask-h">
    <h2 id="ask-h">Ask CCAIR</h2>
    <p>Have a question this guide does not answer, or found a fact that looks out of date? Ask us through the <a href="${esc(a.contact)}">CCAIR contact page</a>.</p>
    ${a.officeHours ? `<p><b>Office hours:</b> ${esc(a.officeHours)}</p>` : ''}
    <p><b>Internship and scholarship alerts.</b> <a href="${esc(mailto(S.alerts.subscribe, S.alerts.body))}">Email us to subscribe</a>. The link opens your email app with a prepared message to Dr. Ampel's university inbox. Nothing is stored on this site. To stop, <a href="${esc(mailto(S.alerts.unsubscribe))}">email us to unsubscribe</a>.</p>
    <p><b>Guide updates.</b> Follow the <a href="${FEED_PATH}" type="application/atom+xml">update feed</a> in any feed reader.</p>
  </aside>`;
}

function changesHtml() {
  return `<section id="what-changed" aria-labelledby="what-changed-h"><h2 id="what-changed-h" class="reveal">What changed</h2>
    <ul class="changes">${S.changes.slice(0, 5).map((c) => `<li class="reveal"><time datetime="${c.date}">${fmtDate(c.date)}</time> <a href="${esc(c.url)}">${esc(c.title)}</a><p>${esc(c.text)}</p></li>`).join('')}</ul>
    <p class="body reveal">Follow every change in the <a href="${FEED_PATH}" type="application/atom+xml">update feed</a>.</p>
  </section>`;
}

const feedLink = `<link rel="alternate" type="application/atom+xml" title="CCAIR Student Guide updates" href="${FEED_PATH}">`;

// Builds a page's <main>. Returns { main, order } so the content can be hashed before the <head> is written.
function pageMain(p, idx) {
  const { cite, list, order } = makeCiter();
  const standalone = idx < 0;
  const sections = p.sections.map((s) => {
    const id = sectionId(s);
    return `<section id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h" class="reveal">${esc(s.h)}</h2>${s.answer ? `<p class="answer reveal">${md(s.answer, cite)}</p>` : ''}${s.blocks.map((b) => blockHtml(b, cite, p)).join('\n')}</section>`;
  }).join('\n  ');
  const tocItems = [...p.sections.map((s) => [sectionId(s), s.toc || s.h]), ...(!p.slug ? [['what-changed', 'What changed']] : [])];
  const toc = p.sections.length > 2 ? `<nav class="toc reveal" aria-label="On this page"><p class="toc-h">On this page</p><ul>${tocItems.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ul></nav>` : '';
  const roles = p.roles.map((slug) => { if (!ROLE[slug]) throw new Error(`Unknown role slug: ${slug}`); return ROLE[slug]; });
  const prev = standalone ? null : S.pages[idx - 1], next = standalone ? null : S.pages[idx + 1];
  const crumbs = p.slug
    ? `<li><a href="/ccair/">CCAIR</a></li><li><a href="/ccair/students/">Student guide</a></li><li aria-current="page">${esc(p.nav)}</li>`
    : `<li><a href="/ccair/">CCAIR</a></li><li aria-current="page">Student guide</li>`;
  const main = `<main id="main" class="guide students" tabindex="-1"><div class="narrow">
  <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>
  <div class="guide-hero">
    <span class="eyebrow reveal"><span class="dot"></span>CCAIR Student Guide${p.slug && !standalone ? ` · Part ${idx + 1} of ${S.pages.length}` : ''}</span>
    <h1 class="reveal" style="--d:.06s">${esc(p.title)}</h1>
    <p class="lede reveal" style="--d:.12s">${md(p.lede, cite)}</p>
    <p class="guide-meta reveal" style="--d:.16s"><span class="verified">Last verified: ${esc(standalone ? fmtDate(OC.updated) : S.verified)}</span> · Reviewed by Dr. Benjamin M. Ampel, Director of CCAIR</p>
    ${p.disclaimer ? `<div class="warn reveal" role="note"><b>General information, not legal advice.</b> ${esc(p.disclaimer.replace(/^General information, not legal advice\.\s*/, ''))}</div>` : ''}
    ${standalone && !OUTCOMES_LIVE ? `<div class="note reveal" role="note"><b>Data is being collected.</b> This page has no outcomes yet. It explains what will appear and how student privacy is protected.</div>` : ''}
    ${p.slug === 'data' ? downloadHtml() : ''}${!p.slug ? '\n    ' + photoHtml('students-hero', { priority: true, sizes: '(min-width: 820px) 780px, calc(100vw - 32px)' }) : ''}
  </div>
  ${toc}
  ${sections}
  ${!p.slug ? changesHtml() : ''}
  <section aria-labelledby="roles-h"><h2 id="roles-h" class="reveal">Related Pathway Finder roles</h2>
    <p class="body reveal">Each role guide covers the work, the realistic first job, starter certifications and free practice.</p>
    <div class="related reveal">${roles.map((r) => `<a href="/ccair/pathways/${r.slug}/">${esc(r.name)}</a>`).join('')}</div>
  </section>
  ${askHtml()}
  ${list()}
  ${standalone ? `<nav class="pager reveal" aria-label="Guide pages"><a class="prev" href="/ccair/students/"><span>Back to</span>Student guide</a><a class="next" href="/ccair/pathways/"><span>Next</span>Pathway Finder</a></nav>` : `<nav class="pager reveal" aria-label="Guide pages">
    ${prev ? `<a class="prev" href="${pageUrl(prev)}"><span>Previous</span>${esc(prev.nav)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${pageUrl(next)}"><span>Next</span>${esc(next.nav)}</a>` : `<a class="next" href="/ccair/"><span>Back to</span>CCAIR home</a>`}
  </nav>`}
  <nav class="guide-nav reveal" aria-label="Student guide contents"><p class="toc-h">Student guide contents</p><ol>${S.pages.map((x) => `<li><a href="${pageUrl(x)}"${x === p ? ' aria-current="page"' : ''}>${esc(x.nav)}</a></li>`).join('')}</ol></nav>
  <p class="reviewed">Last verified: ${esc(standalone ? fmtDate(OC.updated) : S.verified)}. Written for students by the <a href="/ccair/">Center for CyberAI Research (CCAIR)</a> at Georgia State University. Found an outdated fact? Tell us through the <a href="/ccair/#/contact">contact page</a>.</p>
</div></main>`;
  return { main, order };
}

function pageHtml(p, idx, main, order, modified, image, robots) {
  const url = `${BASE}${p.slug ? p.slug + '/' : ''}`;
  const crumbLd = [{ '@type': 'ListItem', position: 1, name: 'CCAIR', item: `${SITE}/ccair/` }, { '@type': 'ListItem', position: 2, name: 'Student guide', item: BASE }];
  if (p.slug) crumbLd.push({ '@type': 'ListItem', position: 3, name: p.nav, item: url });
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      person, org,
      { '@type': 'WebPage', '@id': url, url, name: p.title, description: p.desc, inLanguage: 'en-US', dateModified: modified,
        isPartOf: { '@type': 'WebSite', name: 'Benjamin M. Ampel', url: `${SITE}/` }, publisher: { '@id': org['@id'] }, reviewedBy: { '@id': person['@id'] },
        lastReviewed: S.updated, breadcrumb: { '@id': `${url}#breadcrumb` }, mainEntity: { '@id': `${url}#article` } },
      { '@type': 'Article', '@id': `${url}#article`, headline: p.title, description: p.desc, url, mainEntityOfPage: { '@id': url },
        author: { '@id': person['@id'] }, publisher: { '@id': org['@id'] }, datePublished: p.published || PUBLISHED, dateModified: modified,
        inLanguage: 'en-US', isAccessibleForFree: true, isPartOf: { '@type': 'CreativeWorkSeries', name: 'CCAIR Student Guide', url: BASE },
        audience: { '@type': 'EducationalAudience', educationalRole: 'student' }, about: { '@type': 'Thing', name: 'Cybersecurity careers and education' },
        image: image.url, citation: order.map((id) => S.refs[id].url) },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: crumbLd },
      ...(p.slug === 'data' ? [datasetLd()] : [])
    ]
  };
  const scripts = [`/ccair/assets/pathways/pathways.js?v=${ASSET_V}-anon3`, ...(p.slug === 'data' ? [`/ccair/assets/students/students.js?v=${ASSET_V}-2`] : [])];
  return `${baseHead({ title: p.metaTitle, ogTitle: p.title, desc: p.desc, url, ogType: 'article', image, robots, extra: feedLink,
    css: [`/ccair/assets/pathways/pathways.css?v=${ASSET_V}-gsu1-photos2`, `/ccair/assets/students/students.css?v=${ASSET_V}-gsu1`] })}
<meta property="article:modified_time" content="${modified}">
${ld(graph)}
</head>
<body>
${baseTop(navLinks(p))}
${main}
${baseFoot({ note: `Last verified ${idx < 0 ? fmtDate(OC.updated) : S.verified}`, scripts, photoCredits: true })}`;
}

/* ---------- Printable one-pagers ---------- */
// Print-optimized pages: light theme only, US Letter, one page each. Linked from the hub and the skills and
// certifications pages. noindex, because the full pages carry the same content with sources.
function printPage({ slug, title, desc, intro, body, parent }) {
  const url = `${BASE}print/${slug}/`;
  return `${baseHead({ title: `${title} (printable) | CCAIR Student Guide`, desc, url, robots: 'noindex, follow', image: OG_IMAGES.index,
    css: [`/ccair/assets/students/print.css?v=${ASSET_V}-gsu1`], extra: '<meta name="color-scheme" content="light">' })}
</head>
<body class="printable">
<a class="skip" href="#main">Skip to content</a>
<header class="p-top screen-only"><a href="${parent[1]}">&larr; ${esc(parent[0])}</a><button type="button" class="p-btn" data-print hidden>Print or save as PDF</button></header>
<main id="main" tabindex="-1">
  <header class="p-head"><p class="p-eyebrow">CCAIR Student Guide</p><h1>${esc(title)}</h1><p class="p-intro">${esc(intro)}</p></header>
  ${body}
  <footer class="p-foot">Full guide with sources: bampel.com${esc(parent[1])} · Last verified ${esc(S.verified)} · Center for CyberAI Research (CCAIR), Georgia State University. Prices and dates change, so confirm them before you pay.</footer>
</main>
<script src="/ccair/assets/students/students.js?v=${ASSET_V}-2" defer></script>
</body>
</html>
`;
}

function checklistBody() {
  const start = S.pages[0];
  const sec = (id) => start.sections.find((s) => sectionId(s) === id);
  const items = (s) => s.blocks.flatMap((b) => b.ol || b.ul || []);
  const groups = [['First month', 'your-first-month'], ['Every semester', 'every-semester'], ['Every year', 'every-year'], ['Final year', 'your-final-year'], ['Meet people in the field', 'join-the-local-security-community']];
  const li = (x) => {
    const t = plain(x).trim();
    const m = t.match(/^(.+?[.:])\s+(.*)$/);
    const lead = m ? m[1] : t, rest = m ? m[2] : '';
    const first = (rest.match(/^.*?[.!?](\s|$)/) || [rest])[0].trim();
    return `<li><span class="box" aria-hidden="true"></span><b>${esc(lead)}</b> ${esc(first)}</li>`;
  };
  return `<div class="p-cols">${groups.map(([h, id]) => { const s = sec(id); if (!s) throw new Error(`Checklist: no section ${id}`);
    return `<section class="p-group"><h2>${esc(h)}</h2><ul class="check">${items(s).map(li).join('')}</ul></section>`; }).join('')}</div>`;
}

function certMapBody() {
  const certs = S.pages.find((p) => p.slug === 'certifications');
  const cmp = certs.sections.find((s) => sectionId(s) === 'compare');
  const t = cmp.blocks.find((b) => b.table).table;
  const certTable = `<table class="p-table p-certs"><caption>Certifications compared</caption><thead><tr>${t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${esc(plain(c))}</th>` : `<td>${esc(plain(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const roleTable = `<table class="p-table p-roles"><caption>Roles and their starter certifications (from the Pathway Finder)</caption><thead><tr><th scope="col">Role</th><th scope="col">First job?</th><th scope="col">Coding</th><th scope="col">Starter certifications</th></tr></thead>
    <tbody>${roleRows().map(({ r, cells }) => `<tr><th scope="row">${esc(r.name)}</th><td>${esc(cells[0])}</td><td>${esc(cells[1])}</td><td>${esc(cells[2])}</td></tr>`).join('')}</tbody></table>`;
  return `<p class="p-rule"><b>The rule:</b> read five job postings for your target role before you buy any exam. Most students need one entry certification before their first job.</p>${certTable}${roleTable}`;
}

/* ---------- Feed ---------- */
function feedXml() {
  const x = (s) => esc(s);
  const updated = S.changes.map((c) => c.date).sort().at(-1);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <title>CCAIR Student Guide updates</title>
  <subtitle>What changed in the CCAIR Student Guide for cybersecurity students, from the Center for CyberAI Research at Georgia State University.</subtitle>
  <id>${BASE}feed.xml</id>
  <link rel="self" type="application/atom+xml" href="${SITE}${FEED_PATH}"/>
  <link rel="alternate" type="text/html" href="${BASE}"/>
  <updated>${updated}T12:00:00Z</updated>
  <author><name>Center for CyberAI Research (CCAIR)</name><uri>${SITE}/ccair/</uri></author>
  <icon>${SITE}/ccair/assets/brand/apple-touch-icon.png</icon>
${S.changes.map((c) => `  <entry>
    <title>${x(c.title)}</title>
    <id>tag:bampel.com,${c.date}:ccair-students/${slugify(c.title)}</id>
    <link rel="alternate" type="text/html" href="${SITE}${x(c.url)}"/>
    <updated>${c.date}T12:00:00Z</updated>
    <summary>${x(c.text)}</summary>
  </entry>`).join('\n')}
</feed>
`;
}

/* ---------- Checks ---------- */
assertNoInternalNotes(S, 'students.json');
assertNoInternalNotes(DS, 'datasets.json');
for (const d of DS.datasets) {
  for (const k of ['name', 'category', 'description', 'link']) if (!d[k]) throw new Error(`datasets.json: "${d.name || '?'}" is missing ${k}`);
  for (const k of ['link', 'paper']) if (d[k] && !/^https?:\/\//.test(d[k])) throw new Error(`datasets.json: "${d.name}" ${k} is not an http(s) URL`);
  if (!d.caveats) console.warn(`datasets.json: "${d.name}" has no caveats; every entry should name a known weakness`);
}
for (const c of S.changes) if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !c.title || !c.text || !c.url) throw new Error(`students.json changes: incomplete entry ${JSON.stringify(c).slice(0, 80)}`);
for (const p of S.pages) {
  const ids = p.sections.map(sectionId);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`students.json: duplicate section id "${dup}" on page "${p.slug}"`);
  for (const s of p.sections) if (!s.id) console.warn(`students.json: section "${s.h}" on page "${p.slug || 'index'}" has no id; its anchor (#${sectionId(s)}) changes if the heading is reworded`);
  if (p.published && !/^\d{4}-\d{2}-\d{2}$/.test(p.published)) throw new Error(`students.json: page "${p.slug}" published is not YYYY-MM-DD`);
}
checkOutcomes();
OUTCOMES.sections = outcomesSections();
const DOWNLOADS = downloadFiles();

/* ---------- Write ---------- */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const ogPages = [...S.pages.map((p, i) => ({ key: p.slug || 'index', title: p.title, url: `${BASE}${p.slug ? p.slug + '/' : ''}`,
  eyebrow: p.slug ? `CCAIR Student Guide · Part ${i + 1} of ${S.pages.length}` : 'CCAIR Student Guide' })),
  { key: 'outcomes', title: OUTCOMES.title, url: `${BASE}outcomes/`, eyebrow: 'CCAIR Student Guide' }];
const OG_IMAGES = ogImages(ogPages);

const built = [...S.pages.map((p, i) => ({ p, i })), { p: OUTCOMES, i: -1 }].map(({ p, i }) => ({ p, i, ...pageMain(p, i) }));

// Content hashes decide lastmod (see the header comment).
const store = fs.existsSync(LASTMOD_STORE) ? JSON.parse(fs.readFileSync(LASTMOD_STORE, 'utf8')) : { pages: {} };
const nextStore = { note: 'Written by scripts/build-students.mjs. lastmod is the date the hash of the page\'s <main> last changed. Commit this file after a build that changes it.', pages: {} };
for (const b of built) {
  const u = pageUrl(b.p), hash = sha(b.main), prev = store.pages[u];
  const lastmod = prev && prev.hash === hash ? prev.lastmod : TODAY;
  nextStore.pages[u] = { hash, lastmod, sitemap: b.i >= 0 || OUTCOMES_LIVE };
  b.modified = lastmod;
}
const storeText = JSON.stringify(nextStore, null, 2) + '\n';
if (!fs.existsSync(LASTMOD_STORE) || fs.readFileSync(LASTMOD_STORE, 'utf8') !== storeText) {
  fs.writeFileSync(LASTMOD_STORE, storeText);
  console.log('guide-lastmod.json changed (a page\'s content changed); commit static/ccair/data/guide-lastmod.json.');
}

const files = new Map();
for (const b of built) {
  const robots = b.i < 0 && !OUTCOMES_LIVE ? 'noindex, follow' : undefined;
  files.set(path.join(out, b.p.slug, 'index.html'), pageHtml(b.p, b.i, b.main, b.order, b.modified, OG_IMAGES[b.p.slug || 'index'], robots));
}
files.set(path.join(out, 'print', 'checklist', 'index.html'), printPage({ slug: 'checklist', title: 'Your cybersecurity career, year by year',
  desc: 'A one-page printable checklist of the CCAIR Student Guide plan: first month, every semester, every year, final year and local community.',
  intro: 'Tick each box as you go. The full guide explains every step and links its sources.', body: checklistBody(), parent: ['Student guide', '/ccair/students/'] }));
files.set(path.join(out, 'print', 'certifications', 'index.html'), printPage({ slug: 'certifications', title: 'Cybersecurity certification map',
  desc: `A one-page printable map of cybersecurity certifications: who each is for, when to take it, what it costs, and the starter certifications for ${P.roles.length} roles.`,
  intro: `Who each certification is for, when to take it and what it costs, plus the starter certifications for ${P.roles.length} roles.`, body: certMapBody(), parent: ['Certifications', '/ccair/students/certifications/'] }));
files.set(path.join(out, 'feed.xml'), feedXml());

// Every link to a guide page or anchor must resolve (keeps renamed headings from breaking links).
const anchors = new Map();
for (const [f, html] of files) {
  if (!f.endsWith('.html')) continue;
  const rel = '/' + path.relative(path.join(CCAIR, '..'), path.dirname(f)).split(path.sep).join('/') + '/';
  anchors.set(rel, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}
for (const [f, html] of files) {
  if (!f.endsWith('.html')) continue;
  const here = '/' + path.relative(path.join(CCAIR, '..'), path.dirname(f)).split(path.sep).join('/') + '/';
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    const m = href.match(/^(\/ccair\/students\/[^#?"]*)?(?:#([^"]+))?$/);
    if (!m || (!m[1] && !m[2])) continue;
    const target = m[1] || here;
    if (!/\/$/.test(target)) continue; // files (CSV, JSON, feed) are checked by existence below
    if (!anchors.has(target)) throw new Error(`Broken guide link in ${path.relative(ROOT, f)}: ${href}`);
    if (m[2] && !anchors.get(target).has(m[2])) throw new Error(`Broken guide anchor in ${path.relative(ROOT, f)}: ${href}`);
  }
}

for (const [f, html] of files) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); }
writeDownloads();

// llms.txt should list every indexable guide page and the catalog downloads.
const llms = fs.readFileSync(path.join(ROOT, 'static', 'llms.txt'), 'utf8');
for (const u of [...Object.entries(nextStore.pages).filter(([, e]) => e.sitemap).map(([u]) => u), CSV_PATH, FEED_PATH]) {
  if (!llms.includes(`${SITE}${u}`)) console.warn(`static/llms.txt does not list ${SITE}${u}`);
}

const n = writeSitemap();
console.log('Student guide build complete: %d pages + outcomes (%s) + 2 printables, %d datasets (CSV and JSON), feed with %d entries, sitemap with %d URLs',
  S.pages.length, OUTCOMES_LIVE ? `${OC.rows.length} rows` : 'collecting, noindex', DS.datasets.length, S.changes.length, n);
