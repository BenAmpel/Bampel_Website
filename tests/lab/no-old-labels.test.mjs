// The study admin's main tab is "Edit study" (docs/designs/console-ia.md). Fails if the old name "Study content"
// (case-sensitive) is back anywhere in the lab's pages, scripts or docs. A line can keep it on purpose by carrying the
// marker "former name: Study content". The lowercase noun ("study content") is fine.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OLD = 'Study content', MARK = 'former name: Study content';
const walk = (dir, exts) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p, exts) : exts.some(e => n.endsWith(e)) ? [p] : [];
});
const files = [...walk(join(ROOT, 'static/lab'), ['.js', '.html', '.md', '.css']), ...walk(join(ROOT, 'netlify/lib/lab'), ['.mjs'])];
assert(files.length > 20, 'found the lab files');
const hits = [];
for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
  if (line.includes(OLD) && !line.includes(MARK)) hits.push(`${relative(ROOT, f)}:${i + 1}`);
});
assert.deepEqual(hits, [], `the old tab name "${OLD}" is back:\n  ` + hits.join('\n  '));
console.log(`no-old-labels: "${OLD}" appears in none of ${files.length} lab files`);
