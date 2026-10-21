// The researcher pages (guide, sign-in, account, support), the contact links, and the browser scripts.
// Contact links are mailto: links to the lab director; nothing is sent from a page and a participant's email is never put in one.
// The pages are also loaded from the real dev server (npm run lab:dev) to check that they are served.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const C = createRequire(import.meta.url)(here('../../static/lab/assets/contact.js'));
const read = p => readFileSync(here('../../static/lab/' + p), 'utf8');

// ---------- the link builder ----------
const parse = href => { const u = new URL(href); return { to: u.pathname, subject: u.searchParams.get('subject'), body: u.searchParams.get('body'), raw: href }; };
for (const [name, lines] of [['access', ['Name:', 'Institution and email:', 'Study (title and short description):', 'IRB status:', 'What you need:']], ['signin', ['Name:', 'Email you use to sign in:', 'What happened:']], ['contact', ['Name:', 'Your message:']]]) {
  const p = parse(C[name]());
  assert.equal(p.to, 'bampel@gsu.edu'); assert.equal(p.subject, 'CCAIR Behavioral Lab'); assert.equal(p.body, lines.join('\n'), name);
  assert(!/[ \n"<>]/.test(p.raw), `${name}: no raw space, newline, or quote in the link`);
  assert(p.raw.startsWith('mailto:bampel@gsu.edu?subject=CCAIR%20Behavioral%20Lab&body='), name);
  assert(p.raw.includes('%0A'), 'line breaks are encoded');
}
{
  const withId = parse(C.participant('Phishing pilot', 'P-0123456789abcdef'));
  assert.equal(withId.body, 'Study: Phishing pilot\nStudy ID: P-0123456789abcdef\n\nYour question:\n');
  const anon = parse(C.participant('Phishing pilot', ''));
  assert.equal(anon.body, 'Study: Phishing pilot\n\nYour question:\n'); assert(!anon.body.includes('Study ID'), 'no ID when not signed in');
  assert(!parse(C.participant('x', 'a@b.edu')).body.includes('a@b.edu'), 'anything that is not an ID is dropped');
  assert(!parse(C.participant('x', 'not valid id!')).body.includes('Study ID'));
  assert.equal(parse(C.participant('Two\nlines\r\nname', 'P-abcd1234')).body.split('\n')[0], 'Study: Two lines name', 'a study name cannot add lines');
  assert.equal(parse(C.participant('Study & "quotes" <b> #1 %', '')).body.split('\n')[0], 'Study: Study & "quotes" <b> #1 %', 'special characters survive encoding');
  assert(!/[ \n"<>#]/.test(C.participant('Study & "quotes" <b> #1', 'P-abcd1234').slice(7)), 'and are percent-encoded');
}
// no participant email can reach a link: the builder takes only a study name and an ID, and the page code passes the ID taken from the token
{
  const src = read('engine/participant.js'), fn = src.slice(src.indexOf('function updateContact'), src.indexOf('function errorBox')).replace(/\/\/.*$/gm, '');
  assert(/LC\.participant\(S\.content && S\.content\.name, id\)/.test(fn), 'the link gets the study name and the ID only');
  assert(/S\.token\.split\('\.'\)\[0\]/.test(fn), 'the ID is the first part of the sign-in token');
  assert(!/email|creds|\.value/i.test(fn), 'the contact code never touches an email or a form field');
  for (const p of ['s/index.html', 'studies/verification/index.html']) assert(read(p).indexOf('/lab/assets/contact.js') > 0 && read(p).indexOf('/lab/assets/contact.js') < read(p).indexOf('/lab/engine/participant.js'), `${p} loads the contact script before the participant app`);
}

// ---------- the static pages carry the same links, written out in HTML ----------
const hrefs = html => [...html.matchAll(/href="(mailto:[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const PAGES = { 'index.html': ['access', 'contact'], 'guide/index.html': ['access', 'contact'], 'signin/index.html': ['access', 'signin', 'contact'], 'support/index.html': ['access', 'contact', 'signin'], 'account/index.html': ['signin'] };
for (const [file, want] of Object.entries(PAGES)) {
  const html = read(file), found = hrefs(html);
  assert(found.length >= want.length, `${file} has mailto links`);
  for (const h of found) assert([C.access(), C.signin(), C.contact()].includes(h), `${file}: ${h} is one of the prepared links`);
  for (const w of want) assert(found.includes(C[w]()), `${file} has the "${w}" link`);
  assert(/bampel@gsu\.edu/.test(html) && /university inbox/.test(html), `${file} says where messages go`);
  assert(/Nothing is sent from this page/.test(html) || file === 'index.html', `${file} says nothing is sent`);
}
assert(/Request researcher access/.test(read('guide/index.html')) && /Contact the lab/.test(read('guide/index.html')));
assert(/Request access/.test(read('signin/index.html')) && /Trouble signing in\?/.test(read('signin/index.html')));
assert(/Request researcher access/.test(read('index.html')) && /Contact the lab/.test(read('index.html')) && /\/lab\/guide\//.test(read('index.html')));
// the console and the admin pages link to the guide
assert(/\/lab\/guide\//.test(read('engine/admin.js')));
console.log('contact links: encoding, templates, participant link without email, static pages match the builder');

// ---------- content of the new pages ----------
{
  const guide = read('guide/index.html');
  for (const id of ['what', 'access', 'create', 'types', 'import', 'games', 'pilot', 'export', 'irb', 'faq']) assert(guide.includes(`id="${id}"`), `guide section ${id}`);
  for (const w of ['Qualtrics', 'LimeSurvey', 'REDCap', 'spreadsheet', 'self-test', 'codebook', 'Netlify access', 'asynchronous', 'IRB']) assert(new RegExp(w, 'i').test(guide), `guide mentions ${w}`);
  for (const f of ['guide', 'signin', 'account', 'support']) {
    const html = read(`${f}/index.html`);
    assert(!/—/.test(html), `${f}: no em dashes`);
    assert(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(html), `${f}: no emoji`);
    assert(!/(https?:)?\/\/(?!bampel\.com)[a-z0-9.-]+\.[a-z]{2,}\//i.test(html.replace(/https:\/\/bampel\.com\/lab\/[^"]*/g, '')), `${f}: no other origins`);
    assert(/<html lang="en">/.test(html) && /<meta name="viewport"/.test(html) && /<title>[^<]+<\/title>/.test(html) && /<main/.test(html), `${f}: basics`);
    assert(!/style="/.test(html), `${f}: styling is in the CSS files`);
  }
  assert(/noindex/.test(read('signin/index.html')) && /noindex/.test(read('account/index.html')));
  const toml = readFileSync(here('../../netlify.toml'), 'utf8');
  assert(toml.includes('for = "/lab/signin/*"') && toml.includes('for = "/lab/account/*"'), 'sign-in and account pages have their own headers');
}

// ---------- every browser script parses ----------
{
  const files = [...readdirSync(here('../../static/lab/engine')).filter(f => f.endsWith('.js')).map(f => 'engine/' + f), ...readdirSync(here('../../static/lab/engine/types')).filter(f => f.endsWith('.js')).map(f => 'engine/types/' + f), 'assets/contact.js'];
  for (const f of files) { const r = spawnSync(process.execPath, ['--check', here('../../static/lab/' + f)], { encoding: 'utf8' }); assert.equal(r.status, 0, `node --check ${f}\n${r.stderr}`); }
  for (const f of ['auth.js', 'signin.js', 'account.js']) assert(files.includes('engine/' + f));
  console.log(`node --check: ${files.length} browser scripts parse`);
}

// ---------- the pages are served by the dev server ----------
{
  const port = 18000 + Math.floor(Math.random() * 1500);
  const child = spawn(process.execPath, [here('./devserver.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('dev server did not start')), 8000); child.stdout.on('data', d => { if (String(d).includes('Lab dev server')) { clearTimeout(t); res(); } }); child.on('exit', c => rej(new Error('dev server exited ' + c))); });
    const get = async p => { const r = await fetch(`http://localhost:${port}${p}`); return { status: r.status, text: await r.text() }; };
    const expect = { '/lab/': 'For researchers', '/lab/signin/': 'Researcher sign-in', '/lab/account/': 'Account settings', '/lab/guide/': 'Researcher guide', '/lab/support/': 'Support', '/lab/admin/': 'Lab admin', '/lab/s/phish-pilot': 'Research study', '/lab/studies/verification/': 'Research study' };
    for (const [p, text] of Object.entries(expect)) { const r = await get(p); assert.equal(r.status, 200, p); assert(r.text.includes(text), `${p} contains "${text}"`); }
    for (const p of ['/lab/engine/auth.js', '/lab/engine/signin.js', '/lab/engine/account.js', '/lab/assets/contact.js', '/lab/assets/pages.css', '/lab/CODEBOOK.md', '/lab/templates/survey-template.csv']) assert.equal((await get(p)).status, 200, p);
    // the researcher flow end to end against the dev server: owner key -> invitation -> account -> My studies
    const api = async (p, o = {}) => { const r = await fetch(`http://localhost:${port}/api/lab/${p}`, { method: o.body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(o.key ? { 'x-admin-key': o.key } : {}), ...(o.token ? { authorization: 'Bearer ' + o.token } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); return { status: r.status, json: await r.json() }; };
    const key = 'local-owner-key-0123456789';
    const inv = await api('_lab/researchers/invite', { key, body: { name: 'Dev Researcher', email: 'dev@example.edu', studyRoles: { verification: 'viewer' } } });
    assert.equal(inv.status, 200);
    const pw = 'a long dev passphrase 123';
    const acc = await api('_lab/auth/accept', { body: { token: inv.json.link.path.split('=')[1], password: pw, password2: pw } });
    assert.equal(acc.status, 200);
    const mine = await api('_lab/mystudies', { token: acc.json.token });
    assert.deepEqual(mine.json.map(s => [s.id, s.role]), [['verification', 'viewer']]);
    console.log('dev server: pages and scripts served (200); invite, accept, and My studies work');
  } finally { child.kill(); }
}
console.log('pages-contact: all checks passed');
