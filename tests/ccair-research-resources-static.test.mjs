// The /ccair/research/ and /ccair/resources/ shells carry their lists as static HTML (scripts/build-ccair.js,
// researchList and resourcesList). Run after the build: node --test tests/ccair-research-resources-static.test.mjs
// (reads public/ccair/<page>/index.html when a Hugo build exists, else static/ccair/<page>/index.html).
// Research areas are constants in ccair-pages.jsx (the page and the shell read the same literal); resources come from
// resources.json. The static entry counts and order equal the sources; each shell keeps one h1, the skip link and
// main-content; the other route shells carry no list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shell = (page) => {
  const built = path.join(ROOT, `public/ccair/${page}/index.html`);
  return fs.readFileSync(fs.existsSync(built) ? built : path.join(ROOT, `static/ccair/${page}/index.html`), 'utf8');
};
const doc = (page) => new JSDOM(shell(page)).window.document;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const pagesSrc = fs.readFileSync(path.join(ROOT, 'static/ccair/ccair-pages.jsx'), 'utf8');
const constant = (name) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + new RegExp(`^const ${name} = (\\[[\\s\\S]*?^\\]);`, 'm').exec(pagesSrc)[1] + ')', Object.create(null))));
const resources = JSON.parse(fs.readFileSync(path.join(ROOT, 'static/ccair/data/resources.json'), 'utf8'));

test('research shell lists every research area, tier area, construct and output, in page order', () => {
  const d = doc('research');
  const names = (sel) => [...d.querySelectorAll(`#root ${sel} > li.static-item > strong`)].map((e) => norm(e.textContent));
  const pillars = constant('PILLARS');
  assert.equal(pillars.length, 4);
  assert.deepEqual(names('ol.static-list'), pillars.map((p) => norm(p.title)));
  const points = [...d.querySelectorAll('#root ol.static-list ul.static-points')].map((u) => [...u.children].map((l) => norm(l.textContent)));
  assert.deepEqual(points, pillars.map((p) => p.points.map(norm)));
  const rest = names('ul.static-list');
  const expected = [
    ...constant('RESEARCH_PORTFOLIO').flatMap((t) => t.areas.map((a) => a.name)),
    ...constant('CONSTRUCTS').map((c) => c.name),
    ...constant('CENTER_OUTPUTS').map((o) => o.title),
  ].map(norm);
  assert.equal(rest.length, expected.length);
  assert.deepEqual(rest, expected);
});

test('research shell headings follow the page sections', () => {
  const h = [...doc('research').querySelectorAll('#root h2')].map((e) => norm(e.textContent));
  assert.deepEqual(h, ['Research areas', 'Research portfolio', 'Theoretical constructs', 'Center outputs']);
});

test('resources shell lists every resource, grouped datasets, benchmarks, tools, in file order', () => {
  const items = [...doc('resources').querySelectorAll('#root ul.static-list > li.static-item')];
  const expected = ['dataset', 'benchmark', 'tool'].flatMap((c) => resources.filter((r) => r.category === c));
  assert.equal(items.length, resources.length);
  assert.equal(expected.length, resources.length);
  items.forEach((li, i) => {
    assert.equal(norm(li.querySelector('strong').textContent), norm(expected[i].title), `entry ${i} title`);
    const spans = [...li.querySelectorAll(':scope > span')].map((s) => norm(s.textContent));
    assert.equal(spans[0], norm(expected[i].status));
    assert.equal(spans[1], norm(expected[i].description));
  });
});

test('each shell keeps one h1, the skip link, main-content, and no inline-style additions in the lists', () => {
  for (const page of ['research', 'resources']) {
    const d = doc(page);
    assert.equal(d.querySelectorAll('h1').length, 1, page);
    assert.ok(d.querySelector('a.skip[href="#main-content"]'), page);
    assert.ok(d.querySelector('main#main-content'), page);
    assert.equal(d.querySelectorAll('.static-list [style], .static-points [style]').length, 0, page);
  }
});

test('other route shells have no research or resources list', () => {
  for (const page of ['publications', 'people', 'about']) assert.ok(!/class="static-list"/.test(shell(page)), page);
});
