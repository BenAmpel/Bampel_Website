// Verification study: admin access (owner + team members), activity log.
// The owner signs in with the VC_ADMIN_KEY environment variable. The owner can give team
// members their own keys; only a SHA-256 hash of each key is stored.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ROLES = ['viewer', 'editor', 'manager', 'owner'];
export const ROLE_INFO = {
  viewer: 'See progress and download data',
  editor: 'Viewer, plus edit questions, alerts, and consent text',
  manager: 'Editor, plus add students, check completion, download the extra-credit list, and create pilot codes',
  owner: 'Everything, including deleting data and managing the team'
};
export const can = (role, need) => ROLES.indexOf(role) >= ROLES.indexOf(need);

const sha = s => createHash('sha256').update(s).digest('hex');

export async function authAdmin(store, key, ownerKey, now = Date.now()) {
  key = String(key || '');
  if (!key) return null;
  if (ownerKey && ownerKey.length >= 16 && key.length === ownerKey.length && timingSafeEqual(Buffer.from(key), Buffer.from(ownerKey))) return { id: 'owner', name: 'Owner', role: 'owner' };
  if (!/^vca_[A-Za-z0-9_-]{32}$/.test(key)) return null;
  const id = sha(key);
  const m = await store.get(`admins/${id}`);
  if (!m) return null;
  if (!m.lastUsedAt || now - m.lastUsedAt > 3600000) { m.lastUsedAt = now; await store.set(`admins/${id}`, m); }
  return { id, name: m.name, role: m.role };
}

export async function addMember(store, name, role, who, now = Date.now()) {
  name = String(name || '').trim().slice(0, 80);
  if (!name) return { error: 'name_required', status: 400 };
  if (!ROLES.slice(0, 3).includes(role)) return { error: 'bad_role', status: 400 };
  const key = 'vca_' + randomBytes(24).toString('base64url');
  await store.set(`admins/${sha(key)}`, { name, role, createdAt: now, createdBy: who.name });
  await audit(store, who, 'team.add', `${name} (${role})`, now);
  return { key, name, role };
}

export async function listMembers(store) {
  const out = [];
  for (const k of await store.list('admins/')) {
    const m = await store.get(k);
    if (m) out.push({ id: k.slice(7), name: m.name, role: m.role, createdAt: m.createdAt, createdBy: m.createdBy, lastUsedAt: m.lastUsedAt || null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeMember(store, id, who, now = Date.now()) {
  if (!/^[0-9a-f]{64}$/.test(String(id))) return { error: 'not_found', status: 404 };
  const m = await store.get(`admins/${id}`);
  if (!m) return { error: 'not_found', status: 404 };
  await store.delete(`admins/${id}`);
  await audit(store, who, 'team.remove', `${m.name} (${m.role})`, now);
  return { ok: true };
}

export async function audit(store, who, action, detail, now = Date.now()) {
  await store.set(`audit/${String(now).padStart(15, '0')}-${randomBytes(3).toString('hex')}`, { at: now, who: who.name, role: who.role, action, detail: String(detail || '').slice(0, 500) });
}

export async function auditLog(store, limit = 300) {
  const keys = (await store.list('audit/')).sort().reverse().slice(0, limit);
  const vals = await Promise.all(keys.map(k => store.get(k)));
  return vals.filter(Boolean);
}
