import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount, relativeTime } from '../static/js/command-center.js';

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
