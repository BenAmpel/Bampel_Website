// Builds the CCAIR Cyber Career Pathway Finder as plain HTML so search engines and AI answer engines can read it.
// Input:  static/ccair/data/pathways.json (the single source for roles, certs, resources, pay and quiz items)
// Output: static/ccair/pathways/index.html, static/ccair/pathways/<slug>/index.html, static/ccair/sitemap.xml
// Run by `npm run build:ccair` (netlify.toml build command), before Hugo copies static/ into public/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ccair = path.join(root, 'static', 'ccair');
const out = path.join(ccair, 'pathways');
const D = JSON.parse(fs.readFileSync(path.join(ccair, 'data', 'pathways.json'), 'utf8'));
const SITE = 'https://bampel.com';
const HUB = `${SITE}/ccair/pathways/`;
const params = fs.readFileSync(path.join(root, 'config', '_default', 'params.yaml'), 'utf8');
const GA = (params.match(/google_analytics:\s*'([^']+)'/) || [])[1] || '';
const ASSET_V = D.updated.replace(/-/g, '');

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + n.toLocaleString('en-US');
const HIRING = { entry: 'Entry-level', step: 'Usually a second job', emerging: 'Emerging field' };
const CODE = {
  little: 'Very little. Comfort with computers matters more than programming; basic scripting can help later.',
  some: "Some. Basic scripting (for example Python or Bash) helps, but you don't need to be a software developer.",
  lots: 'Yes. Programming is a regular part of this job.'
};
const CODE_SHORT = { little: 'Little or none', some: 'Some scripting', lots: 'Regular programming' };
const FAMILY = {
  'soc-analyst': 'Defend', 'incident-responder': 'Defend', 'systems-security-administrator': 'Defend',
  'digital-forensics-investigator': 'Investigate', 'threat-intelligence-analyst': 'Investigate',
  'penetration-tester': 'Test', 'ai-security-specialist': 'Test',
  'application-security-engineer': 'Build', 'cloud-security-engineer': 'Build', 'ot-ics-security-specialist': 'Build',
  'grc-analyst': 'Govern', 'it-auditor': 'Govern', 'privacy-analyst': 'Govern', 'security-awareness-specialist': 'Govern'
};
const TAPS = D.roles.reduce((n, r) => n + r.items.length, 0) + D.pairs.length + D.context.length;
const BY = Object.fromEntries(D.roles.map((r) => [r.slug, r]));
const short = (r) => r.short || r.name;
// 'an IT Auditor', 'an AI Security Specialist', 'a SOC Analyst'.
const an = (name) => (/^[AEIOU]/.test(name) ? 'an ' : 'a ') + name;
const reviewer = { '@type': 'Person', name: 'Benjamin M. Ampel', url: `${SITE}/`, jobTitle: 'Director, Center for CyberAI Research (CCAIR)' };
const org = { '@type': 'ResearchOrganization', name: 'Center for CyberAI Research (CCAIR)', url: `${SITE}/ccair/` };
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function head({ title, desc, url, ogTitle }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#FAF8F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151311" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="CCAIR, Center for CyberAI Research">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/media/sharing-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/ccair/uploads/ccair-mark.png">
<link rel="stylesheet" href="/ccair/assets/pathways/pathways.css?v=${ASSET_V}-warm">
${GA ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>` : ''}`;
}

function top(current) {
  return `<a class="skip" href="#main">Skip to content</a>
<div class="backdrop" aria-hidden="true"><div class="glow g1"></div><div class="glow g2"></div></div>
<header class="top"><div class="wrap">
  <a class="brand" href="/ccair/"><img src="/ccair/uploads/ccair-mark.png" alt="" width="30" height="30">CCAIR</a>
  <nav aria-label="Main">
    <a href="/ccair/" class="hide-sm">Center home</a>
    <a href="/ccair/pathways/"${current === 'hub' ? ' aria-current="page"' : ''}>Pathway Finder</a>
    <a href="/ccair/pathways/#roles" class="hide-sm">All roles</a>
    <a href="/">bampel.com</a>
  </nav>
</div></header>`;
}

function foot() {
  return `<footer><div class="wrap">
  <span>Center for CyberAI Research (CCAIR) · Georgia State University · Reviewed ${esc(D.updated)}</span>
  <span><a href="/ccair/">CCAIR</a> · <a href="/ccair/pathways/">Pathway Finder</a> · <a href="/teaching/">Teaching</a> · <a href="/privacy/">Privacy</a></span>
</div></footer>
<script src="/ccair/assets/pathways/pathways.js?v=${ASSET_V}" defer></script>
</body>
</html>
`;
}

function faqHtml(faq) {
  return `<div class="faq">${faq.map((f, i) => `<details class="reveal" style="--d:${(i * 0.05).toFixed(2)}s"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`;
}
const faqLd = (faq) => ({ '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });

function roleCard(r, i) {
  return `<a class="role-card reveal" style="--d:${((i % 3) * 0.08).toFixed(2)}s" href="/ccair/pathways/${r.slug}/" data-hiring="${r.hiring}">
  <span class="badge ${r.hiring}">${HIRING[r.hiring]}</span>
  <h3>${esc(r.name)}</h3>
  <p>${esc(r.tagline)}</p>
  <span class="go">How to get in &rarr;</span>
</a>`;
}

/* ---------- Hub ---------- */
function hub() {
  const entry = D.roles.filter((r) => r.hiring === 'entry').map((r) => r.name);
  const faq = [
    { q: 'Which cybersecurity job is right for me?', a: `Start with what you enjoy rather than what sounds impressive. The CCAIR Pathway Finder asks ${TAPS} quick, plain-language questions about activities you would enjoy and ranks 14 cybersecurity roles for you, with the realistic first job, starter certifications and free practice for each.` },
    { q: 'What cybersecurity jobs are entry-level?', a: `Roles commonly hired straight from school or a bootcamp include ${entry.join(', ')}. Others, such as penetration tester and incident responder, are usually reached after one to three years in a related first job.` },
    { q: 'Do I need to know how to code to work in cybersecurity?', a: 'No. Many roles, including GRC analyst, IT auditor, privacy analyst, security awareness and SOC analyst, need little or no programming. Coding matters most in application security, cloud security and AI security.' },
    { q: 'Which certification should I get first?', a: 'For most beginners, CompTIA Security+ or ISC2 Certified in Cybersecurity (CC) is a sensible first credential. The best choice depends on the role: each role guide lists starter and later certifications.' },
    { q: 'Is this quiz a test of my ability?', a: 'No. It is an interest guide, not an aptitude test. It compares what you say you would enjoy with what each job involves, based on the NIST NICE Workforce Framework. Use it to decide what to explore next.' },
    { q: 'Do you store my answers?', a: 'No. Scoring happens in your browser and nothing you answer is saved or sent. If you copy a results link, your answers are packed into the link itself.' }
  ];
  const roleList = D.roles.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${HUB}${r.slug}/`, name: `How to become ${an(r.name)}` }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': HUB, url: HUB, name: 'Cyber Career Pathway Finder', description: 'A free quiz and guide that helps beginner cybersecurity students find entry-level roles that fit their interests.', inLanguage: 'en-US', dateModified: D.updated, isPartOf: { '@type': 'WebSite', name: 'Benjamin M. Ampel', url: `${SITE}/` }, publisher: org, reviewedBy: reviewer, about: { '@type': 'Thing', name: 'Cybersecurity careers' }, audience: { '@type': 'EducationalAudience', educationalRole: 'student' } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'bampel.com', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'CCAIR', item: `${SITE}/ccair/` },
        { '@type': 'ListItem', position: 3, name: 'Pathway Finder', item: HUB } ] },
      { '@type': 'ItemList', name: 'Cybersecurity role guides', itemListElement: roleList },
      faqLd(faq)
    ]
  };
  const quizData = { roles: D.roles.map(({ slug, name, tagline, hiring, code, bls, feeder, certsStart, resources, items, close }) => ({ slug, name, tagline, hiring, code, bls, feeder, certsStart, resources, items, close })), pairs: D.pairs, context: D.context, bls: D.bls, sources: { blsDate: D.sources.blsDate } };

  return `${head({ title: 'Cybersecurity Career Quiz: Find Your Entry-Level Cyber Role', ogTitle: 'Find where you fit in cybersecurity', url: HUB,
    desc: 'Free 5-minute quiz for beginner cybersecurity students. Ranks 14 cyber roles by your interests, with the first job, starter certs and free practice.' })}
${ld(graph)}
</head>
<body>
${top('hub')}
<main id="main">
  <section class="hero"><div class="wrap">
    <span class="eyebrow reveal"><span class="dot"></span>CCAIR Cyber Career Pathway Finder</span>
    <h1 class="reveal" data-split style="--d:.08s">Find where you <span class="grad">fit</span> in cybersecurity</h1>
    <p class="lede reveal" style="--d:.16s">Cybersecurity is not one job. It is fourteen very different ones, from catching scams to auditing companies to protecting power plants. Answer a few plain questions and see which ones suit you, and exactly how to get your first one.</p>
    <div class="hero-cta reveal" style="--d:.24s">
      <a class="btn btn-primary" href="#finder" data-start-quiz>Start the 5-minute finder <span class="arrow" aria-hidden="true">&rarr;</span></a>
      <a class="btn btn-ghost" href="#roles">Browse all 14 roles</a>
    </div>
    <div class="stats reveal" style="--d:.32s">
      <div class="stat"><b data-count="${D.roles.length}">${D.roles.length}</b><span>Roles explained</span></div>
      <div class="stat"><b data-count="5" data-pre="~" data-suf=" min">~5 min</b><span>${TAPS} quick taps</span></div>
      <div class="stat"><b>0</b><span>Answers stored</span></div>
    </div>
  </div></section>

  <section class="block" id="how"><div class="wrap">
    <p class="kicker reveal">How it works</p>
    <h2 class="reveal">No jargon. No experience needed.</h2>
    <div class="steps3">
      <div class="card reveal"><span class="num">01</span><h3>Tap what appeals</h3><p>Short, everyday statements like "Teaching people how to spot scam emails." Answer Not for me, Maybe or Yes.</p></div>
      <div class="card reveal" style="--d:.1s"><span class="num">02</span><h3>Settle the close calls</h3><p>A few this-or-that choices separate jobs that sound alike, like building a security plan versus checking one.</p></div>
      <div class="card reveal" style="--d:.2s"><span class="num">03</span><h3>Get a real plan</h3><p>Your top 3 roles, why they fit, the realistic first job, which certifications to start with and free places to practise.</p></div>
    </div>
  </div></section>

  <section class="block" id="finder"><div class="narrow">
    <p class="kicker reveal">The finder</p>
    <h2 class="reveal">Which cyber role fits you?</h2>
    <div class="quiz-shell reveal">
      <div class="quiz" id="quiz" aria-live="polite">
        <noscript><p>The quiz needs JavaScript. You can still browse every role guide below.</p></noscript>
      </div>
    </div>
  </div></section>

  <section class="block" id="roles"><div class="wrap">
    <p class="kicker reveal">All roles</p>
    <h2 class="reveal">Fourteen ways into cybersecurity</h2>
    <p class="sub reveal">Each guide covers what the job is like, the honest first-job route, certifications and free practice. Labels show how often graduates are hired straight in.</p>
    <div class="filters reveal" role="group" aria-label="Filter roles">
      <button class="chip" data-filter="all" aria-pressed="true">All 14</button>
      <button class="chip" data-filter="entry" aria-pressed="false">Entry-level</button>
      <button class="chip" data-filter="step" aria-pressed="false">Usually a second job</button>
      <button class="chip" data-filter="emerging" aria-pressed="false">Emerging</button>
    </div>
    <div class="roles">
      ${D.roles.map(roleCard).join('\n      ')}
    </div>
  </div></section>

  <section class="block" id="faq"><div class="narrow">
    <p class="kicker reveal">Questions</p>
    <h2 class="reveal">Common questions from students</h2>
    ${faqHtml(faq)}
    <div class="note reveal"><b>How this was built.</b> Roles follow the <a href="${D.sources.nice}" rel="noopener">NIST NICE Workforce Framework</a>; first-job routes draw on <a href="${D.sources.cyberseek}" rel="noopener">CyberSeek</a>; pay figures are US Bureau of Labor Statistics medians (${esc(D.sources.blsDate)}). Reviewed ${esc(D.updated)} by Dr. Benjamin M. Ampel, Director of CCAIR, who teaches CIS 3620 Career Pathways at Georgia State University. It is an interest guide, not a test of ability.</div>
  </div></section>
</main>
<script type="application/json" id="pf-data">${JSON.stringify(quizData).replace(/</g, '\\u003c')}</script>
${foot()}`;
}

/* ---------- Citations ----------
   D.refs: { id: { title, publisher, url, period } }. Each role page numbers its references in order of
   first use and renders them as [1], [2] links to the References list at the bottom of the page. */
function makeCiter() {
  const order = [];
  const cite = (ids) => (ids || []).map((id) => {
    if (!D.refs || !D.refs[id]) throw new Error(`Unknown reference id: ${id}`);
    let n = order.indexOf(id); if (n < 0) { order.push(id); n = order.length - 1; }
    return `<sup class="cite"><a href="#ref-${n + 1}" aria-label="Source ${n + 1}">[${n + 1}]</a></sup>`;
  }).join('');
  const list = () => order.length ? `<section id="references"><h2 class="reveal">References</h2>
    <p class="body reveal">Every figure on this page comes from these sources. Figures for broad government categories cover the whole occupation, not only this specialty.</p>
    <ol class="refs">${order.map((id, i) => { const x = D.refs[id];
      return `<li id="ref-${i + 1}"><span class="mono">[${i + 1}]</span> ${esc(x.publisher)}. <a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.title)}</a>${x.period ? `. ${esc(x.period)}` : ''}.</li>`; }).join('')}</ol></section>` : '';
  return { cite, list };
}

function numbersHtml(r, cite) {
  const N = r.numbers;
  if (!N) return '';
  const row = (f) => `<div class="reveal"><dt>${esc(f.label)}</dt><dd>${f.value}${cite(f.refs)}${f.note ? `<small>${esc(f.note)}</small>` : ''}</dd></div>`;
  return `<section id="numbers"><h2 class="reveal">By the numbers</h2>
    <dl class="numbers">${N.stats.map(row).join('')}</dl>
    ${N.where ? `<h3 class="reveal sub-h">Where the jobs are</h3><p class="body reveal">${N.where.text}${cite(N.where.refs)}</p>` : ''}
    ${N.who ? `<h3 class="reveal sub-h">Who hires</h3><ul class="list">${N.who.map((w) => `<li class="reveal">${w.text}${cite(w.refs)}</li>`).join('')}</ul>` : ''}
    ${N.caveat ? `<p class="reviewed reveal">${esc(N.caveat)}</p>` : ''}
  </section>`;
}

/* ---------- Role guide ---------- */
function rolePage(r) {
  const { cite, list } = makeCiter();
  const url = `${HUB}${r.slug}/`;
  const pay = r.bls ? D.bls[r.bls] : null;
  const firstJob = { entry: `Often, yes. ${r.feeder}`, step: `Usually not. ${r.feeder}`, emerging: `Rarely, so far. ${r.feeder}` }[r.hiring];
  const faq = [
    { q: `Can I get ${an(r.name)} job straight out of school?`, a: firstJob },
    { q: `Do I need to know how to code to become ${an(r.name)}?`, a: CODE[r.code] },
    { q: `What certification should I get first to become ${an(r.name)}?`, a: `Good starting points: ${r.certsStart.join('; ')}.${r.certsLater.length ? ` Later, with experience: ${r.certsLater.join('; ')}.` : ''}` },
    { q: `How much does ${an(r.name)} make?`, a: pay
      ? `The US Bureau of Labor Statistics reports a median of ${money(pay.median)} a year (${D.sources.blsDate}) for ${pay.occupation}, the closest official category. Starting pay is usually lower and varies by city and employer.`
      : 'The US Bureau of Labor Statistics has no separate category for this role. The IAPP (International Association of Privacy Professionals) publishes salary surveys for privacy jobs.' }
  ];
  const fam = FAMILY[r.slug];
  const related = D.roles.filter((x) => x.slug !== r.slug && (FAMILY[x.slug] === fam || (r.close && r.close.role === x.slug))).slice(0, 4);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: `How to become ${an(r.name)}`, description: r.summary, inLanguage: 'en-US', dateModified: D.updated, publisher: org, reviewedBy: reviewer, isPartOf: { '@id': HUB }, mainEntity: { '@id': `${url}#occupation` } },
      Object.assign({ '@type': 'Occupation', '@id': `${url}#occupation`, name: r.name, description: r.summary, occupationalCategory: r.nice.join('; '),
        qualifications: r.certsStart.join('; '), skills: r.day.join('; '), occupationLocation: { '@type': 'Country', name: 'United States' } },
        pay ? { estimatedSalary: { '@type': 'MonetaryAmountDistribution', name: `BLS median, ${pay.occupation}`, currency: 'USD', duration: 'P1Y', median: pay.median } } : {}),
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'CCAIR', item: `${SITE}/ccair/` },
        { '@type': 'ListItem', position: 2, name: 'Pathway Finder', item: HUB },
        { '@type': 'ListItem', position: 3, name: r.name, item: url } ] },
      faqLd(faq)
    ]
  };
  const desc = `How to become ${an(short(r))}: what the work is like, the realistic first job, which certs to start with and free practice.`;
  return `${head({ title: `How to Become ${an(short(r))}: First Job and Certs`, ogTitle: `How to become ${an(r.name)}`, url, desc })}
${ld(graph)}
</head>
<body>
${top('role')}
<main id="main" class="guide"><div class="narrow">
  <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/ccair/">CCAIR</a></li><li><a href="/ccair/pathways/">Pathway Finder</a></li><li aria-current="page">${esc(r.name)}</li></ol></nav>
  <div class="guide-hero">
    <span class="badge ${r.hiring} reveal">${HIRING[r.hiring]}</span>
    <h1 class="reveal" data-split style="--d:.06s">How to become ${/^[AEIOU]/.test(r.name) ? 'an' : 'a'} <span class="grad">${esc(r.name)}</span></h1>
    <p class="lede reveal" style="--d:.12s">${esc(r.summary)}</p>
    <dl class="keyfacts reveal" style="--d:.18s">
      <div><dt>First job?</dt><dd>${HIRING[r.hiring]}<small>${esc(r.feeder)}</small></dd></div>
      <div><dt>Coding</dt><dd>${CODE_SHORT[r.code]}</dd></div>
      <div><dt>Start with</dt><dd>${esc(r.certsStart[0])}</dd></div>
      <div><dt>Median US pay</dt><dd>${pay ? `${money(pay.median)}${pay.ref ? cite([pay.ref]) : ''}<small>BLS ${esc(D.sources.blsDate)}, ${esc(pay.occupation)}</small>` : 'No BLS category<small>See IAPP salary surveys</small>'}</dd></div>
    </dl>
  </div>

  ${numbersHtml(r, cite)}

  <section><h2 class="reveal">What the job is like</h2>
    <p class="body reveal">${esc(r.tagline)} A typical week might include:</p>
    <ul class="list">${r.day.map((d, i) => `<li class="reveal" style="--d:${(i * 0.06).toFixed(2)}s">${esc(d)}</li>`).join('')}</ul>
  </section>

  <section><h2 class="reveal">How to get in</h2>
    <p class="body reveal">${esc(r.feeder)}</p>
    <ol class="list">${r.steps.map((d, i) => `<li class="reveal" style="--d:${(i * 0.06).toFixed(2)}s">${esc(d)}</li>`).join('')}</ol>
    ${r.close ? `<div class="note reveal"><b>Close cousin:</b> ${esc(r.close.note)} <a href="/ccair/pathways/${r.close.role}/">Compare with ${esc(BY[r.close.role].name)} &rarr;</a></div>` : ''}
  </section>

  <section><h2 class="reveal">Certifications</h2>
    <div class="certs">
      <div class="card reveal"><h3>Start with</h3><ul>${r.certsStart.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
      <div class="card reveal" style="--d:.08s"><h3>Later, with experience</h3><ul>${(r.certsLater.length ? r.certsLater : ['None needed yet; projects matter most']).map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
    </div>
  </section>

  <section><h2 class="reveal">Free places to practise and learn</h2>
    <div class="res">${r.resources.map((x, i) => `<a class="reveal" style="--d:${(i * 0.06).toFixed(2)}s" href="${esc(x.url)}" rel="noopener" target="_blank"><b>${esc(x.name)}</b><span>${esc(x.note)}</span></a>`).join('')}</div>
  </section>

  <section><h2 class="reveal">Habits that help in every cyber role</h2>
    <ul class="list">${D.habits.map((h) => `<li class="reveal">${esc(h)}</li>`).join('')}</ul>
  </section>

  <section><h2 class="reveal">Questions about this role</h2>${faqHtml(faq)}</section>

  ${list()}

  ${related.length ? `<section><h2 class="reveal">Related roles</h2><div class="related reveal">${related.map((x) => `<a href="/ccair/pathways/${x.slug}/">${esc(x.name)}</a>`).join('')}</div></section>` : ''}

  <div class="cta-band reveal"><div><h3>Not sure this is the one?</h3><p>Take the 5-minute Pathway Finder and see how ${esc(r.name)} ranks against 13 other roles.</p></div>
    <a class="btn btn-primary" href="/ccair/pathways/#finder">Take the finder <span class="arrow" aria-hidden="true">&rarr;</span></a></div>
  <p class="reviewed">NICE work role${r.nice.length > 1 ? 's' : ''}: ${esc(r.nice.join('; '))}. ${pay ? `Pay: <a href="${pay.url}" rel="noopener">BLS Occupational Outlook Handbook</a>, ${esc(D.sources.blsDate)}. ` : ''}Reviewed ${esc(D.updated)} by Dr. Benjamin M. Ampel, Director of CCAIR.</p>
</div></main>
${foot()}`;
}

/* ---------- Write ---------- */
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), hub());
for (const r of D.roles) {
  fs.mkdirSync(path.join(out, r.slug), { recursive: true });
  fs.writeFileSync(path.join(out, r.slug, 'index.html'), rolePage(r));
}
const urls = [`${SITE}/ccair/`, HUB, ...D.roles.map((r) => `${HUB}${r.slug}/`)];
fs.writeFileSync(path.join(ccair, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${D.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
console.log('Pathways build complete: hub + %d role pages, sitemap with %d URLs', D.roles.length, urls.length);
