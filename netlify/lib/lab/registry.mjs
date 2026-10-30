// CCAIR Behavioral Lab: the study registry.
// Built-in studies are listed here; studies created on the lab admin page are stored in the
// "lab-registry" Blobs store (studies/{id}). Each study has its own Blobs store for data and one for
// its backup mirror, so studies never share participants or data.
import { TYPES } from './types/index.mjs';
import { seed as dataQualitySeed } from './studies/data-quality.mjs';
import { TEMPLATES } from './templates.mjs';
import { update, deleteKeys } from './store.mjs';
import { audit } from './admin.mjs';
import { dropStudyRoles } from './accounts.mjs';

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

// The study type for a study: the registered type, with the study's own starting content when it has one
// (a built-in study's seed, or the template it was created from).
export function typeFor(study) {
  const t = TYPES[study.type], tpl = study.template && TEMPLATES[study.template];
  const seed = study.seed || (tpl && tpl.type === study.type ? tpl.content : null);
  return t && seed ? { ...t, defaultContent: seed } : t;
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

export async function createStudy(registry, { id, name, type, description, template }, who, now = Date.now()) {
  id = String(id || '').trim().toLowerCase();
  if (!ID_RE.test(id) || RESERVED.includes(id) || BUILT_IN[id]) return { error: 'bad_id', status: 400, hint: 'The link name needs 3 to 31 lowercase letters, numbers, and dashes, starting with a letter (for example "phone-calls-pilot").' };
  if (template != null && template !== '') {
    if (!Object.hasOwn(TEMPLATES, template)) return { error: 'bad_template', status: 400, hint: 'That template no longer exists. Reload the page.' };
    type = TEMPLATES[template].type;
  } else template = null;
  if (!TYPES[type]) return { error: 'bad_type', status: 400, hint: 'Choose a study type.' };
  if (!String(name || '').trim()) return { error: 'name_required', status: 400, hint: 'Give the study a name.' };
  const prefix = (id.replace(/[^a-z]/g, '') + 'xx').slice(0, 2).toUpperCase();
  const s = { id, name: String(name).trim().slice(0, 120), type, description: String(description || '').slice(0, 500),
    storeName: `lab-${id}`, backupName: `lab-${id}-backup`, codePrefix: prefix, listed: false, createdAt: now, createdBy: who.name, ...(who.accountId ? { createdByAccount: who.accountId } : {}), ...(template ? { template } : {}) };
  if (registry.setIf) { if (!(await registry.setIf(`studies/${id}`, s, { onlyIfNew: true }))) return { error: 'exists', status: 409 }; }
  else { if (await registry.get(`studies/${id}`)) return { error: 'exists', status: 409 }; await registry.set(`studies/${id}`, s); }
  return { ok: true, study: withPaths(s) };
}

export async function updateStudy(registry, id, changes) {
  if (BUILT_IN[id]) return { error: 'built_in', status: 400, hint: 'Built-in studies are configured in code (netlify/lib/lab/registry.mjs).' };
  const s = await registry.get(`studies/${id}`);
  if (!s) return { error: 'not_found', status: 404 };
  if (s.deletingAt) return { error: 'deleting', status: 409, hint: 'This study is being deleted permanently. Click "Delete permanently" again to finish.' };
  for (const k of ['name', 'description']) if (typeof changes[k] === 'string') s[k] = changes[k].slice(0, k === 'name' ? 120 : 500);
  for (const k of ['listed', 'archived']) if (typeof changes[k] === 'boolean') s[k] = changes[k];
  await registry.set(`studies/${id}`, s);
  return { ok: true, study: withPaths(s) };
}

// Deletes an archived study for good (lab owner only): every record in its store, its backup copy, its entry in the studies
// list and in the registry's backup, and its role on every researcher account. Built-in studies cannot be deleted.
// confirm must be the study's ID, typed by the owner.
//
// A large study can take longer than one function call, so this works in rounds: the first call marks the study
// (deletingAt; it cannot be restored from then on, and the hourly backup skips it) and writes "study.delete_started" to the
// lab activity log; each call deletes for up to budgetMs and answers { done: false, remaining } until nothing is left. The
// studies-list entry goes last, so a study that is half deleted stays on the console, marked, until a later call finishes
// it ("study.delete" in the activity log). Deleting is idempotent, so two calls at once only repeat each other's work.
// ctx: { registry, registryBackup, getStoreFor(name) }.
export async function deleteStudy(ctx, id, confirm, who, { now = Date.now(), budgetMs = 6000 } = {}) {   // budget: well inside a function's 10-second limit
  const { registry, registryBackup, getStoreFor } = ctx, t0 = Date.now();
  id = String(id || '');
  if (!who || who.role !== 'owner') return { error: 'forbidden', status: 403, hint: 'Only a lab owner, or the researcher who created the study, can delete it.' };
  if (BUILT_IN[id]) return { error: 'built_in', status: 400, hint: 'Built-in studies cannot be deleted.' };
  const s = ID_RE.test(id) ? await registry.get(`studies/${id}`) : null;
  if (!s) return { error: 'not_found', status: 404, hint: 'That study no longer exists.' };
  if (!s.archived) return { error: 'not_archived', status: 409, hint: 'Archive the study first. Only an archived study can be deleted.' };
  if (String(confirm == null ? '' : confirm).trim() !== id) return { error: 'confirm', status: 400, hint: `To confirm, type the study's link name exactly: ${id}` };
  if (!s.deletingAt) {
    const u = await update(registry, `studies/${id}`, d => { if (!d.deletingAt) { d.deletingAt = now; d.deletingBy = who.name; } });
    if (u.error) return u;
    await audit(registry, who, 'study.delete_started', `${id} (${s.name})`, now);
  }
  let deleted = 0;
  for (const name of [s.storeName, s.backupName]) {   // the study's store first, so the hourly backup has nothing left to copy back
    const store = getStoreFor(name);
    for (let keys = await store.list(''); keys.length; keys = await store.list('')) {
      if (Date.now() - t0 > budgetMs) return { ok: true, done: false, deleted, remaining: keys.length };
      const batch = keys.slice(0, 400);
      await deleteKeys(store, batch); deleted += batch.length;
    }
  }
  const roles = await dropStudyRoles(registry, id);
  if (roles.error) return roles;
  if (registryBackup) await registryBackup.delete(`m/studies/${id}`);
  await registry.delete(`studies/${id}`);
  await audit(registry, who, 'study.delete', `${id} (${s.name}): every record and its backup copy deleted${roles.changed.length ? `; access removed from ${roles.changed.join(', ')}` : ''}`, now);
  return { ok: true, done: true, deleted, accounts: roles.changed.length };
}
