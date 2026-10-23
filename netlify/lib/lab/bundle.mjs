// CCAIR Behavioral Lab: the reproducibility bundle, one .zip to deposit with a paper (for example on Zenodo, which
// gives it a DOI). It holds the study design (no participant data), the generated codebook, which platform code and
// content version ran, the list of content versions, how to cite, and Zenodo-ready metadata to complete.
//   README.md               what is inside and how to run the study again
//   study-design.json       the design file (studyfile.mjs; completion codes blanked)
//   codebook.csv, codebook.md
//   platform.json           platform name, version, git commit; study ID, type, content version; when it was made
//   content-versions.csv    every saved version of the study content and when it was saved
//   CITATION.cff            citation metadata for the platform and the study materials
//   zenodo-metadata.json    fields for the Zenodo upload form (fill in the creators before depositing)
// OSF is not offered: OSF projects become read-only on 19 February 2027 and no new ones can be made from 16 November 2026.

import { deflateRawSync } from 'node:zlib';
import { exportDesign } from './studyfile.mjs';
import { buildCodebook, codebookCsv, codebookMarkdown } from './codebook.mjs';
import { contentHistory, getContent } from './content.mjs';
import { platformInfo } from './version.mjs';
import { csvCell } from './engine.mjs';

// ---------- a small ZIP writer (deflate, no encryption, no zip64: bundles are well under 4 GB) ----------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function dosTime(d) {
  return { time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2), date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}
export function zip(files, when = new Date()) {
  const locals = [], central = [], { time, date } = dosTime(when);
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content), comp = deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(time, 12); ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nm);
    offset += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ---------- the bundle ----------
export function citationText(p, study, version, year) {
  const commit = p.commit === 'unknown' ? 'commit unknown' : `commit ${p.commit.slice(0, 12)}`;
  return {
    platform: `Ampel, B. (${year}). ${p.name} (version ${p.version}, ${commit}) [Computer software]. Center for CyberAI Research (CCAIR), Georgia State University. https://bampel.com/lab/`,
    materials: `[Authors]. (${year}). ${study.name}: study materials and codebook (content version ${version}) [Data set]. Zenodo. [DOI assigned on deposit]`
  };
}

export async function buildBundle(S, { now = Date.now() } = {}) {
  const c = await getContent(S.store, S.type), version = c.version || 0, p = platformInfo(), year = new Date(now).getUTCFullYear();
  const design = await exportDesign(S, { now }), book = buildCodebook(S, c), history = await contentHistory(S.store);
  const cite = citationText(p, S.study, version, year), made = new Date(now).toISOString();
  const platform = { platform: p, study: { id: S.study.id, name: S.study.name, type: S.type.id, typeLabel: S.type.label }, contentVersion: version, contentSavedAt: c.savedAt ? new Date(c.savedAt).toISOString() : null, bundleMadeAt: made,
    filesLeftOut: design.filesLeftOut };
  const versions = 'version,saved_at,restored_from\n' + history.slice().reverse().map(h => [h.version, h.savedAt ? new Date(h.savedAt).toISOString() : '', h.restoredFrom ?? ''].map(csvCell).join(',')).join('\n') + '\n';
  const cff = ['cff-version: 1.2.0', `message: "If you use these materials, please cite them and the platform as below."`, `title: "${S.study.name.replace(/"/g, "'")}: study materials and codebook"`, 'type: dataset',
    'authors:', '  - name: "[Authors]"', `version: "content-${version}"`, `date-released: "${made.slice(0, 10)}"`,
    'references:', '  - type: software', `    title: "${p.name}"`, '    authors:', '      - family-names: Ampel', '        given-names: Ben', `    version: "${p.version}"`, `    commit: "${p.commit}"`, '    url: "https://bampel.com/lab/"', ''].join('\n');
  const zenodo = { upload_type: 'dataset', title: `${S.study.name}: study materials and codebook`, creators: [{ name: '[Family name, Given names]', affiliation: '[Affiliation]' }],
    description: `Study design (content version ${version}), generated codebook, and platform version for "${S.study.name}", run on the ${p.name} ${p.version} (commit ${p.commit}). No participant data.`,
    keywords: ['behavioral experiment', 'online study', 'codebook', p.name], version: `content-${version}`, license: 'cc-by-4.0', access_right: 'open',
    related_identifiers: [{ relation: 'isDocumentedBy', identifier: 'https://bampel.com/lab/guide/', resource_type: 'other' }] };
  const readme = [`# ${S.study.name}: study materials`, '',
    `Made ${made.slice(0, 10)} from content version ${version} of study \`${S.study.id}\` (${S.type.label}) on the ${p.name} ${p.version}, commit \`${p.commit}\`. This bundle holds the study design and its codebook, and no participant data.`, '',
    '## Files', '', '| File | What it is |', '|---|---|',
    '| `study-design.json` | The whole study design: items, questions, conditions, screen text, consent text, and settings (completion codes left blank). Import it on a CCAIR Lab console ("Create a study from a design file") to run the same study again. |',
    '| `codebook.csv`, `codebook.md` | Every exported column with its kind, allowed values and labels, the question text, and who it applies to. |',
    '| `platform.json` | The platform version and git commit, the study\'s type and content version, and when this bundle was made. |',
    '| `content-versions.csv` | Every saved version of the study content and when it was saved; the data record the version each answer was collected under (`content_version`). |',
    '| `CITATION.cff` | Citation metadata (fill in the authors). |', '| `zenodo-metadata.json` | The fields for Zenodo\'s upload form: fill in the creators, then upload this bundle as one file to get a DOI. |', '',
    ...(design.filesLeftOut.length ? [`Media files not included (too large for the design file; deposit them alongside): ${design.filesLeftOut.join(', ')}.`, ''] : []),
    '## How to cite', '', cite.platform, '', cite.materials, '',
    '## Depositing', '', 'Upload this .zip to Zenodo (https://zenodo.org, "New upload"), copy the fields from `zenodo-metadata.json`, and publish to receive a DOI; then cite that DOI in the paper and add it to `CITATION.cff`. OSF is not supported because OSF projects become read-only on 19 February 2027.', ''].join('\n');
  const files = [['README.md', readme], ['study-design.json', JSON.stringify(design, null, 2)], ['codebook.csv', codebookCsv(book)], ['codebook.md', codebookMarkdown(book, { study: S.study, type: S.type, version, now })],
    ['platform.json', JSON.stringify(platform, null, 2)], ['content-versions.csv', versions], ['CITATION.cff', cff], ['zenodo-metadata.json', JSON.stringify(zenodo, null, 2)]];
  return { bytes: zip(files, new Date(now)), name: `${S.study.id}_materials_v${version}.zip`, files: files.map(f => f[0]) };
}
