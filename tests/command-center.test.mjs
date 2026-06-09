import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, relativeTime, normalize } from '../static/js/command-center.js';

test('formatAmount abbreviates millions and thousands', () => {
  assert.equal(formatAmount(1200000), '$1.2M');
  assert.equal(formatAmount(450000), '$450K');
  assert.equal(formatAmount(0), '');
  assert.equal(formatAmount(null), '');
});

test('relativeTime returns human strings from an ISO date', () => {
  const now = new Date('2026-06-09T00:00:00Z');
  assert.equal(relativeTime('2026-06-08T00:00:00Z', now), '1 day ago');
  assert.equal(relativeTime('2026-06-09T00:00:00Z', now), 'today');
  assert.equal(relativeTime(null, now), '');
});

test('normalize maps an arXiv paper to a Papers item', () => {
  const raw = { title: 'A', summary: 'B', published: '2026-05-01T00:00:00Z',
    link: 'http://x', authors: ['Ben Ampel', 'Co'], cats: ['cs.CR'] };
  const item = normalize('arxiv', raw);
  assert.equal(item.lens, 'papers');
  assert.equal(item.source, 'arxiv');
  assert.equal(item.title, 'A');
  assert.equal(item.url, 'http://x');
  assert.equal(item.dateISO, '2026-05-01T00:00:00Z');
  assert.equal(item.metaPrimary, 'Ben Ampel');
  assert.equal(item.metaSecondary, 'cs.CR');
});

test('normalize maps an NSF grant to a Funding item with formatted amount', () => {
  const raw = { title: 'Grant', awardId: '99', piName: 'PI Name',
    estimatedTotalAmt: 1200000, startDate: '2026-01-01', abstractText: 'x' };
  const item = normalize('nsf', raw);
  assert.equal(item.lens, 'funding');
  assert.equal(item.metaPrimary, '$1.2M');
  assert.equal(item.metaSecondary, 'PI Name');
  assert.equal(item.dateISO, '2026-01-01');
});

test('normalize maps a GitHub repo to a Community item with star score', () => {
  const raw = { name: 'tool', full_name: 'org/tool', description: 'd',
    stars: 1234, forks: 5, language: 'Python', topics: ['security'], url: 'http://g' };
  const item = normalize('github', raw);
  assert.equal(item.lens, 'community');
  assert.equal(item.score, 1234);
  assert.equal(item.metaPrimary, '⭐ 1,234');
  assert.equal(item.metaSecondary, 'Python');
  assert.deepEqual(item.topics, ['security']);
});

test('normalize maps an OpenCitations item to a Citing item', () => {
  const raw = { title: 'Citing paper', authors: 'Someone', year: 2025,
    venue: 'Journal X', doi: '10.1/x', url: 'http://c', cites_paper: 'My Paper' };
  const item = normalize('opencitations', raw);
  assert.equal(item.lens, 'citing');
  assert.equal(item.metaPrimary, 'Journal X');
  assert.match(item.metaSecondary, /My Paper/);
  assert.equal(item.dateISO, '2025-01-01');
});

test('normalize tolerates missing optional fields', () => {
  const item = normalize('github', { name: 'x', url: 'http://g' });
  assert.equal(item.score, 0);
  assert.equal(item.metaPrimary, '⭐ 0');
  assert.deepEqual(item.topics, []);
});
