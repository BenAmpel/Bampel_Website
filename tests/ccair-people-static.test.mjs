// The /ccair/people/ shell carries every person as static HTML (scripts/build-ccair.js, peopleList).
// Run after the build: node --test tests/ccair-people-static.test.mjs
// (reads public/ccair/people/index.html when a Hugo build exists, else static/ccair/people/index.html).
// The static <li> count and order equal people.json (director, students, SFS scholars, current mentees, former
// mentees, affiliates); the shell keeps one h1, the skip link and main-content; other route shells carry no list.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(ROOT, 'public/ccair/people/index.html');
const file = fs.existsSync(built) ? built : path.join(ROOT, 'static/ccair/people/index.html');
const people = JSON.parse(fs.readFileSync(path.join(ROOT, 'static/ccair/data/people.json'), 'utf8'));
const doc = () => new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const mentees = people.mentees || [];
const expected = [
  'Dr. ' + people.director.name,
  ...people.students.map((p) => p.name),
  ...people.sfsScholars.map((p) => p.name),
  ...mentees.filter((p) => !p.now).map((p) => p.name),
  ...mentees.filter((p) => p.now).map((p) => p.name),
  ...people.affiliates.map((p) => p.name),
];

test('static list has one entry per person, in the order the page shows them', () => {
  const items = [...doc().querySelectorAll('#root ul.people-list > li.person')];
  assert.equal(items.length, expected.length);
  items.forEach((li, i) => assert.equal(norm(li.querySelector('strong').textContent), norm(expected[i]), `entry ${i}`));
});

test('every person has a role line', () => {
  for (const li of doc().querySelectorAll('#root ul.people-list > li.person')) assert.ok(li.querySelector('span'), li.textContent);
});

test('the shell keeps one h1, the skip link, main-content, and no inline-style additions in the list', () => {
  const d = doc();
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.ok(d.querySelector('a.skip[href="#main-content"]'));
  assert.ok(d.querySelector('main#main-content'));
  assert.equal(d.querySelectorAll('ul.people-list [style]').length, 0);
});

test('other route shells have no people list', () => {
  const pubs = path.join(path.dirname(file), '..', 'publications', 'index.html');
  assert.ok(!/class="people-list"/.test(fs.readFileSync(pubs, 'utf8')));
});
