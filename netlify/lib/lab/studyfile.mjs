// CCAIR Behavioral Lab: the study design file. One JSON file with everything needed to run the same study again
// (content and settings, plus uploaded stimulus files when they are small enough) and no participant data. It is
// what "Download study design" saves, what "Create a study from a design file" reads, and what "Clone study" copies.
//
//   { format: 'ccair-lab-study', schemaVersion, exportedAt, platform: { name, version, commit },
//     study: { id, name, type, description }, contentVersion, content, files: [{ name, mime, filename, data }], filesLeftOut: [names] }
//
// Uploaded files keep their random names; their addresses (/api/lab/<study>/file/<name>) are rewritten to the new
// study on import. Completion codes are blanked in a downloaded file (it may be shared or deposited) and fresh ones
// are made when it is imported, for the researcher to enter in their own panel. A clone gets fresh codes too (the copy
// is a separate study on the panel, and a shared code would let a participant of one claim credit in the other); the
// redirect address and the other panel settings are copied.

import { getMany } from './store.mjs';
import { getContent, normalize, validateContent, saveContent, contentKeysFor } from './content.mjs';
import { createStudy, typeFor } from './registry.mjs';
import { TYPES } from './types/index.mjs';
import { platformInfo } from './version.mjs';
import { newPanelCode } from './recruit.mjs';

export const FORMAT = 'ccair-lab-study';
export const SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 3_000_000;   // base64 text of the files kept in a downloaded design (requests are capped near 4 MB)
const FILE_RE = /\/api\/lab\/([a-z][a-z0-9-]{2,30}|verification)\/file\/(f-[0-9a-f]{12}\.[a-z0-9]{2,4})/g;

// Uploaded files the content refers to (names only, in order of first use).
export function fileRefs(content) {
  const out = [];
  for (const m of JSON.stringify(content).matchAll(FILE_RE)) if (!out.includes(m[2])) out.push(m[2]);
  return out;
}

// The design of one study. opts.redact (default true) blanks the panel codes; opts.maxFileBytes limits the files kept.
export async function exportDesign(S, { redact = true, maxFileBytes = MAX_FILE_BYTES, now = Date.now() } = {}) {
  // Normalized against the plain type (not a template's starting content), so the file holds every part explicitly.
  const cur = await getContent(S.store, S.type), plain = TYPES[S.study.type] || S.type, full = normalize(structuredClone(cur), plain);
  const content = Object.fromEntries(contentKeysFor(plain).map(k => [k, full[k]]));
  if (redact && content.enrollment && content.enrollment.panel) for (const k of ['completionCode', 'screenOutCode', 'returnCode']) if (content.enrollment.panel[k]) content.enrollment.panel[k] = '';
  const names = fileRefs(content), files = [], filesLeftOut = [];
  let used = 0;
  for (const [key, f] of await getMany(S.store, names.map(n => `files/${n}`))) {
    const name = key.slice(6);
    if (!f || typeof f.data !== 'string') { filesLeftOut.push(name); continue; }
    if (used + f.data.length > maxFileBytes) { filesLeftOut.push(name); continue; }
    used += f.data.length;
    files.push({ name, mime: f.mime, filename: f.filename || '', data: f.data });
  }
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), platform: platformInfo(),
    study: { id: S.study.id, name: S.study.name, type: S.study.type, description: S.study.description || '' }, contentVersion: cur.version || 0,
    redacted: !!redact, content, files, filesLeftOut };
}

// Problems with a design file, as sentences for the researcher (empty when it can be imported).
export function checkDesign(d) {
  if (!d || typeof d !== 'object' || d.format !== FORMAT) return ['This is not a CCAIR Lab study design file.'];
  if (!Number.isInteger(d.schemaVersion) || d.schemaVersion < 1) return ['The design file has no schema version.'];
  if (d.schemaVersion > SCHEMA_VERSION) return [`This design file was made by a newer version of the lab (schema ${d.schemaVersion}; this lab reads up to ${SCHEMA_VERSION}). Update the lab first.`];
  if (!d.study || !Object.hasOwn(TYPES, d.study.type)) return ['The design file names a study type this lab does not have.'];
  if (!d.content || typeof d.content !== 'object') return ['The design file has no study content.'];
  const type = TYPES[d.study.type], c = normalize(withCodes(structuredClone(d.content), d.redacted), type);
  return validateContent(c, type);
}
// A downloaded file has blank panel codes: new ones are made (listed in the import result) so the study validates.
const CODE_KEYS = ['completionCode', 'screenOutCode', 'returnCode'];
function withCodes(content, redacted, made = []) {
  const pn = content.enrollment && content.enrollment.panel;
  if (redacted && pn && pn.enabled) for (const k of CODE_KEYS) if (!pn[k]) { pn[k] = newPanelCode(); made.push(k); }
  return content;
}

// A new study from a design file: checked first, so nothing is created when it would not validate.
// target: { id, name, description? }. Files travel with the design; addresses are rewritten to the new study.
export async function importDesign(registry, getStoreFor, design, target, who, now = Date.now()) {
  const problems = checkDesign(design);
  if (problems.length) return { error: 'bad_design', status: 400, hint: problems[0], errors: problems.slice(0, 20) };
  const files = Array.isArray(design.files) ? design.files.filter(f => f && /^f-[0-9a-f]{12}\.[a-z0-9]{2,4}$/.test(f.name) && typeof f.data === 'string' && /^[A-Za-z0-9+/=]*$/.test(f.data)) : [];
  const made = await createStudy(registry, { id: target.id, name: target.name || design.study.name, type: design.study.type, description: target.description ?? design.study.description ?? '' }, who, now);
  if (!made.ok) return made;
  const study = made.study, type = typeFor(study), store = getStoreFor(study);
  for (const f of files) await store.set(`files/${f.name}`, { mime: String(f.mime || ''), data: f.data, filename: String(f.filename || '').slice(0, 120), at: now, bytes: Math.floor(f.data.length * 3 / 4) });
  const newCodes = [], content = withCodes(JSON.parse(JSON.stringify(design.content).replace(FILE_RE, (m, sid, name) => `/api/lab/${study.id}/file/${name}`)), design.redacted, newCodes);
  const saved = await saveContent(store, type, content, who.name, 0, now);
  if (!saved.ok) return { ...saved, study };   // cannot happen after checkDesign, but the study exists, so say which
  return { ok: true, study, version: saved.version, files: files.length, filesLeftOut: (design.filesLeftOut || []).length, newCodes };
}

// Clone: the whole design of one study (every file kept) as a new study, with a new code wherever the original has one.
// newCodes in the result lists which codes were replaced, for the researcher to enter in the panel.
export async function cloneStudy(registry, getStoreFor, S, target, who, now = Date.now()) {
  const d = await exportDesign(S, { redact: false, maxFileBytes: Infinity, now });
  const pn = d.content.enrollment && d.content.enrollment.panel, newCodes = [];
  if (pn) for (const k of CODE_KEYS) if (pn[k]) { let c; do c = newPanelCode(); while (c === pn[k]); pn[k] = c; newCodes.push(k); }
  const r = await importDesign(registry, getStoreFor, d, { name: target.name || `${S.study.name} (copy)`, id: target.id, description: S.study.description || '' }, who, now);
  return r.ok ? { ...r, newCodes } : r;
}
