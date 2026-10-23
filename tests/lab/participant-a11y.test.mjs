// Accessible names of every input the participant pages render (WCAG 1.3.1, 4.1.2). participant.js runs in Node with
// a stand-in DOM; each screen's markup is read as a string. Every input, select, and textarea must be named by
// aria-label, aria-labelledby, or a <label for="its id">, and that name must be the text the participant sees next
// to it (a production audit found a consent box named "on" and headphone answers named "0", "1", "2").
// Also a source check: every <label> written in the participant scripts and pages points at its input with for="".
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../../netlify/lib/lab/content.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// ---------- a stand-in page ----------
const els = {};
const el = id => els[id] || (els[id] = { id, value: '', disabled: false, textContent: '', innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, setAttribute() {}, focus() {} });
const stage = { set innerHTML(h) { this._h = h; for (const m of h.matchAll(/id="([^"]+)"/g)) delete els[m[1]]; }, get innerHTML() { return this._h; }, querySelector: () => null, querySelectorAll: () => [], parentNode: null, appendChild() {} };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} };
const sandbox = { window: win, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : el(id)), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/lab/s/x', search: '', origin: 'https://lab.test', href: 'https://lab.test/lab/s/x' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  performance: { now: () => 0 }, setTimeout, clearTimeout, URLSearchParams, URL, Blob, console, fetch: () => new Promise(() => {}) };
win.window = win;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const { ui, internals: I } = win.LabEngine;
const text = Object.fromEntries(C.ENGINE_TEXT.map(f => [f.key, f.def]));
I.S.content = { name: 'A study', text, minutesPerSession: 5, environment: {}, panel: null,
  consent: { approved: true, paragraphs: ['Please read this.'], agreeLabel: 'I am 18 or older and I agree to participate.', recording: { enabled: true, label: 'I agree to be recorded.', required: false } } };

// ---------- accessible names from markup ----------
const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = h => unescape(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '="([^"]*)"')); return m ? unescape(m[1]) : null; };
// [{ tag, name }] for every form control in the markup, skipping the hidden honeypot box (never seen or reached).
function controls(html) {
  const out = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m[0];
    if (/class="hp-input"/.test(tag) || attr(tag, 'type') === 'hidden') continue;
    const id = attr(tag, 'id');
    let name = attr(tag, 'aria-label');
    if (!name && attr(tag, 'aria-labelledby')) name = attr(tag, 'aria-labelledby').split(/\s+/).map(x => { const e = html.match(new RegExp('<(\\w+)[^>]*\\sid="' + x + '"[^>]*>([\\s\\S]*?)</\\1>')); return e ? plain(e[2]) : ''; }).join(' ').trim();
    if (!name && id) { const l = html.match(new RegExp('<label\\b[^>]*\\sfor="' + id + '"[^>]*>([\\s\\S]*?)</label>')); if (l) name = plain(l[1].replace(/<(select|textarea)\b[\s\S]*?<\/\1>/g, '')); }
    out.push({ tag, id, name: name || '' });
  }
  return out;
}
function allNamed(html, where) {
  const cs = controls(html);
  assert(cs.length, where + ': has inputs');
  for (const c of cs) assert(c.name, `${where}: ${c.tag} has no accessible name`);
  const ids = cs.map(c => c.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, where + ': ids are unique');
  return cs;
}

// ---------- sign-in ----------
I.showLogin();
assert.deepEqual(allNamed(stage.innerHTML, 'email sign-in').map(c => c.name), ['Email']);
I.showLogin(null, 'code');
assert.deepEqual(allNamed(stage.innerHTML, 'code sign-in').map(c => c.name), ['Access code']);

// ---------- consent, with the separate recording consent ----------
I.showConsent();
{
  const cs = allNamed(stage.innerHTML, 'consent');
  assert.equal(cs[0].name, 'I am 18 or older and I agree to participate.', 'the consent box is named by its visible label, not "on"');
  assert.equal(cs[1].name, 'I agree to be recorded. (optional: without it you type instead of speaking)');
}

// ---------- headphone check (Huggins pitch): answers named 1, 2, 3 as shown, while their values stay 0, 1, 2 ----------
{
  const L = { HEADPHONE_TRIALS: 6, HEADPHONE_PASS: 5, score: () => 6, AudioContext: null, trialBuffer: () => null };
  I.headphoneStep(L, {}, () => {});
  const cs = allNamed(stage.innerHTML, 'headphone check');
  assert.deepEqual(cs.map(c => c.name), ['1', '2', '3']);
  assert.deepEqual(cs.map(c => attr(c.tag, 'value')), ['0', '1', '2'], 'the stored answers are unchanged');
  assert(/<legend class="q">Which noise had the faint tone\?<\/legend>/.test(stage.innerHTML), 'the question is the group label');
}

// ---------- the microphone check's level meter ----------
I.micStep({ micLevel: () => new Promise(() => {}) }, {}, 0, () => {});
assert(/<label class="field" for="micm">Microphone level<\/label><meter id="micm"/.test(stage.innerHTML), 'the level meter is labelled');

// ---------- every survey question type ----------
const opt = (value, label) => ({ value, label });
const qs = [
  { id: 'choice', type: 'choice', text: 'Pick one', options: [opt('a', 'Apple'), opt('b', 'Banana <b>')] },
  { id: 'short_sel', type: 'select', text: 'Short list', options: [opt('1', 'One'), opt('2', 'Two')] },
  { id: 'long_sel', type: 'select', text: 'Long list', options: Array.from({ length: 12 }, (_, i) => opt(String(i), 'Item ' + i)) },
  { id: 'multi', type: 'multi', text: 'All that apply', options: [opt('x', 'Ex'), opt('y', 'Why')] },
  { id: 'num', type: 'number', min: 0, max: 9, text: 'How many?' },
  { id: 'line', type: 'text', long: false, text: 'Your name' },
  { id: 'essay', type: 'text', long: true, text: 'Tell us more' },
  { id: 'scale', type: 'scale', n: 3, lo: 'Low', hi: 'High', text: 'Rate it' },
  { id: 'labeled', type: 'scale', n: 2, labels: ['No', 'Yes'], text: 'Agree?' },
  { id: 'mx', type: 'matrix', text: 'Grid', rows: [{ id: 'mx_a', text: 'Row A' }], options: [opt('1', 'Never'), opt('2', 'Often')] }
];
{
  const html = ui.questionsHtml(qs);
  const cs = allNamed(html, 'survey questions'), by = id => cs.filter(c => attr(c.tag, 'name') === id).map(c => c.name);
  assert.deepEqual(by('choice'), ['Apple', 'Banana <b>']);
  assert.deepEqual(by('short_sel'), ['One', 'Two'], 'a short dropdown is radio buttons, each named');
  assert.deepEqual(by('long_sel'), ['Long list']);
  assert.deepEqual(by('multi'), ['Ex', 'Why']);
  assert.deepEqual(by('num'), ['How many?']); assert.deepEqual(by('line'), ['Your name']); assert.deepEqual(by('essay'), ['Tell us more']);
  assert.deepEqual(by('scale'), ['1 Low', '2', '3 High'], 'scale points: number and end label');
  assert.deepEqual(by('labeled'), ['1 No', '2 Yes']);
  assert.deepEqual(by('mx_a'), ['Never', 'Often']);
  // the confidence line and slider are role="slider" with an aria-label; ranking buttons say which option they move
  const more = ui.questionsHtml([{ id: 'conf', type: 'confidence', text: 'How sure?' }, { id: 'sl', type: 'slider', text: 'How far?', min: 0, max: 10, step: 1 }, { id: 'rk', type: 'rank', text: 'Order', options: [opt('p', 'Pear')] }]);
  assert.deepEqual([...more.matchAll(/role="slider"[^>]*aria-label="([^"]*)"/g)].map(m => m[1]), ['How sure?', 'How far?']);
  assert(more.includes('aria-label="Move Pear up"') && more.includes('aria-label="Move Pear down"'));
}

// ---------- source check: labels point at their inputs ----------
{
  const files = [
    ...['participant.js', 'signin.js'].map(f => 'engine/' + f),
    ...readdirSync(here('../../static/lab/engine/types')).filter(f => f.endsWith('.js') && !f.endsWith('-admin.js')).map(f => 'engine/types/' + f),
    's/index.html', 'studies/verification/index.html', 'studies/demo-phishing/index.html', 'signin/index.html', 'support/index.html'
  ];
  for (const f of files) {
    const src = readFileSync(here('../../static/lab/' + f), 'utf8');
    for (const m of src.matchAll(/<label\b[^>]*>/g)) {
      if (/Leave this box empty/.test(src.slice(m.index, m.index + 80))) continue;   // the honeypot, hidden from everyone
      assert(/\sfor="/.test(m[0]), `${f}: ${m[0]} names no input (add for="" and an id on the input)`);
    }
  }
  console.log(`labels: every <label> in ${files.length} participant and sign-in files points at its input`);
}
console.log('participant a11y: sign-in, consent, recording consent, headphone check, microphone meter, and every question type have their visible text as the accessible name');
