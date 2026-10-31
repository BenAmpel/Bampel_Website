// The survey designer (static/lab/engine/canvas.js) in Node: its markup matches the participant page's question by
// question (so what researchers edit is what participants see), every question it creates passes content
// validation, pages and moves keep the list in page order, variable names come from the question text, and the
// participant stylesheets are scoped so the phone frame lays out as a phone does.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as C from '../../netlify/lib/lab/content.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
const here = p => fileURLToPath(new URL(p, import.meta.url));

// The designer, loaded without a DOM (mount() is not called; the pure parts are on LabCanvas._t).
const cbox = { window: {}, console };
cbox.window = cbox; vm.createContext(cbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/canvas.js'), 'utf8'), cbox);
const LC = cbox.LabCanvas, T = LC._t;
// Values made inside the sandbox have its own Array prototype, so compare them as plain JSON.
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
assert(LC && typeof LC.mount === 'function' && T, 'LabCanvas loads without a DOM');

// The participant page, as tests/lab/participant-ui.test.mjs loads it, for LabEngine.ui.questionsHtml.
const stage = { innerHTML: '', querySelector: () => null };
const win = { matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {} };
const pbox = { window: win, document: { documentElement: { getAttribute: () => null }, getElementById: id => (id === 'stage' ? stage : id === 'progress' ? { textContent: '' } : null), createElement: () => ({}), head: { appendChild() {} } },
  location: { pathname: '/nowhere', search: '', origin: 'https://x.test' }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, performance: { now: () => 0 },
  fetch: () => Promise.reject(new Error('offline')), setTimeout, URLSearchParams, Blob, URL, console };
win.window = win; vm.createContext(pbox);
vm.runInContext(readFileSync(here('../../static/lab/engine/participant.js'), 'utf8'), pbox);
const ui = win.LabEngine.ui;

// ---------- fidelity: the same skeleton and text as the participant page ----------
// The skeleton is the sequence of class names in the markup, without the designer's own (lc-*); text is what a
// reader sees. Element names may differ (an option is a <div> in the designer, a <label> for participants).
const skeleton = h => [...h.matchAll(/class="([^"]*)"/g)].map(m => m[1].split(/\s+/).filter(c => c && !/^lc-/.test(c)).join('.')).filter(Boolean);
const text = h => h.replace(/<option[^>]*>[^<]*<\/option>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const opt = (v, l) => ({ value: v, label: l });
const all = [
  { id: 'intro', type: 'info', text: 'Welcome & thanks.\n\nSecond <paragraph>' },
  { id: 'pick', type: 'choice', text: 'Pick one', options: [opt('a', 'Alpha'), opt('b', 'Beta "B"')] },
  { id: 'many', type: 'multi', text: 'Pick some', options: [opt('x', 'X'), opt('y', 'Y')] },
  { id: 'dd', type: 'select', text: 'Short list', options: [opt('1', 'One'), opt('2', 'Two')] },
  { id: 'sc7', type: 'scale', n: 7, lo: 'Low', hi: 'High', text: 'Rate it' },
  { id: 'sc5', type: 'scale', n: 5, start: 0, labels: ['A', 'B', 'C', 'D', 'E'], lo: 'A', hi: 'E', text: 'Labeled' },
  { id: 'conf', type: 'confidence', text: 'How sure?' },
  { id: 'sl', type: 'slider', min: 0, max: 10, step: 1, lo: 'none', hi: 'lots', text: 'Slide' },
  { id: 'sl2', type: 'slider', min: -5, max: 5, step: 1, text: 'No labels' },
  { id: 'rk', type: 'rank', text: 'Order these', options: [opt('p', 'P'), opt('q', 'Q'), opt('r', 'R')] },
  { id: 'mx', type: 'matrix', text: 'Agree?', rows: [{ id: 'mx_1', text: 'Row one' }, { id: 'mx_2', text: 'Row two' }], options: [opt('1', 'No'), opt('2', 'Maybe'), opt('3', 'Yes')] },
  { id: 'num', type: 'number', min: 1, max: 9, text: 'A number' },
  { id: 'line', type: 'text', long: false, text: 'One line' },
  { id: 'para', type: 'text', long: true, text: 'Tell us' },
  { id: 'plain', type: 'text', text: 'Default box' }
];
const ro = T.render({ readOnly: true, ce: 'true', T: () => '' }), rw = T.render({ readOnly: false, ce: 'plaintext-only', T: () => '' });
for (const it of all) {
  const p = ui.questionsHtml([it], { items: all }), c = ro.q(it, 1);
  assert.deepEqual(skeleton(c), skeleton(p), `${it.id} (${it.type}): same structure as the participant page`);
  assert.equal(text(c), text(p), `${it.id} (${it.type}): same text as the participant page`);
  // Editable: the same skeleton apart from the designer's own additions, and the question text editable in place.
  const e = rw.q(it, 1);
  assert.deepEqual(skeleton(e), skeleton(p), `${it.id}: editing keeps the participant structure`);
  assert(e.includes('data-ed="text" ') && e.includes('contenteditable="plaintext-only"'), `${it.id}: the question text is editable`);
  assert(!/<script|onerror=|<paragraph>/.test(e), `${it.id}: text is escaped`);
}
{
  const long = { id: 'long', type: 'select', text: 'Long list', options: Array.from({ length: 12 }, (_, i) => opt(String(i), 'Item ' + i)) };
  const p = ui.questionsHtml([long], { items: [long] }), c = rw.q(long, 1);
  assert(p.includes('<select') && c.includes('<select') && c.includes('lc-tray') && (c.match(/data-ed="opt:/g) || []).length === 12, 'a long dropdown shows as one, with its options editable in a tray');
}
{
  const e = rw.q(all.find(x => x.id === 'mx'), 1);
  assert.equal((e.match(/data-ed="opt:/g) || []).length, 3, 'matrix answer columns are edited once (first statement), mirrored in the others');
  assert.equal((e.match(/data-mirror="/g) || []).length, 3);
  assert.equal((e.match(/data-ed="row:/g) || []).length, 2);
}
{
  const e = rw.q(all.find(x => x.id === 'sc5'), 1);
  assert.equal((e.match(/data-ed="lab:/g) || []).length, 5, 'a fully labeled scale: every point label editable');
  assert(e.includes('<span class="pt-num">0</span>') && e.includes('<span class="pt-num">4</span>'), 'the first number is kept (0-based)');
  const sc7 = rw.q(all.find(x => x.id === 'sc7'), 1);
  assert(sc7.includes('data-ed="lo"') && sc7.includes('data-ed="hi"') && !sc7.includes('data-ed="lab:'), 'ends-only labels: the two end labels are editable');
}

// ---------- the whole canvas ----------
{
  const o = { kind: 'pre', readOnly: false, ce: 'true', qtypes: LC.KINDS.map(k => k.type), T: k => ({ pre_title: 'About you <b>', continue_button: 'Next', survey_page: 'Page {i} of {n}' })[k] || '' };
  const list = [{ id: 'a', type: 'text', text: 'A' }, { id: 'b', type: 'text', text: 'B', page: 2 }, { id: 'c', type: 'text', text: 'C', page: 2, group: 'g', groupText: 'Group head' }, { id: 'd', type: 'text', text: 'D', page: 2, group: 'g' }];
  const h = T.canvasHtml(list, o, { sel: 1 });
  assert.equal((h.match(/class="lc-screen"/g) || []).length, 2, 'one screen per page');
  assert(h.includes('Page 1 of 2') && h.includes('Page 2 of 2'), 'the page indicator uses the study text');
  assert.equal((h.match(/class="lc-break"/g) || []).length, 1, 'a page break between the pages');
  assert.equal((h.match(/About you &lt;b&gt;/g) || []).length, 2, 'the survey title on every page, escaped');
  assert.equal((h.match(/class="q-groupwrap"/g) || []).length, 1, 'consecutive questions in a group share one wrapper');
  assert.equal((h.match(/data-ed="group"/g) || []).length, 1, 'the group heading is editable once');
  assert(/data-i="1"[^>]*aria-current="true"/.test(h), 'the selected question is marked');
  assert.equal((h.match(/class="lc-tools"/g) || []).length, 1, 'only the selected question has a toolbar');
  assert(/data-i="0"[\s\S]*data-i="1"[\s\S]*data-i="2"[\s\S]*data-i="3"/.test(h), 'questions numbered in the order shown');
  assert(h.includes('data-act="insert" data-p="0" data-k="0"') && h.includes('data-act="newpage"'), 'insert points and "Add page"');
  const empty = T.canvasHtml([], o, { sel: -1 });
  assert(empty.includes('Add the first question') && empty.includes('No questions yet'), 'an empty survey invites the first question');
  const viewer = T.canvasHtml(list, Object.assign({}, o, { readOnly: true }), { sel: 1 });
  assert(!/contenteditable="(true|plaintext-only)"|data-act=/.test(viewer), 'viewers get the same page with nothing editable');
}

// ---------- the page model ----------
{
  const q = (id, page) => (page ? { id, page } : { id });
  const list = [q('a'), q('b', 3), q('c'), q('d', 2), q('e', 3)];
  deq(T.toPages(list).map(p => p.map(x => x.id)), [['a', 'c'], ['d'], ['b', 'e']], 'pages in number order, questions in list order within a page');
  assert.equal(T.inOrder(list), false);
  T.fromPages(list, T.toPages(list));
  deq(list.map(x => x.id + ':' + (x.page || 1)), ['a:1', 'c:1', 'd:2', 'b:3', 'e:3'], 'written back in display order');
  const pages = T.toPages(list); pages[1].splice(0, 1); T.fromPages(list, pages);   // page 2 emptied
  deq(list.map(x => x.id + ':' + (x.page || 1)), ['a:1', 'c:1', 'b:2', 'e:2'], 'an empty page disappears and the rest renumber');
  assert(!('page' in list[0]), 'page 1 is written as no page');
  deq(T.locate(T.toPages(list), 3), [1, 1]);
}

// ---------- every question the designer creates passes validation ----------
{
  const type = TYPES.vignettes, c = C.normalize(C.defaultContent(type), type), list = [];
  for (const k of LC.KINDS) list.push(T.newQuestion(list, k.id, 'pre'));
  list.forEach(it => { it.text = 'Question for ' + it.type; });
  assert.equal(new Set(list.map(x => x.id)).size, list.length, 'new questions get distinct variable names');
  c.survey.pre = list;
  deq(C.validateContent(C.normalize(structuredClone(c), type), type), [], 'one question of every kind validates');
  const it = list.find(x => x.type === 'scale');
  T.setPoints(it, 5); T.scaleLabels(it, true);
  deq(it.labels, ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'], '5 points labeled with the standard agreement labels');
  T.setPoints(it, 11); assert.equal(it.labels.length, 11, 'labels follow the number of points');
  T.setPoints(it, 1); assert.equal(it.n, 2, 'at least 2 points'); T.setPoints(it, 40); assert.equal(it.n, 11, 'at most 11');
  T.scaleLabels(it, false); assert(!('labels' in it), 'labels off: ends only');
  const ch = list.find(x => x.type === 'choice'); T.convert(ch, 'matrix');
  assert(ch.rows.length === 2 && ch.options.length === 3, 'a choice question becoming a matrix keeps its options as columns and gains statements');
  c.survey.pre = list;
  deq(C.validateContent(C.normalize(structuredClone(c), type), type), [], 'still valid after changes');
}

// ---------- variable names ----------
assert.equal(T.nameFrom('How did you hear about this study?'), 'hear_study');
assert.equal(T.nameFrom('What is your age in years?'), 'age_years');
assert.equal(T.nameFrom('Please rate your overall satisfaction with the course'), 'overall_satisfaction_course');
assert.equal(T.nameFrom('2024 income, in dollars'), 'income_dollars', 'a leading number is dropped');
assert.equal(T.nameFrom('{{q:name}}, is that right?'), 'right', 'piped text is ignored');
assert.equal(T.nameFrom('?'), '');
{
  const list = [{ id: 'hear_study', type: 'text' }, { id: 'q2', type: 'matrix', rows: [{ id: 'q2_1' }, { id: 'q2_2' }] }];
  assert.equal(T.rename(list, list[1], 'How did you hear about this study?'), true);
  assert.equal(list[1].id, 'hear_study1', 'a taken name gets a number');
  deq(list[1].rows.map(r => r.id), ['hear_study1_1', 'hear_study1_2'], 'statement names follow');
  assert.equal(T.uniqueId([{ id: 'q1' }, { id: 'q2' }], 'q'), 'q3');
}

// ---------- the participant stylesheets, scoped ----------
{
  const css = T.scopeCss(readFileSync(here('../../static/lab/assets/study.css'), 'utf8') + '\n' + readFileSync(here('../../static/lab/engine/participant.css'), 'utf8'));
  assert(!/:root|@font-face/.test(css), 'no :root and no fonts (the admin page loads them)');
  assert(/@container lp \(max-width: 640px\)/.test(css) && /@container lp \(max-width: 560px\)/.test(css), 'width media queries become container queries');
  assert(/@media \(prefers-color-scheme: dark\)/.test(css) && /@media \(prefers-reduced-motion: reduce\)/.test(css), 'other media queries stay');
  assert(/\.lp-root, \.lp-body \{ margin: 0; \}/.test(css) && /\n\.lp-body \{/.test(css), 'html and body become the canvas root and body');
  assert(/\.mail-body/.test(css) && /\.panel-body/.test(css), 'class names that end in "body" are untouched');
  assert(/cqi/.test(css) && !/\dvw\b/.test(css), 'viewport widths become container widths');
}
// ---------- content the server has not validated yet (an imported file loaded into the editor) ----------
{
  const evil = { id: 'x', type: 'scale', n: '7" style="x"><img src=//evil.example/b>', lo: 'L', hi: 'H', text: 'T', start: '1"><b>' };
  const h = rw.q(evil, 1);
  assert(!/<img|<b>|style="x"/.test(h) && h.includes('--n:7'), 'a non-numeric point count is coerced, never drawn as markup');
  assert.equal((rw.q({ id: 'y', type: 'scale', n: 1e9, text: 'T' }, 1).match(/scale-pt/g) || []).length, 11, 'a huge point count is capped at 11');
  const odd = [{ id: 'a', page: '__proto__' }, { id: 'b', page: 'constructor' }, { id: 'c', page: 2 }];
  deq(T.toPages(odd).map(p => p.map(x => x.id)), [['a', 'b'], ['c']], 'odd page values count as page 1, without touching prototypes');
  assert.equal(T.uniqueId([{ id: 'constructor' }], 'constructor'), 'constructor1');
}

// ---------- references: warnings, renames, and deletes ----------
{
  const list = [
    { id: 'first', type: 'text', text: 'Hi {{q:later}}' },
    { id: 'later', type: 'choice', text: 'Pick', options: [opt('a', 'A')] },
    { id: 'dep', type: 'text', text: 'Why?', displayIf: { all: [{ q: 'later', op: 'eq', value: 'a' }, { q: 'ghost', op: 'answered' }] } }
  ];
  deq(T.problems(list, list[0]), ['Uses later, which comes later'], 'piped text from a later question is flagged');
  deq(T.problems(list, list[2]), ['Uses ghost, which is not in this survey'], 'a rule on a missing question is flagged; one on an earlier question is fine');
  assert.equal(T.refsTo(list, 'later'), 2, 'two questions use "later"');
  assert.equal(T.rename(list, list[1], 'What is your favourite colour?'), false, 'a question others use keeps its name');
  assert.equal(list[1].id, 'later');
  const h = T.canvasHtml(list, { kind: 'pre', readOnly: false, ce: 'true', qtypes: ['text', 'choice'], T: () => '' }, { sel: -1 });
  assert.equal((h.match(/class="lc-warn"/g) || []).length, 2, 'the warnings are drawn on the questions');
}

// ---------- Preview and viewers ----------
{
  const list = [{ id: 'b', type: 'choice', text: 'Second', page: 2, options: [opt('y', 'Yes'), opt('n', 'No')] }, { id: 'a', type: 'text', long: false, text: 'First {{q:b}}' }];
  const o = { kind: 'pre', readOnly: true, ce: 'true', qtypes: ['text', 'choice'], T: () => '' };
  const view = T.canvasHtml(list, o, { sel: -1 });
  assert(/data-i="1" data-id="a"[\s\S]*data-i="0" data-id="b"/.test(view), 'a viewer sees pages in order, each question tagged with its own place in the (unchanged) list');
  deq(list.map(x => x.id), ['b', 'a'], 'and the viewer\'s draft is not reordered');
  const prev = T.canvasHtml(list, Object.assign({}, o, { readOnly: false, preview: true, fill: s => s.replace('{{q:b}}', 'Yes') }), { sel: 0, page: 1 });
  assert(prev.includes('Second') && !prev.includes('First'), 'Preview shows one page');
  assert(/<label class="option"[^>]*><input type="radio" name="b" value="y">/.test(prev), 'Preview options are real, named inputs');
  assert(!/contenteditable="(true|plaintext-only)"|data-act="(insert|del|kind)"|lc-tools/.test(prev) && prev.includes('data-act="next"'), 'Preview has no editing, only Continue');
  const p1 = T.canvasHtml(list, Object.assign({}, o, { readOnly: false, preview: true, fill: s => s.replace('{{q:b}}', 'Yes') }), { sel: -1, page: 0 });
  assert(p1.includes('data-tpl="First {{q:b}}"') && p1.includes('>First Yes<'), 'piped text is filled in Preview');
}
console.log('canvas: ok');
