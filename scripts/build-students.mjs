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
import { CCAIR, ROOT, SITE, esc, ld, person, org, head as baseHead, top as baseTop, foot as baseFoot, writeSitemap, readJson,
  HIRING, CODE_SHORT, LASTMOD_STORE, ogImages, photoHtml, fmtDate, NEW_TAB, assertNoInternalNotes } from './ccair-static.mjs';

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
// Keep a "?v=" on every asset URL below: scripts/minify-ccair-assets.mjs replaces the value with a content hash at build time
// but only rewrites a query that exists. The value itself is a placeholder; it is only seen by a build without that step.
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
// Reveal delay as a class (d-0 ... d-60 in pathways.css: hundredths of a second), never a style attribute (CSP).
const dly = (sec) => `d-${Math.min(60, Math.round(sec * 100))}`;

function cardsHtml() {
  const cards = S.pages.filter((p) => p.slug).map((p, i) => `<a class="card reveal ${dly((i % 2) * 0.06)}" href="${pageUrl(p)}">
    <h3>${esc(p.nav)}</h3><p>${esc(p.summary)}</p><span class="go">Read &rarr;</span></a>`);
  cards.push(`<a class="card reveal${OUTCOMES_LIVE ? '' : ' soon'}" href="${pageUrl(OUTCOMES)}">
    ${OUTCOMES_LIVE ? '' : '<span class="badge emerging">Coming soon</span>'}<h3>${esc(OUTCOMES.nav)}</h3><p>${OUTCOMES_LIVE ? 'Internships and first jobs of CCAIR and CIS students, as group counts.' : 'Internships and first jobs of CCAIR and CIS students. The data is being collected.'}</p><span class="go">${OUTCOMES_LIVE ? 'Read' : 'What it will show'} &rarr;</span></a>`);
  return `<div class="guide-cards">${cards.join('')}</div>`;
}

function audiencesHtml(list, cite) {
  return `<div class="audiences">${list.map((a, i) => `<article class="aud reveal ${dly((i % 2) * 0.06)}${a.wide ? ' wide' : ''}" id="for-${a.id}" aria-labelledby="for-${a.id}-h">
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

function datasetHtml(d, catalogLink = false) {
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
    <p class="ds-links">${d.link ? `<a href="${esc(d.link)}" rel="noopener" target="_blank">Dataset page<span class="sr-only"> for ${esc(d.name)} (opens in a new tab)</span></a>` : ''}${d.paper ? `<a href="${esc(d.paper)}" rel="noopener" target="_blank">Paper to cite<span class="sr-only"> for ${esc(d.name)} (opens in a new tab)</span></a>` : ''}${catalogLink ? `<a href="/ccair/students/data/#${id}">Full catalog entry<span class="sr-only"> for ${esc(d.name)}</span></a>` : ''}</p>
  </article>
</li>`;
}

const sortedDatasets = () => [...DS.datasets].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const kb = (text) => `${Math.max(1, Math.round(Buffer.byteLength(text, 'utf8') / 1000))} KB`;
function downloadHtml() {
  const rows = `${DS.datasets.length} rows`;
  return `<div class="download reveal d-20" id="download">
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

// Plain ItemList of the dataset cards, in card order. ListItems carry position, name and url only: the datasets are third-party,
// so no Dataset node is made for each one. url is the same dataset page the card links to (build check above requires it).
function datasetListLd() {
  const list = sortedDatasets();
  return {
    '@type': 'ItemList', '@id': `${BASE}data/#datasets`, name: 'Cybersecurity datasets in the CCAIR catalog', numberOfItems: list.length,
    itemListOrder: 'https://schema.org/ItemListUnordered', mainEntityOfPage: { '@id': `${BASE}data/` },
    itemListElement: list.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name, url: d.link }))
  };
}

/* ---------- Catalog intro and topic pages ---------- */
// A license counts as permissive only when it is one of these exact strings. Anything with an added clause, a research-only
// condition, mixed terms, NC, ND, SA or GPL is left out on purpose. Add a string here only after reading the dataset's terms.
const PERMISSIVE = new Set(['MIT', 'Apache 2.0', 'Apache-2.0', 'BSD', 'BSD-3-Clause', 'CC BY 4.0', 'CC-BY-4.0', 'CC BY (CTU-13)', 'CC0',
  'CC0 1.0 (repository)', 'CC0-1.0', 'CC0-1.0 (dual-licensed)', 'CDLA-Permissive-2.0', 'Data CC-BY-4.0, code MIT', 'ODC-BY', 'ODC-By', 'Public domain']);
const PERMISSIVE_TEXT = 'MIT, Apache, BSD, CC0, CC BY, ODC-By, CDLA-Permissive or public domain';
const isPermissive = (d) => PERMISSIVE.has(String(d.license || '').trim());
const DATA_URL = '/ccair/students/data/';
const dsAnchor = (d) => `ds-${slugify(d.name)}`;

// Topic pages under /ccair/students/data/<slug>/. Counts, the permissive share and the largest entry are computed at build
// time. "largest" names the entry whose stated size is shown (sizes are free text, so the choice is made by hand and checked
// below). The compare paragraphs are written by hand from the entries' descriptions and caveats: reread them when an entry
// in the topic changes.
const CATEGORY_PAGES = [
  { slug: 'prompt-injection', nav: 'Prompt injection', noun: 'prompt injection and jailbreak',
    title: 'Prompt Injection and Jailbreak Datasets',
    desc: 'Public prompt injection and jailbreak datasets for LLM security research, compared by source of attacks, size, license and known weaknesses.',
    match: (d) => d.category.startsWith('AI and LLM') && /prompt injection|jailbreak|adversarial suffix|safety training/i.test(d.subcategory || '') && !/agent/i.test(d.subcategory || ''),
    largest: 'WildJailbreak',
    compare: [
      'Use In-the-Wild Jailbreak Prompts or Tensor Trust when you need attacks that people actually wrote. AdvBench, HarmBench and JailbreakBench give a fixed list of harmful behaviors to score a model against, so results are comparable across papers.',
      'deepset Prompt Injections and Gandalf Ignore Instructions are small labeled sets for training or testing an injection classifier. BIPIA covers indirect injection, where the attack sits in content the model reads. WildJailbreak is the largest set, but it is synthetic, so do not report it as evidence of real attacker behavior.'
    ] },
  { slug: 'llm-agents', nav: 'LLM agents', noun: 'LLM agent security',
    title: 'LLM Agent Security Benchmarks',
    desc: 'Public benchmarks for LLM agent security: prompt injection through tools, harmful multi-step tasks, and capture the flag and real-vulnerability challenges.',
    match: (d) => /agent|capture the flag/i.test(d.subcategory || ''),
    largest: 'CyberGym',
    compare: [
      'AgentDojo and InjecAgent test whether an agent follows instructions injected into the data its tools return. AgentHarm tests whether an agent completes harmful multi-step tasks. Cybench, InterCode-CTF and NYU CTF Bench measure offensive capability on capture the flag challenges, and CyberGym measures it on real vulnerabilities in open source projects.',
      'Check the license before you build on these. NYU CTF Bench is GPL-2.0, and AgentHarm adds a usage clause to its MIT license.'
    ] },
  { slug: 'vulnerable-code', nav: 'Vulnerable code', noun: 'vulnerable code and software security',
    title: 'Vulnerable Code and Vulnerability Repair Datasets',
    desc: 'Public datasets for vulnerability detection, vulnerability repair and secure code generation, compared by label source, size, license and known weaknesses.',
    match: (d) => d.category === 'Vulnerable code and software security',
    largest: 'CyberGym',
    compare: [
      'CyberSecEval and SecurityEval test whether a code generation model writes insecure code. CVEfixes, MoreFixes, Project KB and CrossVul pair vulnerable code with the commit that fixed it, which suits repair work. Most of the remaining sets (Big-Vul, Devign, DiverseVul, PrimeVul, MegaVul and others) label functions as vulnerable or not for detection.',
      'Read the known weaknesses before you pick a detection set. Many of these entries record label noise or duplication between training and test data, and PrimeVul was built to measure how much those problems inflate reported results.'
    ] },
  { slug: 'deepfake-audio', nav: 'Deepfakes', noun: 'deepfake and voice spoofing',
    title: 'Deepfake Audio and Video Datasets',
    desc: 'Public deepfake and voice spoofing datasets, from the ASVspoof challenges to in-the-wild audio and face-swap video, compared by access, license and size.',
    match: (d) => d.category === 'Deepfakes and voice spoofing',
    largest: 'ASVspoof 5',
    compare: [
      'ASVspoof 2019, 2021 and 5 are the standard benchmarks for spoofed speech, released under ODC-BY. In-the-Wild Audio Deepfake (recordings of 58 public figures) and WaveFake test whether a detector trained on ASVspoof generalizes to audio it has not seen.',
      'DFDC, FaceForensics++ and FakeAVCeleb cover face-swap video and combined audio and video. Each needs registration or an academic request before you can download it.'
    ] },
  { slug: 'phishing', nav: 'Phishing', noun: 'phishing, spam and malicious URL',
    title: 'Phishing, Spam and Malicious URL Datasets',
    desc: 'Public phishing email, phishing website, malicious URL and SMS spam datasets and feeds, compared by data type, size, license and known weaknesses.',
    match: (d) => d.category === 'Phishing, spam, and malicious URLs',
    largest: 'PhreshPhish',
    compare: [
      'The email sets are Nazario, Phishing Email Curated, SpamAssassin and Enron. Enron has no phishing labels and usually serves as the legitimate class. PhiUSIIL, UCI Phishing Websites, Vrbancic, Hannousse and Yahiouche, and ISCX-URL2016 give URL and website features. Phishpedia and PhreshPhish carry page content, and SMS Spam Collection covers text message scams.',
      'PhishTank, OpenPhish and URLhaus are live feeds that change every day. Record the date you pulled them so others can reproduce your sample.'
    ] },
  { slug: 'threat-intelligence', nav: 'Threat intelligence', noun: 'threat intelligence and hacker community',
    title: 'Threat Intelligence and Hacker Forum Datasets',
    desc: 'Public threat intelligence feeds, threat report collections and hacker forum corpora, compared by access, size, license and known weaknesses.',
    match: (d) => d.category === 'Threat intelligence and hacker communities',
    largest: 'Cambridge Cybercrime Centre CrimeBB',
    compare: [
      'CrimeBB, the Evolution Cryptomarket dataset and HackerSignal hold text written in hacker and underground communities. CrimeBB needs an institutional agreement, and HackerSignal and Evolution are open downloads. APTnotes, CyberMonitor and ORKL collect published threat reports.',
      'The abuse.ch feeds, OTX, the MISP feeds, Spamhaus DROP and Ransomware.live change daily, so record the date you pulled them. Malpedia and MISP Galaxy give taxonomies of malware families and threat actors to label against.'
    ] },
  { slug: 'network-host-logs', nav: 'Network and host logs', noun: 'network traffic and host log',
    title: 'Network Intrusion and Host Log Datasets',
    desc: 'Public network intrusion detection datasets and host, endpoint and system log datasets, compared by collection method, size, license and known weaknesses.',
    match: (d) => d.category === 'Network traffic and intrusion detection' || d.category === 'Host, endpoint, and security logs',
    largest: 'LANL User-Computer Authentication Associations in Time',
    compare: [
      'The network sets run from the legacy DARPA 1998 and 1999 data and NSL-KDD through the CIC and ISCX collections and UNSW-NB15 to CESNET encrypted traffic. Most were captured in a lab with generated attacks, and many of their caveats report labeling problems, so test on more than one set before you claim a detector generalizes.',
      'The host sets include LANL authentication events, Splunk BOTS v1 to v3 and Microsoft GUIDE for security operations work, Loghub and HDFS for log anomaly detection, and DARPA Transparent Computing and ATLAS for attack provenance graphs.'
    ] },
  { slug: 'malware', nav: 'Malware', noun: 'malware',
    title: 'Malware Datasets',
    desc: 'Public malware datasets for Windows, Android and IoT: feature sets, image and graph sets, and live sample repositories, compared by size, access and license.',
    match: (d) => d.category === 'Malware and binaries',
    largest: 'SOREL-20M',
    compare: [
      'EMBER, EMBER2024, SOREL-20M and MalDICT give extracted features, so you can train a classifier without handling live binaries. Malimg, MaleVis and MalNet turn samples into images or graphs. AndroZoo, Drebin, KronoDroid, MH-100K and the CIC Android sets cover Android apps.',
      'MalwareBazaar, MalShare, VirusShare and theZoo distribute live malware. Download and analyze those samples only in an isolated environment.'
    ] }
].map((c) => ({ ...c, metaTitle: `${c.title} | CCAIR, Georgia State University`, url: `${DATA_URL}${c.slug}/` }));

function categoryStats(c) {
  const list = sortedDatasets().filter(c.match);
  if (!list.length) throw new Error(`Topic page "${c.slug}" matches no datasets`);
  const big = list.find((d) => d.name === c.largest);
  if (!big) throw new Error(`Topic page "${c.slug}": largest "${c.largest}" is not one of its datasets`);
  if (!big.size) throw new Error(`Topic page "${c.slug}": "${c.largest}" has no stated size`);
  return { list, n: list.length, perm: list.filter(isPermissive).length, big };
}

const topicLinksHtml = (current) => `<div class="related reveal">${CATEGORY_PAGES.filter((c) => c.slug !== current).map((c) => `<a href="${c.url}">${esc(c.nav)}</a>`).join('')}</div>`;

// Intro for the catalog page: every number comes from datasets.json.
function catalogIntroHtml() {
  const list = DS.datasets, n = list.length;
  const cats = new Set(list.map((d) => d.category)).size;
  const count = (a) => list.filter((d) => d.access === a).length;
  const gone = list.filter((d) => /^unavailable/i.test(d.access || '')).map((d) => d.name).sort();
  const checked = list.map((d) => d.checked).filter(Boolean).sort();
  const names = (a) => a.length < 3 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
  return `<div class="catalog-intro">
    <p class="body reveal">This catalog lists ${n} public cybersecurity datasets in ${cats} categories for machine learning and AI research. CCAIR includes a dataset only when a researcher can obtain it through an open download, free registration, an API or an academic request, and only when its creators document where the data came from.${gone.length ? ` ${names(gone)} stay${gone.length === 1 ? 's' : ''} listed with ${gone.length === 1 ? 'its' : 'their'} status because ${gone.length === 1 ? 'its download site is' : 'their download sites are'} offline.` : ''}</p>
    <p class="body reveal">Every entry states its access method, license, data type, size, time span and at least one known weakness. ${list.filter((d) => d.paper).length} of ${n} entries also name the paper their creators ask you to cite. ${list.filter(isPermissive).length} datasets use permissive licenses (${PERMISSIVE_TEXT}). Check the terms of any other dataset before commercial use or redistribution.</p>
    <p class="body reveal">${count('Open download')} datasets are open downloads, ${count('Free registration')} need free registration, ${count('Academic request')} need an academic request and ${count('API')} come through an API. CCAIR checked every link between ${fmtDate(checked[0])} and ${fmtDate(checked.at(-1))}, and each entry shows its own check date.</p>
    <p class="body reveal">Topic pages compare the datasets for eight common research areas:</p>
    ${topicLinksHtml(null)}
  </div>`;
}

function categoryMain(c) {
  const { list, n, perm, big } = categoryStats(c);
  const checked = list.map((d) => d.checked).filter(Boolean).sort();
  const lede = `${n} public ${c.noun} dataset${n === 1 ? '' : 's'} in the CCAIR catalog. ${perm} of ${n} use permissive licenses (${PERMISSIVE_TEXT}). The largest is ${big.name} (${big.size}).`;
  const crumbs = `<li><a href="/ccair/">CCAIR</a></li><li><a href="/ccair/students/">Student guide</a></li><li><a href="${DATA_URL}">Find data</a></li><li aria-current="page">${esc(c.nav)}</li>`;
  const main = `<main id="main" class="guide students" tabindex="-1"><div class="narrow">
  <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>
  <div class="guide-hero">
    <span class="eyebrow reveal"><span class="dot"></span>CCAIR Dataset Catalog</span>
    <h1 class="reveal d-6">${esc(c.title)}</h1>
    <p class="lede reveal d-12">${esc(lede)}</p>
    <p class="guide-meta reveal d-16"><span class="verified">${checked[0] === checked.at(-1) ? `Links checked ${esc(fmtDate(checked[0]))}` : `Links checked ${esc(fmtDate(checked[0]))} to ${esc(fmtDate(checked.at(-1)))}`}</span> · Reviewed by Dr. Benjamin M. Ampel, Director of CCAIR</p>
  </div>
  <section id="compare" aria-labelledby="compare-h"><h2 id="compare-h" class="reveal">How these datasets compare</h2>
    ${c.compare.map((t) => `<p class="body reveal">${esc(t)}</p>`).join('\n    ')}
  </section>
  <section id="datasets" aria-labelledby="datasets-h"><h2 id="datasets-h" class="reveal">The ${n} dataset${n === 1 ? '' : 's'}</h2>
    <p class="body reveal">Each entry links to its full record in the <a href="${DATA_URL}">CCAIR cybersecurity dataset catalog</a>, where you can also download the whole catalog as CSV or JSON.</p>
    <ul class="ds-list">${list.map((d) => datasetHtml(d, true)).join('\n')}</ul>
  </section>
  <section id="other-topics" aria-labelledby="other-topics-h"><h2 id="other-topics-h" class="reveal">Other topics</h2>
    ${topicLinksHtml(c.slug)}
    <p class="body reveal"><a href="${DATA_URL}">Browse all ${DS.datasets.length} datasets</a></p>
  </section>
  ${askHtml()}
  <p class="reviewed">Compiled for students and researchers by the <a href="/ccair/">Center for CyberAI Research (CCAIR)</a> at Georgia State University. Confirm access and license terms on each dataset's own page before you use it. Found an outdated entry? Tell us through the <a href="/ccair/contact/">contact page</a>.</p>
</div></main>`;
  return { main, list };
}

function categoryHtml(c, main, list, modified, image) {
  const url = `${SITE}${c.url}`;
  const crumbLd = [['CCAIR', `${SITE}/ccair/`], ['Student guide', BASE], ['Find data', `${BASE}data/`], [c.nav, url]]
    .map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      person, org,
      { '@type': 'CollectionPage', '@id': url, url, name: c.title, description: c.desc, inLanguage: 'en-US', dateModified: modified,
        isPartOf: { '@id': `${BASE}data/` }, publisher: { '@id': org['@id'] }, reviewedBy: { '@id': person['@id'] },
        breadcrumb: { '@id': `${url}#breadcrumb` }, mainEntity: { '@id': `${url}#datasets` }, image: image.url },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: crumbLd },
      { '@type': 'ItemList', '@id': `${url}#datasets`, name: c.title, numberOfItems: list.length, itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: list.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: d.name, url: d.link })) }
    ]
  };
  return `${baseHead({ title: c.metaTitle, ogTitle: c.title, desc: c.desc, url, ogType: 'website', image, extra: feedLink,
    css: [`/ccair/assets/pathways/pathways.css?v=${ASSET_V}-gsu1-a11y2`, `/ccair/assets/students/students.css?v=${ASSET_V}-gsu1-refs`] })}
${ld(graph)}
</head>
<body>
${baseTop(navLinks({ slug: 'data' }))}
${main}
${baseFoot({ note: `Catalog version ${DS.updated}`, scripts: [`/ccair/assets/pathways/pathways-motion.js?v=${ASSET_V}-m1`] })}`;
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
    blocks: [{ p: 'Every count records its source and year. Want your outcome counted, or have a correction? Use the [contact page](/ccair/contact/).' }] };
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
    <h1 class="reveal d-6">${esc(p.title)}</h1>
    <p class="lede reveal d-12">${md(p.lede, cite)}</p>
    <p class="guide-meta reveal d-16"><span class="verified">Last verified: ${esc(standalone ? fmtDate(OC.updated) : S.verified)}</span> · Reviewed by Dr. Benjamin M. Ampel, Director of CCAIR</p>
    ${p.disclaimer ? `<div class="warn reveal" role="note"><b>General information, not legal advice.</b> ${esc(p.disclaimer.replace(/^General information, not legal advice\.\s*/, ''))}</div>` : ''}
    ${standalone && !OUTCOMES_LIVE ? `<div class="note reveal" role="note"><b>Data is being collected.</b> This page has no outcomes yet. It explains what will appear and how student privacy is protected.</div>` : ''}
    ${p.slug === 'data' ? catalogIntroHtml() + downloadHtml() : ''}${!p.slug ? '\n    ' + photoHtml('students-hero', { priority: true, sizes: '(min-width: 820px) 780px, calc(100vw - 32px)' }) : ''}
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
  <p class="reviewed">Last verified: ${esc(standalone ? fmtDate(OC.updated) : S.verified)}. Written for students by the <a href="/ccair/">Center for CyberAI Research (CCAIR)</a> at Georgia State University. Found an outdated fact? Tell us through the <a href="/ccair/contact/">contact page</a>.</p>
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
      ...(p.slug === 'data' ? [datasetLd(), datasetListLd()] : [])
    ]
  };
  // Only the shared motion layer: the role filters and the quiz in pathways.js run on the Pathway Finder alone.
  const scripts = [`/ccair/assets/pathways/pathways-motion.js?v=${ASSET_V}-m1`, ...(p.slug === 'data' ? [`/ccair/assets/students/students.js?v=${ASSET_V}-2`] : [])];
  return `${baseHead({ title: p.metaTitle, ogTitle: p.title, desc: p.desc, url, ogType: 'article', image, robots, extra: feedLink,
    css: [`/ccair/assets/pathways/pathways.css?v=${ASSET_V}-gsu1-a11y2`, `/ccair/assets/students/students.css?v=${ASSET_V}-gsu1-refs`] })}
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
const OG_IMAGES = ogImages(ogPages.map((p) => ({ ...p, alt: `${p.title}. CCAIR Student Guide, Center for CyberAI Research, Georgia State University.` })),
  { pngDir: OG_DIR, svgDir: path.join(out, 'og'), script: 'scripts/build-students.mjs' });

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
// Topic pages of the dataset catalog: same lastmod rule, keyed by their own URL.
const cats = CATEGORY_PAGES.map((c) => ({ c, ...categoryMain(c) }));
for (const t of cats) {
  const hash = sha(t.main), prev = store.pages[t.c.url];
  t.modified = prev && prev.hash === hash ? prev.lastmod : TODAY;
  nextStore.pages[t.c.url] = { hash, lastmod: t.modified, sitemap: true };
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
for (const t of cats) files.set(path.join(out, 'data', t.c.slug, 'index.html'), categoryHtml(t.c, t.main, t.list, t.modified, OG_IMAGES.data));
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
console.log('Student guide build complete: %d pages + outcomes (%s) + %d dataset topic pages + 2 printables, %d datasets (CSV and JSON), feed with %d entries, sitemap with %d URLs',
  S.pages.length, OUTCOMES_LIVE ? `${OC.rows.length} rows` : 'collecting, noindex', cats.length, DS.datasets.length, S.changes.length, n);
