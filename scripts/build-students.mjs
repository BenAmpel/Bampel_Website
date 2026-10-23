// Builds the CCAIR Student Guide as plain, indexable HTML (same approach as the Pathway Finder).
// Input:  static/ccair/data/students.json  (page copy, sources, Pathway Finder cross-links)
//         static/ccair/data/datasets.json  (dataset catalog for /ccair/students/data/; refresh it with scripts/import-datasets.mjs)
//         static/ccair/data/pathways.json  (role names for cross-links)
// Output: static/ccair/students/index.html, static/ccair/students/<slug>/index.html, static/ccair/sitemap.xml
// Run by `npm run build:ccair` after build-pathways.mjs (netlify.toml runs it before Hugo copies static/ into public/).
//
// Copy markup in students.json: [text](url) link, **text** bold lead-in, {{refId}} numbered citation to refs.refId,
// [[role:slug]] link to a Pathway Finder role guide. Every citation renders as [n] and the page's Sources list is
// numbered in order of first use. An unknown refId or role slug stops the build.
//
// datasets.json schema: { updated: 'YYYY-MM-DD', datasets: [ { name, category, subcategory, description, access, link,
// dataType, size, timeSpan, license, paper, caveats, checked } ] }. All values are plain text (no markup); link and paper
// are http(s) URLs; checked is the date the link was last checked (YYYY-MM-DD). Empty strings render as "Not stated".
import fs from 'node:fs';
import path from 'node:path';
import { CCAIR, SITE, esc, ld, person, org, head as baseHead, top as baseTop, foot as baseFoot, writeSitemap, readJson } from './ccair-static.mjs';

const S = readJson('students.json');
const DS = readJson('datasets.json');
const P = readJson('pathways.json');
const ROLE = Object.fromEntries(P.roles.map((r) => [r.slug, r]));
const out = path.join(CCAIR, 'students');
const BASE = `${SITE}/ccair/students/`;
const ASSET_V = S.updated.replace(/-/g, '');
const PUBLISHED = '2026-10-22';
const CATALOG_TARGET = 10; // below this many entries the data page says the full catalog is still being added
const pageUrl = (p) => `/ccair/students/${p.slug ? p.slug + '/' : ''}`;

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
      return `<li id="ref-${i + 1}"><span class="mono">[${i + 1}]</span> ${esc(x.publisher)}. <a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.title)}</a>.</li>`; }).join('')}</ol></section>` : '';
  return { cite, list, order };
}

function md(text, cite) {
  let h = esc(text);
  h = h.replace(/\[\[role:([a-z0-9-]+)\]\]/g, (_, slug) => {
    if (!ROLE[slug]) throw new Error(`Unknown role slug: ${slug}`);
    return `<a href="/ccair/pathways/${slug}/">${esc(ROLE[slug].name)}</a>`;
  });
  h = h.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, id) => cite(id));
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u);
    return `<a href="${u}"${ext ? ' rel="noopener" target="_blank"' : ''}>${t}</a>`;
  });
  return h;
}

/* ---------- Blocks ---------- */
function cardsHtml() {
  return `<div class="guide-cards">${S.pages.filter((p) => p.slug).map((p, i) => `<a class="card reveal" style="--d:${((i % 2) * 0.06).toFixed(2)}s" href="${pageUrl(p)}">
    <h3>${esc(p.nav)}</h3><p>${esc(p.summary)}</p><span class="go">Read &rarr;</span></a>`).join('')}</div>`;
}

function blockHtml(b, cite, page) {
  if (b.p) return `<p class="body reveal">${md(b.p, cite)}</p>`;
  if (b.h3) return `<h3 class="sub-h reveal">${md(b.h3, cite)}</h3>`;
  if (b.ul) return `<ul class="list">${b.ul.map((x) => `<li class="reveal">${md(x, cite)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol class="list">${b.ol.map((x) => `<li class="reveal">${md(x, cite)}</li>`).join('')}</ol>`;
  if (b.note) return `<div class="note reveal">${md(b.note, cite)}</div>`;
  if (b.warn) return `<div class="warn reveal">${md(b.warn, cite)}</div>`;
  if (b.table) {
    const t = b.table;
    return `<div class="table-wrap reveal" role="region" aria-label="${esc(t.caption)}" tabindex="0"><table>
      <caption>${esc(t.caption)}</caption>
      <thead><tr>${t.head.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${md(c, cite)}</th>` : `<td>${md(c, cite)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }
  if (b.cards) return cardsHtml();
  if (b.catalog) return catalogHtml();
  throw new Error(`Unknown block in page "${page.slug}": ${JSON.stringify(b).slice(0, 80)}`);
}

/* ---------- Dataset catalog ---------- */
const orNot = (v) => (v && String(v).trim() ? esc(v) : '<span class="muted">Not stated</span>');
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
    <p class="ds-links">${d.link ? `<a href="${esc(d.link)}" rel="noopener" target="_blank">Dataset page<span class="sr-only"> for ${esc(d.name)}</span></a>` : ''}${d.paper ? `<a href="${esc(d.paper)}" rel="noopener" target="_blank">Paper to cite<span class="sr-only"> for ${esc(d.name)}</span></a>` : ''}</p>
  </article>
</li>`;
}

function catalogHtml() {
  const list = [...DS.datasets].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
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

/* ---------- Page ---------- */
const navLinks = (p) => [
  { href: '/ccair/', label: 'Center home', hideSm: true },
  { href: '/ccair/students/', label: 'Student guide', current: !p.slug },
  { href: '/ccair/pathways/', label: 'Pathway Finder' },
  { href: '/', label: 'bampel.com', hideSm: true }
];

function page(p, idx) {
  const { cite, list, order } = makeCiter();
  const url = `${BASE}${p.slug ? p.slug + '/' : ''}`;
  const sections = p.sections.map((s) => {
    const id = s.id || slugify(s.h);
    return `<section id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h" class="reveal">${esc(s.h)}</h2>${s.blocks.map((b) => blockHtml(b, cite, p)).join('\n')}</section>`;
  }).join('\n  ');
  const toc = p.sections.length > 2 ? `<nav class="toc reveal" aria-label="On this page"><p class="toc-h">On this page</p><ul>${p.sections.map((s) => `<li><a href="#${s.id || slugify(s.h)}">${esc(s.h)}</a></li>`).join('')}</ul></nav>` : '';
  const roles = p.roles.map((slug) => { if (!ROLE[slug]) throw new Error(`Unknown role slug: ${slug}`); return ROLE[slug]; });
  const prev = S.pages[idx - 1], next = S.pages[idx + 1];
  const crumbs = p.slug
    ? `<li><a href="/ccair/">CCAIR</a></li><li><a href="/ccair/students/">Student guide</a></li><li aria-current="page">${esc(p.nav)}</li>`
    : `<li><a href="/ccair/">CCAIR</a></li><li aria-current="page">Student guide</li>`;
  const crumbLd = [{ '@type': 'ListItem', position: 1, name: 'CCAIR', item: `${SITE}/ccair/` }, { '@type': 'ListItem', position: 2, name: 'Student guide', item: BASE }];
  if (p.slug) crumbLd.push({ '@type': 'ListItem', position: 3, name: p.nav, item: url });
  const modified = p.slug === 'data' && DS.updated > S.updated ? DS.updated : S.updated;

  const body = `<main id="main" class="guide students" tabindex="-1"><div class="narrow">
  <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>
  <div class="guide-hero">
    <span class="eyebrow reveal"><span class="dot"></span>CCAIR Student Guide${p.slug ? ` · Part ${idx + 1} of ${S.pages.length}` : ''}</span>
    <h1 class="reveal" style="--d:.06s">${esc(p.title)}</h1>
    <p class="lede reveal" style="--d:.12s">${md(p.lede, cite)}</p>
    <p class="guide-meta reveal" style="--d:.16s"><span class="verified">Last verified: ${esc(S.verified)}</span> · Reviewed by Dr. Benjamin M. Ampel, Director of CCAIR</p>
    ${p.disclaimer ? `<div class="warn reveal" role="note"><b>General information, not legal advice.</b> ${esc(p.disclaimer.replace(/^General information, not legal advice\.\s*/, ''))}</div>` : ''}
  </div>
  ${toc}
  ${sections}
  <section aria-labelledby="roles-h"><h2 id="roles-h" class="reveal">Related Pathway Finder roles</h2>
    <p class="body reveal">Each role guide covers the work, the realistic first job, starter certifications and free practice.</p>
    <div class="related reveal">${roles.map((r) => `<a href="/ccair/pathways/${r.slug}/">${esc(r.name)}</a>`).join('')}</div>
  </section>
  ${list()}
  <nav class="pager reveal" aria-label="Guide pages">
    ${prev ? `<a class="prev" href="${pageUrl(prev)}"><span>Previous</span>${esc(prev.nav)}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${pageUrl(next)}"><span>Next</span>${esc(next.nav)}</a>` : `<a class="next" href="/ccair/"><span>Back to</span>CCAIR home</a>`}
  </nav>
  <nav class="guide-nav reveal" aria-label="Student guide contents"><p class="toc-h">Student guide contents</p><ol>${S.pages.map((x) => `<li><a href="${pageUrl(x)}"${x === p ? ' aria-current="page"' : ''}>${esc(x.nav)}</a></li>`).join('')}</ol></nav>
  <p class="reviewed">Last verified: ${esc(S.verified)}. Written for students by the <a href="/ccair/">Center for CyberAI Research (CCAIR)</a> at Georgia State University. Found an outdated fact? Tell us through the <a href="/ccair/#/contact">contact page</a>.</p>
</div></main>`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      person, org,
      { '@type': 'WebPage', '@id': url, url, name: p.title, description: p.desc, inLanguage: 'en-US', dateModified: modified,
        isPartOf: { '@type': 'WebSite', name: 'Benjamin M. Ampel', url: `${SITE}/` }, publisher: { '@id': org['@id'] }, reviewedBy: { '@id': person['@id'] },
        lastReviewed: S.updated, breadcrumb: { '@id': `${url}#breadcrumb` }, mainEntity: { '@id': `${url}#article` } },
      { '@type': 'Article', '@id': `${url}#article`, headline: p.title, description: p.desc, url, mainEntityOfPage: { '@id': url },
        author: { '@id': person['@id'] }, publisher: { '@id': org['@id'] }, datePublished: PUBLISHED, dateModified: modified,
        inLanguage: 'en-US', isAccessibleForFree: true, isPartOf: { '@type': 'CreativeWorkSeries', name: 'CCAIR Student Guide', url: BASE },
        audience: { '@type': 'EducationalAudience', educationalRole: 'student' }, about: { '@type': 'Thing', name: 'Cybersecurity careers and education' },
        image: `${SITE}/media/sharing-card.png`, citation: order.map((id) => S.refs[id].url) },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: crumbLd }
    ]
  };

  return `${baseHead({ title: p.metaTitle, ogTitle: p.title, desc: p.desc, url, ogType: 'article',
    css: [`/ccair/assets/pathways/pathways.css?v=${ASSET_V}-warm4`, `/ccair/assets/students/students.css?v=${ASSET_V}-1`] })}
<meta property="article:modified_time" content="${modified}">
${ld(graph)}
</head>
<body>
${baseTop(navLinks(p))}
${body}
${baseFoot({ note: `Last verified ${S.verified}`, scripts: [`/ccair/assets/pathways/pathways.js?v=${ASSET_V}-anon2`, ...(p.slug === 'data' ? [`/ccair/assets/students/students.js?v=${ASSET_V}-1`] : [])] })}`;
}

/* ---------- Checks ---------- */
for (const d of DS.datasets) {
  for (const k of ['name', 'category', 'description', 'link']) if (!d[k]) throw new Error(`datasets.json: "${d.name || '?'}" is missing ${k}`);
  for (const k of ['link', 'paper']) if (d[k] && !/^https?:\/\//.test(d[k])) throw new Error(`datasets.json: "${d.name}" ${k} is not an http(s) URL`);
  if (!d.caveats) console.warn(`datasets.json: "${d.name}" has no caveats; every entry should name a known weakness`);
}

/* ---------- Write ---------- */
fs.rmSync(out, { recursive: true, force: true });
S.pages.forEach((p, i) => {
  const dir = path.join(out, p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(p, i));
});
const n = writeSitemap();
console.log('Student guide build complete: %d pages, %d datasets, sitemap with %d URLs', S.pages.length, DS.datasets.length, n);
