// The participant page (static/lab/engine/participant.js) run in Node with a small stand-in for the DOM.
// Checks what no server test can: question markup is escaped, piped answers go in as text, groups and
// descriptive text render, and live display logic hides and clears questions and skips them in check().
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
const LabLogic = createRequire(import.meta.url)(here('../../static/lab/engine/logic.js'));

// A node with just enough of the DOM for flag(): attributes, children, a class list, focus and remove().
function makeNode() {
  const attrs = {}, classes = new Set();
  const n = { children: [], attrs, className: '', textContent: '', id: '', parent: null, focused: false,
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; }, removeAttribute(k) { delete attrs[k]; },
    appendChild(c) { c.parent = n; n.children.push(c); return c; }, remove() { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); },
    focus() { n.focused = true; }, scrollIntoView() {} };
  Object.defineProperty(n, 'classList', { value: { add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: c => classes.has(c) || n.className.split(/\s+/).includes(c) } });
  return n;
}
const stage = { innerHTML: '', querySelector: () => null };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} };
const sandbox = { window: win, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : null), createElement: () => makeNode(), head: { appendChild() {} } },
  location: { pathname: '/nowhere', search: '', origin: 'https://x.test' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => 0 },
  fetch: () => Promise.reject(new Error('offline')), setTimeout, URLSearchParams, Blob, URL, console };
sandbox.window.window = win;
vm.createContext(sandbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), sandbox);
const ui = win.LabEngine.ui;
// logic.js is loaded by the page at boot; load it the same way here
vm.runInContext('1', sandbox); win.LabLogic = LabLogic;

const opt = (v, l) => ({ value: v, label: l });
const items = [
  { id: 'intro', type: 'info', text: 'Hello <b>there</b> {{ed:pid}}\n\nSecond paragraph' },
  { id: 'name', type: 'text', long: false, text: 'Name?' },
  { id: 'story', type: 'text', long: true, text: 'Tell us <script>alert(1)</script>' },
  { id: 'smoker', type: 'choice', text: 'Smoke?', options: [opt('y', 'Yes <i>"really"</i>'), opt('n', 'No')] },
  { id: 'packs', type: 'number', min: 0, max: 5, text: 'Packs for {{q:name}}?', displayIf: { q: 'smoker', op: 'eq', value: 'y' } },
  { id: 'row_a', type: 'scale', n: 3, lo: 'Low', hi: 'High', labels: ['Low', 'Mid', 'High'], text: 'Row A', group: 'g1', groupText: 'Rate <these>' },
  { id: 'row_b', type: 'scale', n: 3, lo: 'Low', hi: 'High', text: 'Row B', group: 'g1', groupText: 'Rate <these>' },
  { id: 'pick', type: 'select', text: 'Pick', options: [opt('1', 'One'), opt('2', 'Two for {{q:name}}')] }
];
// ---------- markup ----------
const html = ui.questionsHtml(items, { items, lookup: id => ({ name: '<img src=x onerror=alert(1)>' })[id], ed: { pid: '"><svg onload=1>' } });
assert(!/<\s*(script|img|svg|b|i)\b/i.test(html.replace(/data-tpl="[^"]*"/g, '')), 'no element from question text or answers reaches the markup');
assert(html.includes('Hello &lt;b&gt;there&lt;/b&gt; &quot;&gt;&lt;svg onload=1&gt;') && html.includes('Second paragraph'), 'info text escaped, piped embedded data escaped, paragraphs kept');
assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'a piped answer is escaped text');
assert(/data-tpl="Packs for \{\{q:name\}\}\?"/.test(html), 'the template is kept for live updates');
assert(html.includes('class="q-group q-info"') && !/ name="intro"/.test(html), 'descriptive text is not an input');
assert(html.includes('<input type="text" id="') && html.includes('class="line"') && html.includes('<textarea') && html.includes('rows="7"'), 'single-line and long text boxes');
assert.equal((html.match(/class="q-groupwrap"/g) || []).length, 1); assert(html.includes('Rate &lt;these&gt;') && (html.match(/Rate &lt;these&gt;/g) || []).length === 1, 'one group heading above both rows');
assert(/<div class="q-groupwrap"[^>]*aria-labelledby="gh\d+"[^>]*>.*data-name="row_a".*data-name="row_b".*<\/fieldset><\/div><fieldset class="q-group" data-name="pick"/s.test(html), 'both rows inside one labelled group, closed before the next question');
assert(html.includes('Enter a number from 0 to 5.'), 'number range shown as a hint');
assert(html.includes('<span data-tpl="Two for {{q:name}}">Two for &lt;img src=x onerror=alert(1)&gt;</span>'), 'option labels pipe too (a short dropdown is shown as radio buttons)');
{
  const long = { id: 'dd', type: 'select', text: 'Long list', options: Array.from({ length: 12 }, (_, i) => opt(String(i), i === 1 ? 'Two for {{q:name}}' : 'Item ' + i)) };
  const dd = ui.questionsHtml([long], { items: [items[1], long], lookup: () => '<b>x</b>' });
  assert(dd.includes('<option value="1" data-tpl="Two for {{q:name}}">Two for &lt;b&gt;x&lt;/b&gt;</option>'), 'a real dropdown pipes into option text');
}

// ---------- live logic with a stand-in DOM ----------
function el(name) { const n = makeNode(); n.name = name; n.hidden = false; n.checked = false; n.value = ''; n.handlers = {}; n.addEventListener = function (e, f) { this.handlers[e] = f; }; const get = n.getAttribute; n.getAttribute = a => (a === 'data-name' ? name : get(a)); return n; }
function makeRoot(list) {
  const groups = {}, radios = [], texts = [], nums = [], tpl = [];
  for (const it of list) {
    const g = el(it.id); groups[it.id] = g; g.radios = []; g.texts = [];
    if (it.type === 'choice' || it.type === 'scale') for (const v of (it.options || [{ value: '1' }, { value: '2' }, { value: '3' }])) { const r = el(it.id); r.type = 'radio'; r.name = it.id; r.value = v.value; g.radios.push(r); radios.push(r); }
    if (it.type === 'text' || it.type === 'number') { const t = el(it.id); t.name = it.id; g.texts.push(t); (it.type === 'number' ? nums : texts).push(t); }
    g.querySelectorAll = sel => (/radio/.test(sel) ? g.radios : /textarea|text/.test(sel) ? g.texts : []);
    g.querySelector = () => g.radios[0] || g.texts[0] || null;
  }
  const t = { textContent: '', getAttribute: () => 'Packs for {{q:name}}?' }; tpl.push(t);
  const root = { groups, radios, texts, nums, tpl,
    querySelector: sel => { const m = sel.match(/data-name="(\w+)"/); if (m) return groups[m[1]] || null; if (sel === '.missing' || sel === '.q-group.missing') return Object.values(groups).find(g => g.classList.contains('missing')) || null; return null; },
    querySelectorAll: sel => (sel === 'input[type=radio]' ? radios : sel === 'input[type=checkbox]' ? [] : sel === 'textarea' ? texts.filter(x => x.tag !== 'line') : sel === 'input.num, input.line' ? nums : sel === '[data-tpl]' ? tpl : sel === '.q-group' ? Object.values(groups) : []) };
  return root;
}
const set = [items[1], items[3], items[4], items[7]];
const root = makeRoot(set), msg = { innerHTML: '' };
const qs = ui.questionSet(root, set, msg, null, null, { items, ed: {} });
const pick = (id, v) => { const r = root.radios.find(x => x.name === id && x.value === v); r.checked = true; r.handlers.change(); };
assert.equal(root.groups.packs.hidden, true, 'hidden at the start: smoker is not answered');
root.texts[0].value = 'Ann'; root.texts[0].handlers.input();
pick('smoker', 'y');
assert.equal(root.groups.packs.hidden, false, 'shown when the rule is met');
assert.equal(root.tpl[0].textContent, 'Packs for Ann?', 'piped text refreshed live');
root.nums[0].value = '3'; root.nums[0].handlers.input();
assert.deepEqual(JSON.parse(JSON.stringify(qs.answers)), { name: 'Ann', smoker: 'y', packs: '3' });
pick('smoker', 'n');
assert.equal(root.groups.packs.hidden, true, 'hidden again'); assert.equal(root.nums[0].value, '', 'its box was cleared'); assert.equal('packs' in qs.answers, false, 'and its answer dropped');
assert.deepEqual(JSON.parse(JSON.stringify(qs.answers)), { name: 'Ann', smoker: 'n' });
// a hidden required question does not block continuing; a visible one does
const reqSet = [{ id: 'gate', type: 'choice', text: 'G', options: [opt('y', 'Y'), opt('n', 'N')], required: true }, { id: 'must', type: 'text', text: 'M', required: true, displayIf: { q: 'gate', op: 'eq', value: 'y' } }];
const root2 = makeRoot(reqSet), msg2 = { innerHTML: '' }, qs2 = ui.questionSet(root2, reqSet, msg2, null, null, {});
assert.equal(qs2.check(), false, 'the gate is required'); msg2.innerHTML = '';
root2.radios.find(r => r.value === 'n').checked = true; root2.radios.find(r => r.value === 'n').handlers.change();
assert.equal(qs2.check(), true, '"must" is hidden, so it is not required');
root2.radios.find(r => r.value === 'y').checked = true; root2.radios.find(r => r.value === 'y').handlers.change();
assert.equal(qs2.check(), false, 'visible and required: blocks'); assert(/role="alert"/.test(msg2.innerHTML), 'the reminder is announced'); assert(root2.groups.must.classList.contains('missing'), 'and the question is flagged');
{
  // The flagged question names its own error: inline text, aria-describedby and aria-invalid on its control, focus there.
  const g = root2.groups.must, ctl = g.texts[0], err = g.children.find(c => c.className.includes('q-error'));
  assert(err && /needs an answer/.test(err.textContent), 'an inline error sits inside the missing question');
  assert.equal(ctl.getAttribute('aria-invalid'), 'true'); assert(ctl.getAttribute('aria-describedby').split(' ').includes(err.id), 'the control is described by the error');
  assert.equal(ctl.focused, true, 'focus moves to the first missing question');
  // answering clears it
  ctl.value = 'x'; ctl.handlers.input();
  assert.equal(g.children.some(c => c.className.includes('q-error')), false, 'the error goes away once answered');
  assert.equal(ctl.getAttribute('aria-invalid'), null); assert.equal(ctl.getAttribute('aria-describedby'), null);
}
// answers from earlier pages count (prior)
const root3 = makeRoot([reqSet[1]]), qs3 = ui.questionSet(root3, [reqSet[1]], { innerHTML: '' }, null, null, { prior: { gate: 'n' } });
assert.equal(root3.groups.must.hidden, true, 'hidden because of an answer on an earlier page');

// scale numbers follow `start`; a confidence line's accessible name follows piped text
{
  const z = ui.questionsHtml([{ id: 'z', type: 'scale', n: 3, start: 0, text: 'Z', lo: 'a', hi: 'b' }]);
  assert.deepEqual([...z.matchAll(/<input type="radio" name="z" value="(\d+)"/g)].map(m => m[1]), ['0', '1', '2']); assert(z.includes('data-trace="z:0"') && z.includes('<span class="pt-num">0</span>'));
  const o = ui.questionsHtml([{ id: 'o', type: 'scale', n: 3, text: 'O' }]);
  assert.deepEqual([...o.matchAll(/<input type="radio" name="o" value="(\d+)"/g)].map(m => m[1]), ['1', '2', '3'], 'no start: as before');
  const c = ui.questionsHtml([{ id: 'c', type: 'confidence', text: 'How sure, {{q:name}}?' }], { items: [items[1]], lookup: () => 'Ann' });
  assert(c.includes('data-aria-tpl="How sure, {{q:name}}?"') && c.includes('aria-label="How sure, Ann?"'));
}
console.log('participant page: escaping, piped text as text, groups, info, live show/hide/clear, required only when visible');
console.log('ALL PARTICIPANT UI TESTS PASSED');
