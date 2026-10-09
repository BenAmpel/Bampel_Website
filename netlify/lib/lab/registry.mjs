// CCAIR Behavioral Lab: the study registry.
// Built-in studies are listed here; studies created on the lab admin page are stored in the
// "lab-registry" Blobs store (studies/{id}). Each study has its own Blobs store for data and one for
// its backup mirror, so studies never share participants or data.
import { TYPES } from './types/index.mjs';
import { seed as dataQualitySeed } from './studies/data-quality.mjs';

export const BUILT_IN = {
  verification: {
    id: 'verification', name: 'Security alert verification', type: 'alert-triage',
    storeName: 'verification-study', backupName: 'verification-backup', codePrefix: 'VC', seedId: 'verification-v1',
    paths: { participant: '/lab/studies/verification/', admin: '/lab/studies/verification/admin.html' }, listed: true, builtIn: true,
    description: 'Four weekly sessions of security alert triage, with and without an AI assistant.'
  },
  // Survey-only battery (attention checks, Big Five, conspiracist beliefs, consistency checks, demographics).
  // Starting content comes from studies/data-quality.mjs until the first save on the admin page. Unlisted
  // (reach it by its address) and closed to self sign-up until it is switched on there.
  'data-quality': {
    id: 'data-quality', name: 'Online survey data quality', type: 'vignettes', seed: dataQualitySeed,
    storeName: 'data-quality-study', backupName: 'data-quality-backup', codePrefix: 'DQ', seedId: 'data-quality-v1',
    paths: { participant: '/lab/s/data-quality', admin: '/lab/admin/data-quality' }, listed: false, builtIn: true,
    description: 'One survey session: attention checks, Big Five, conspiracist beliefs, consistency checks, demographics.'
  }
};

// The study type for a study: the registered type, with the study's own starting content when it has one.
export function typeFor(study) {
  const t = TYPES[study.type];
  return t && study.seed ? { ...t, defaultContent: study.seed } : t;
}

const ID_RE = /^[a-z][a-z0-9-]{2,30}$/;
const RESERVED = ['lab', 'admin', 's', 'studies', 'engine', 'assets', 'tracelab', 'api', 'new'];
const withPaths = s => ({ ...s, paths: s.paths || { participant: `/lab/s/${s.id}`, admin: `/lab/admin/${s.id}` } });

export async function getStudy(registry, id) {
  if (BUILT_IN[id]) return BUILT_IN[id];
  if (!ID_RE.test(String(id || ''))) return null;
  const s = registry ? await registry.get(`studies/${id}`) : null;
  return s && !s.archived ? withPaths(s) : null;
}

export async function listStudies(registry, { all = false } = {}) {
  const keys = registry ? await registry.list('studies/') : [];
  const stored = (await Promise.all(keys.map(k => registry.get(k)))).filter(Boolean).map(withPaths);
  return [...Object.values(BUILT_IN), ...stored].filter(s => all || (s.listed && !s.archived));
}

export async function createStudy(registry, { id, name, type, description }, who, now = Date.now()) {
  id = String(id || '').trim().toLowerCase();
  if (!ID_RE.test(id) || RESERVED.includes(id) || BUILT_IN[id]) return { error: 'bad_id', status: 400, hint: 'Use 3–31 lowercase letters, numbers, and dashes, starting with a letter.' };
  if (!TYPES[type]) return { error: 'bad_type', status: 400 };
  if (!String(name || '').trim()) return { error: 'name_required', status: 400 };
  const prefix = (id.replace(/[^a-z]/g, '') + 'xx').slice(0, 2).toUpperCase();
  const s = { id, name: String(name).trim().slice(0, 120), type, description: String(description || '').slice(0, 500),
    storeName: `lab-${id}`, backupName: `lab-${id}-backup`, codePrefix: prefix, listed: false, createdAt: now, createdBy: who.name };
  if (registry.setIf) { if (!(await registry.setIf(`studies/${id}`, s, { onlyIfNew: true }))) return { error: 'exists', status: 409 }; }
  else { if (await registry.get(`studies/${id}`)) return { error: 'exists', status: 409 }; await registry.set(`studies/${id}`, s); }
  return { ok: true, study: withPaths(s) };
}

export async function updateStudy(registry, id, changes) {
  if (BUILT_IN[id]) return { error: 'built_in', status: 400, hint: 'Built-in studies are configured in code (netlify/lib/lab/registry.mjs).' };
  const s = await registry.get(`studies/${id}`);
  if (!s) return { error: 'not_found', status: 404 };
  for (const k of ['name', 'description']) if (typeof changes[k] === 'string') s[k] = changes[k].slice(0, k === 'name' ? 120 : 500);
  for (const k of ['listed', 'archived']) if (typeof changes[k] === 'boolean') s[k] = changes[k];
  await registry.set(`studies/${id}`, s);
  return { ok: true, study: withPaths(s) };
}
