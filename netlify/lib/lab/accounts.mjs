// CCAIR Behavioral Lab: researcher accounts (lab-wide), stored in the "lab-registry" store.
//
// Key schema (registry store)
//   accounts/{sha256(lowercased email)}   the account record (see newAccount); changed only with update() (compare-and-swap)
//   invites/{sha256(token)}               invitation or password-reset link record; write-once
//   invites-used/{sha256(token)}          written once to consume a link; a second redemption finds it and is refused
//   revoked/{tokenId}                     a signed-out session token; write-once
//   signin-try/{sha256(email)}/{minute}-{rand}       one key per sign-in attempt, written BEFORE the password is checked and
//   signin-try-pair/{sha256(email|ip)}/...           deleted again if the attempt succeeds, so what is counted is failures plus
//   signin-try-ip/{sha256(ip)}/...                   attempts still in flight; parallel requests cannot all slip under a limit
//   pw-try/{accountId}/...                           the same for checks of the current password in account settings
//   signin-audit/{sha256(email)}/{window}            written once per email per 15 minutes so failures are logged at most that often
//   totp-used/{accountId}/{step}          a 30-second authenticator step that was accepted (no code is accepted twice)
//   recovery-used/{accountId}/{hmac(code)}   a recovery code that was used (single use)
//   meta/session-secret                   32 random bytes (hex) that sign session tokens; created once
//   meta/recovery-key                     32 random bytes (hex) that key the recovery-code hashes; created once
//
// Why this is safe on a store without atomic updates: everything that must happen exactly once (redeeming a
// link, using a recovery code, accepting an authenticator step, creating an account) is its own write-once
// key (setNew), as the study engine does. The account record itself only holds rarely changed fields
// (password hash, roles, authenticator, tokenEpoch) and is written with update(). A lost update there needs
// two changes to the same account in the same instant and can at worst undo one change; "sign out everywhere"
// re-reads after writing and repeats until the new tokenEpoch is visible.
//
// Exactly-once keys use claim(): write the key with a request-unique value (create-only), read it back, and go ahead only if the
// stored value is ours. That is first-writer-wins on a store whose create-only write is atomic, and it still removes most of the
// overlap on one that is not. A residual race remains if two requests write and read back in strict alternation on a store whose
// conditional write is not atomic; for a link or a code that needs the secret in the first place, which is why the limits below
// are counted by write-first keys as well.
//
// An account carries a random incarnation id (inc). Tokens and links carry it, so removing an account and inviting the same email
// again cannot revive old tokens or links, even though the account id (a hash of the email) is the same. Links also carry the
// account's linkEpoch at issue time; issuing a link, activating, resetting, changing the password, signing out everywhere, or
// disabling bumps it, so only the newest unused link of the right kind works.
import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { setNew, update } from './store.mjs';
import { ROLES, audit } from './admin.mjs';

export const SESSION_HOURS = 8;
export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;
export const MIN_PASSWORD = 12;
export const MAX_PASSWORD = 200;
export const FAIL_LIMIT = 10;            // attempts per (email, client address) in the window
export const FAIL_WINDOW_MIN = 15;
export const LOCK_MIN = 15;
export const IP_FAIL_LIMIT = 40;         // per client address, all emails; a campus network shares one address, so this is higher
export const LIMITS = { pair: FAIL_LIMIT, email: 200, ip: IP_FAIL_LIMIT, pw: 10 };   // email: across all addresses, against distributed guessing; pw: current-password checks per account
export const SCRYPT = { N: 65536, r: 8, p: 1, keylen: 64 };   // 64 MiB of memory; about 0.1 s on a laptop, well under 1 s on a function
const MAXMEM = 128 * SCRYPT.N * SCRYPT.r * 2;

export const sha = s => createHash('sha256').update(s).digest('hex');
const b64 = b => Buffer.from(b).toString('base64url');
export const normalizeEmail = e => String(e == null ? '' : e).trim().toLowerCase();
export const EMAIL_RE = /^[^\s@,;<>()"]{1,64}@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;
export const validEmail = e => e.length <= 254 && EMAIL_RE.test(e);
export const accountId = email => sha(normalizeEmail(email));
export const ID_RE = /^[0-9a-f]{64}$/;
const STUDY_ID_RE = /^[a-z][a-z0-9-]{2,30}$/;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

// ---------- passwords ----------
const scryptP = (pw, salt, p) => new Promise((res, rej) => scrypt(pw, salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: MAXMEM }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(password) {
  const salt = randomBytes(16), params = { alg: 'scrypt', ...SCRYPT };
  return { pwHash: b64(await scryptP(String(password), salt, params)), pwSalt: b64(salt), pwParams: params };
}

export async function verifyPassword(password, acct) {
  if (!acct || !acct.pwHash || !acct.pwSalt || !acct.pwParams) return false;
  const want = Buffer.from(acct.pwHash, 'base64url'), got = await scryptP(String(password).slice(0, MAX_PASSWORD), Buffer.from(acct.pwSalt, 'base64url'), acct.pwParams);
  return want.length === got.length && timingSafeEqual(want, got);
}

// Work for an email that has no usable account, so an unknown email takes as long as a wrong password.
const DUMMY_SALT = Buffer.alloc(16, 7);
export const dummyHash = pw => scryptP(String(pw || '').slice(0, MAX_PASSWORD), DUMMY_SALT, { alg: 'scrypt', ...SCRYPT }).then(() => false);

const COMMON = ['password1234', 'password12345', 'passwordpassword', 'password123456', 'passw0rd1234', '123456789012', '1234567890123', '111111111111', '000000000000', 'qwertyuiopas', 'qwertyuiop12', 'qwerty123456', 'abcdefghijkl',
  'iloveyou1234', 'letmein12345', 'welcome12345', 'administrator', 'changeme1234', 'admin1234567', 'adminadmin12', 'georgiastate', 'georgiastate1', 'panthers1234', 'trustno1trustno1', 'monkey123456', 'football1234', 'baseball1234', 'dragon123456', 'sunshine1234', 'princess1234'];

export function passwordProblem(pw, { email = '', name = '' } = {}) {
  pw = String(pw == null ? '' : pw);
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const low = pw.toLowerCase(), em = normalizeEmail(email), local = em.split('@')[0], nm = String(name || '').toLowerCase().replace(/\s+/g, '');
  if (em && (low === em || low.includes(em))) return 'The password cannot contain your email address.';
  if (local.length >= 4 && low.includes(local)) return 'The password cannot contain the first part of your email address.';
  if (nm.length >= 4 && low.replace(/\s+/g, '').includes(nm)) return 'The password cannot contain your name.';
  if (new Set(low).size <= 2) return 'Choose a password with more variety.';
  if (COMMON.includes(low) || COMMON.includes(low.replace(/[^a-z0-9]/g, ''))) return 'That password is on a list of very common passwords. Choose another.';
  return null;
}

// ---------- authenticator (TOTP, RFC 6238, SHA-1, 30 s, 6 digits) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[\s=-]/g, '')) {
    const i = B32.indexOf(ch); if (i < 0) return null;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function hotp(secret, counter, digits = 6) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(b).digest(), o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
export const totpAt = (secret, ms, digits = 6) => hotp(secret, Math.floor(ms / 30000), digits);
// Returns the matching 30-second step (within one step either side), or null.
export function totpMatch(secretB32, code, ms, window = 1) {
  const secret = base32Decode(secretB32), c = String(code || '').replace(/\s/g, '');
  if (!secret || !/^\d{6}$/.test(c)) return null;
  const step = Math.floor(ms / 30000);
  let hit = null;
  for (let d = -window; d <= window; d++) {   // no early exit: the same work whatever the code is
    const want = Buffer.from(hotp(secret, step + d)), got = Buffer.from(c);
    if (timingSafeEqual(want, got) && hit == null) hit = step + d;
  }
  return hit;
}
export const newTotpSecret = () => base32Encode(randomBytes(20));
export const otpauthUri = (secret, email) => `otpauth://totp/${encodeURIComponent('CCAIR Behavioral Lab')}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent('CCAIR Behavioral Lab')}&algorithm=SHA1&digits=6&period=30`;

const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => { let c = ''; for (let i = 0; i < 10; i++) c += RC_ALPHABET[randomInt(RC_ALPHABET.length)]; return c.slice(0, 5) + '-' + c.slice(5); });   // randomInt: no modulo bias
}
// Recovery codes are stored as HMAC(recovery key, account id | code), not a bare hash, so a copy of the account record cannot be searched
// offline without the key (which is a separate record, meta/recovery-key).
async function recoveryKey(registry, create = false) {
  let m = await registry.get('meta/recovery-key');
  if (!m && create) { await setNew(registry, 'meta/recovery-key', { value: randomBytes(32).toString('hex'), createdAt: Date.now() }); m = await registry.get('meta/recovery-key'); }
  return m ? Buffer.from(m.value, 'hex') : null;
}
export async function recoveryHash(registry, id, code, create = false) {
  const k = await recoveryKey(registry, create);
  return k ? createHmac('sha256', k).update(`recovery|${id}|${String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`).digest('hex') : null;
}

// Write a once-only key with a value unique to this request, read it back, and report whether this request is the one that owns it.
export async function claim(store, key, extra = {}) {
  const nonce = randomBytes(12).toString('hex');
  if (!(await setNew(store, key, { ...extra, nonce }))) return false;
  const back = await store.get(key);
  return !!back && back.nonce === nonce;
}

// ---------- session tokens ----------
// A token is  s1.<payload>.<signature>  with payload = base64url(JSON { a: account id, e: tokenEpoch, i: issued, x: expires, j: random id }).
// The signature is HMAC-SHA256 under the lab session secret with a domain prefix, so a participant token (signed
// with a study's pepper, a different format) is never a researcher token and the reverse.
export async function sessionSecret(registry, create = false) {
  let m = await registry.get('meta/session-secret');
  if (!m && create) { await setNew(registry, 'meta/session-secret', { value: randomBytes(32).toString('hex'), createdAt: Date.now() }); m = await registry.get('meta/session-secret'); }
  return m ? Buffer.from(m.value, 'hex') : null;
}
const sign = (secret, payload) => createHmac('sha256', secret).update('lab-session|' + payload).digest('base64url');

export async function signSession(registry, acct, now) {
  const secret = await sessionSecret(registry, true), exp = now + SESSION_HOURS * 3600000;
  const payload = b64(JSON.stringify({ a: acct.id, n: acct.inc || '', e: acct.tokenEpoch || 0, i: now, x: exp, j: randomBytes(9).toString('base64url') }));
  return { token: `s1.${payload}.${sign(secret, payload)}`, expiresAt: exp };
}

export const bearerOf = req => { const m = String(req.headers.get('authorization') || '').match(/^Bearer\s+(\S{20,2000})$/i); return m ? m[1] : null; };

// Returns { account, claims } for a valid, current session, or null.
export async function sessionAccount(registry, token, now) {
  const m = String(token || '').match(/^s1\.([A-Za-z0-9_-]{10,600})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return null;
  const secret = await sessionSecret(registry, false);
  if (!secret) return null;
  const want = Buffer.from(sign(secret, m[1])), got = Buffer.from(m[2]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let c; try { c = JSON.parse(Buffer.from(m[1], 'base64url').toString()); } catch { return null; }
  if (!c || !ID_RE.test(String(c.a)) || !(c.x > now) || !(c.i <= now + 60000) || typeof c.j !== 'string') return null;
  const acct = await registry.get(`accounts/${c.a}`);
  if (!acct || acct.disabled || !acct.pwHash || (acct.tokenEpoch || 0) !== c.e || (acct.inc || '') !== (c.n || '')) return null;
  if (await registry.get(`revoked/${c.j}`)) return null;
  return { account: { ...acct, id: c.a }, claims: c };
}

export async function revokeSession(registry, claims, now) { await setNew(registry, `revoked/${claims.j}`, { at: now, accountId: claims.a }); }

// Bumps tokenEpoch so every token issued before now stops working. Re-reads and repeats if a concurrent write undid it.
export async function bumpEpoch(registry, id, extra) {
  for (let i = 0; i < 4; i++) {
    const r = await update(registry, `accounts/${id}`, d => { d.tokenEpoch = (d.tokenEpoch || 0) + 1; d.linkEpoch = (d.linkEpoch || 0) + 1; if (extra) extra(d); });
    if (r.error) return r;
    const back = await registry.get(`accounts/${id}`);
    if (back && back.tokenEpoch >= r.value.tokenEpoch) return r;
  }
  return { error: 'busy', status: 503 };
}

// ---------- accounts ----------
export const publicAccount = a => ({ id: a.id, email: a.email, name: a.name, labOwner: !!a.labOwner, disabled: !!a.disabled, status: a.disabled ? 'disabled' : a.pwHash ? 'active' : 'invited',
  totp: !!(a.totp && a.totp.enabledAt), studyRoles: a.studyRoles || {}, createdAt: a.createdAt, createdBy: a.createdBy, passwordChangedAt: a.passwordChangedAt || null });

const getAccount = async (registry, id) => { const a = ID_RE.test(String(id)) ? await registry.get(`accounts/${id}`) : null; return a ? { ...a, id } : null; };

export async function listResearchers(registry) {
  const out = [];
  for (const k of await registry.list('accounts/')) { const a = await registry.get(k); if (a) out.push(publicAccount({ ...a, id: k.slice(9) })); }
  return out.sort((x, y) => String(x.name || x.email).localeCompare(String(y.name || y.email)));
}

// roles: { studyId: role }. Unknown study IDs and bad roles are rejected; null or '' removes a role.
export function cleanRoles(input, studyIds) {
  const out = {};
  for (const [id, role] of Object.entries(input && typeof input === 'object' ? input : {})) {
    if (role == null || role === '') continue;
    if (!STUDY_ID_RE.test(id) || !studyIds.includes(id)) return { error: 'bad_study', status: 400, hint: `There is no study called "${id}".` };
    if (!ROLES.includes(role)) return { error: 'bad_role', status: 400, hint: `"${role}" is not a role.` };
    out[id] = role;
  }
  return { roles: out };
}

async function issueLink(registry, kind, acct, who, now) {
  const token = (kind === 'invite' ? 'vci_' : 'vcr_') + randomBytes(32).toString('base64url'), hash = sha(token);
  const expiresAt = now + (kind === 'invite' ? INVITE_DAYS * 86400000 : RESET_HOURS * 3600000);
  // A new link replaces every earlier one: bump the account's linkEpoch and stamp the link with the new value and the account's incarnation.
  const r = await update(registry, `accounts/${acct.id}`, d => { d.linkEpoch = (d.linkEpoch || 0) + 1; });
  if (r.error) return r;
  await setNew(registry, `invites/${hash}`, { kind, accountId: acct.id, inc: r.value.inc || '', le: r.value.linkEpoch, createdAt: now, expiresAt, createdBy: who.name });
  return { token, path: `/lab/signin/#${kind === 'invite' ? 'invite' : 'reset'}=${token}`, expiresAt };
}

export async function inviteResearcher(registry, { name, email, studyRoles, labOwner }, who, studyIds, now) {
  email = normalizeEmail(email); name = clean(name, 80);
  if (!validEmail(email)) return { error: 'bad_email', status: 400, hint: 'Enter a valid email address.' };
  if (!name) return { error: 'name_required', status: 400, hint: 'Enter the researcher\'s name.' };
  const cr = cleanRoles(studyRoles, studyIds); if (cr.error) return cr;
  const id = accountId(email);
  const rec = { email, name, inc: randomBytes(8).toString('hex'), linkEpoch: 0, pwHash: null, pwSalt: null, pwParams: null, totp: null, studyRoles: cr.roles, labOwner: labOwner === true, disabled: false, createdAt: now, createdBy: who.name, tokenEpoch: 0, passwordChangedAt: null };
  if (!(await setNew(registry, `accounts/${id}`, rec))) {
    const cur = await getAccount(registry, id);
    if (cur && cur.pwHash) return { error: 'exists', status: 409, hint: 'That person already has an account. Use "Reset password link" instead.' };
    await update(registry, `accounts/${id}`, d => { d.name = name; d.studyRoles = cr.roles; d.labOwner = labOwner === true; d.disabled = false; });   // still waiting for the first invitation: refresh it
  }
  const link = await issueLink(registry, 'invite', { id }, who, now);
  if (link.error) return link;
  await audit(registry, who, 'researcher.invite', `${name} <${email}>${labOwner === true ? ', lab owner' : ''}${rolesText(cr.roles)}`, now);
  return { ok: true, link, account: publicAccount({ ...(await registry.get(`accounts/${id}`)), id }) };
}
const rolesText = r => { const e = Object.entries(r || {}); return e.length ? '; ' + e.map(([s, x]) => `${s}: ${x}`).join(', ') : ''; };

export async function resetLink(registry, id, who, now) {
  const a = await getAccount(registry, id); if (!a) return { error: 'not_found', status: 404 };
  if (a.disabled) return { error: 'disabled', status: 400, hint: 'Enable the account first.' };
  const link = await issueLink(registry, a.pwHash ? 'reset' : 'invite', a, who, now);
  if (link.error) return link;
  await audit(registry, who, 'researcher.reset_link', `${a.email}`, now);
  return { ok: true, link, email: a.email, name: a.name };
}

export async function updateResearcher(registry, id, ch, who, studyIds, now) {
  const a = await getAccount(registry, id); if (!a) return { error: 'not_found', status: 404 };
  const self = who.accountId && who.accountId === id;
  if (self && (ch.disabled === true || ch.labOwner === false)) return { error: 'self', status: 400, hint: 'You cannot disable yourself or remove your own lab owner access. Another owner, or the owner key, can do that.' };
  let roles = null;
  if (ch.studyRoles !== undefined) { const cr = cleanRoles(ch.studyRoles, studyIds); if (cr.error) return cr; roles = cr.roles; }
  const name = ch.name !== undefined ? clean(ch.name, 80) : null;
  if (name === '') return { error: 'name_required', status: 400 };
  const r = await update(registry, `accounts/${id}`, d => {
    if (roles) d.studyRoles = roles;
    if (typeof ch.labOwner === 'boolean') d.labOwner = ch.labOwner;
    if (typeof ch.disabled === 'boolean') d.disabled = ch.disabled;
    if (name) d.name = name;
  });
  if (r.error) return r;
  if (roles) await audit(registry, who, 'researcher.roles', `${a.email}: ${Object.keys(roles).length ? rolesText(roles).slice(2) : 'no study access'}`, now);
  if (typeof ch.labOwner === 'boolean' && ch.labOwner !== !!a.labOwner) await audit(registry, who, 'researcher.lab_owner', `${a.email}: ${ch.labOwner ? 'made lab owner' : 'lab owner removed'}`, now);
  if (typeof ch.disabled === 'boolean' && ch.disabled !== !!a.disabled) { if (ch.disabled) await bumpEpoch(registry, id); await audit(registry, who, ch.disabled ? 'researcher.disable' : 'researcher.enable', a.email, now); }
  return { ok: true, account: publicAccount({ ...r.value, id }) };
}

export async function revokeAll(registry, id, who, now) {
  const a = await getAccount(registry, id); if (!a) return { error: 'not_found', status: 404 };
  const r = await bumpEpoch(registry, id); if (r.error) return r;
  await audit(registry, who, 'researcher.revoke_sessions', a.email, now);
  return { ok: true };
}

export async function clearTotp(registry, id, who, now) {
  const a = await getAccount(registry, id); if (!a) return { error: 'not_found', status: 404 };
  const r = await update(registry, `accounts/${id}`, d => { d.totp = null; d.totpPending = null; d.recovery = []; });
  if (r.error) return r;
  await audit(registry, who, 'totp.disabled', `${a.email} (removed by the owner)`, now);
  return { ok: true };
}

// A study was deleted: take its role off every account that had one (study-level only; nothing else in an account names a
// study, and links are per account, not per study). Returns the emails changed, for the audit entry.
export async function dropStudyRoles(registry, studyId) {
  const changed = [];
  for (const k of await registry.list('accounts/')) {
    const a = await registry.get(k);
    if (!a || !a.studyRoles || !Object.hasOwn(a.studyRoles, studyId)) continue;
    const r = await update(registry, k, d => { if (d.studyRoles) delete d.studyRoles[studyId]; });
    if (r.error) return r;
    changed.push(a.email);
  }
  return { ok: true, changed };
}

export async function removeResearcher(registry, id, who, now) {
  const a = await getAccount(registry, id); if (!a) return { error: 'not_found', status: 404 };
  if (who.accountId === id) return { error: 'self', status: 400, hint: 'You cannot remove your own account.' };
  await registry.delete(`accounts/${id}`);
  await audit(registry, who, 'researcher.remove', `${a.email}`, now);
  return { ok: true };
}

// ---------- invitation and reset links ----------
const STALE = { error: 'invalid_link', status: 400, hint: 'This link is no longer valid: a newer link was made, or the account has changed. Ask the lab owner for a new one.' };
async function loadLink(registry, token, now) {
  token = String(token || '');
  if (!/^vc[ir]_[A-Za-z0-9_-]{43}$/.test(token)) return { error: 'invalid_link', status: 400, hint: 'This link is not valid.' };
  const hash = sha(token), inv = await registry.get(`invites/${hash}`);
  if (!inv) return { error: 'invalid_link', status: 400, hint: 'This link is not valid.' };
  if (inv.expiresAt <= now) return { error: 'expired_link', status: 400, hint: 'This link has expired. Ask the lab owner for a new one.' };
  if (await registry.get(`invites-used/${hash}`)) return { error: 'used_link', status: 400, hint: 'This link was already used. If you need another, ask the lab owner.' };
  const acct = await getAccount(registry, inv.accountId);
  if (!acct || acct.disabled) return { error: 'invalid_link', status: 400, hint: 'This link is not valid.' };
  // Only the newest link, issued to this incarnation of the account, and of the right kind for its state: an invitation only while there is no password,
  // a reset only once there is one.
  if ((acct.inc || '') !== (inv.inc || '') || (acct.linkEpoch || 0) !== (inv.le || 0)) return STALE;
  if ((inv.kind === 'invite') === !!acct.pwHash) return STALE;
  return { hash, inv, acct };
}

export async function linkInfo(registry, token, now) {
  const l = await loadLink(registry, token, now); if (l.error) return l;
  return { ok: true, kind: l.inv.kind, email: l.acct.email, name: l.acct.name, expiresAt: l.inv.expiresAt };
}

// Accepting a link sets the password and nothing else: it never returns a session, so it cannot get around an authenticator.
// The person then signs in, and is asked for a code if the account has one.
export async function acceptLink(registry, { token, name, password, password2 }, now) {
  const l = await loadLink(registry, token, now); if (l.error) return l;
  if (password2 !== undefined && password !== password2) return { error: 'mismatch', status: 400, hint: 'The two passwords are not the same.' };
  const nm = l.inv.kind === 'invite' ? clean(name || l.acct.name, 80) : l.acct.name;
  if (!nm) return { error: 'name_required', status: 400, hint: 'Enter your name.' };
  const problem = passwordProblem(password, { email: l.acct.email, name: nm });
  if (problem) return { error: 'weak_password', status: 400, hint: problem };
  const pw = await hashPassword(password);
  // Consume the link before changing anything. Of two simultaneous redemptions only the one that owns this key goes on.
  if (!(await claim(registry, `invites-used/${l.hash}`, { at: now, accountId: l.acct.id }))) return { error: 'used_link', status: 400, hint: 'This link was already used. If you need another, ask the lab owner.' };
  const r = await update(registry, `accounts/${l.acct.id}`, d => {
    if ((d.inc || '') !== (l.inv.inc || '') || (d.linkEpoch || 0) !== (l.inv.le || 0) || (l.inv.kind === 'invite') === !!d.pwHash) return STALE;   // changed since the check above
    Object.assign(d, pw); d.name = nm; d.passwordChangedAt = now; d.tokenEpoch = (d.tokenEpoch || 0) + 1; d.linkEpoch = (d.linkEpoch || 0) + 1;
  });
  if (r.error) return r;
  await audit(registry, { name: nm, role: 'researcher' }, l.inv.kind === 'invite' ? 'invite.used' : 'reset.used', l.acct.email, now);
  return { ok: true, kind: l.inv.kind, email: l.acct.email };
}

// ---------- sign-in ----------
const minuteOf = ms => Math.floor(ms / 60000);
const pad = (n, w) => String(n).padStart(w, '0');
const minuteOfKey = (k, prefix) => Number(k.slice(prefix.length).split('-')[0]);

// Counts attempts. try() writes this request's attempt key first (write-once, unique), then lists and counts, and refuses when the count is over
// the limit, all before any password work. So requests that arrive together each see the others' keys and cannot all pass a limit that is
// checked before anything is written. release() deletes this request's keys (on success, or when the attempt was refused, so a refused attempt
// does not extend a lockout).
async function attemptGuard(registry, specs, now) {
  const mine = [];
  for (const sp of specs) { const k = `${sp.prefix}${pad(minuteOf(now), 9)}-${randomBytes(4).toString('hex')}`; await setNew(registry, k, { at: now }); mine.push(k); }
  const cur = minuteOf(now); let over = null;
  for (const sp of specs) {
    const keys = await registry.list(sp.prefix), recent = keys.filter(k => cur - minuteOfKey(k, sp.prefix) < FAIL_WINDOW_MIN);
    const stale = keys.filter(k => cur - minuteOfKey(k, sp.prefix) > 60);
    if (stale.length > 20) await Promise.all(stale.slice(0, 50).map(k => registry.delete(k)));   // housekeeping only
    if (recent.length > sp.limit && !over) over = Math.min(...recent.map(k => minuteOfKey(k, sp.prefix))) * 60000 + FAIL_WINDOW_MIN * 60000;
  }
  const release = () => Promise.all(mine.map(k => registry.delete(k)));
  return { over, release };
}
const lockedReply = (until, now) => ({ error: 'locked', status: 429, hint: 'Too many sign-in attempts. Wait 15 minutes and try again, or ask the lab owner for help.', retryAfterSeconds: Math.max(1, Math.ceil((until - now) / 1000)) });

export const me = a => ({ id: a.id, email: a.email, name: a.name, labOwner: !!a.labOwner, totp: !!(a.totp && a.totp.enabledAt), studyRoles: a.studyRoles || {} });
const BAD = { error: 'bad_credentials', status: 401, hint: 'The email or password was not accepted.' };

// Failures are logged at most once per email per 15 minutes (the audit entry says so), not once per attempt.
async function auditFailure(registry, acct, what, now) {
  if (!acct) return;
  if (await claim(registry, `signin-audit/${acct.id}/${Math.floor(minuteOf(now) / FAIL_WINDOW_MIN)}`, { at: now })) await audit(registry, { name: acct.name, role: 'researcher' }, 'signin.failure', `${acct.email}: ${what} (further failed sign-ins in the next 15 minutes are not logged one by one)`, now);
}

export async function signIn(registry, { email, password, code }, { now, ip }) {
  email = normalizeEmail(email);
  const okForm = validEmail(email) && typeof password === 'string' && password.length > 0;
  if (!okForm) { await dummyHash(password); return BAD; }
  const h = sha(email), pair = sha(`pair|${email}|${ip || ''}`), ih = ip ? sha('ip|' + ip) : null;
  // Lock per (email, address): someone sending wrong passwords for a known email from their own address locks only themselves. A much higher ceiling
  // across all addresses stops guessing spread over many of them, and a per-address ceiling stops one address trying many emails.
  const specs = [{ prefix: `signin-try-pair/${pair}/`, limit: LIMITS.pair }, { prefix: `signin-try/${h}/`, limit: LIMITS.email }];
  if (ih) specs.push({ prefix: `signin-try-ip/${ih}/`, limit: LIMITS.ip });
  const g = await attemptGuard(registry, specs, now);
  if (g.over) { await g.release(); return lockedReply(g.over, now); }

  const acct = await getAccount(registry, h);
  const fail = async why => { await auditFailure(registry, acct && acct.pwHash && !acct.disabled ? acct : null, why, now); return why === 'wrong code' ? { error: 'bad_code', status: 401, hint: 'That code was not accepted.' } : BAD; };
  let ok = false;
  if (acct && acct.pwHash && !acct.disabled) ok = await verifyPassword(password, acct); else await dummyHash(password);
  if (!ok) return fail('wrong password');

  if (acct.totp && acct.totp.enabledAt) {
    const c = String(code == null ? '' : code).trim();
    if (!c) { await g.release(); return { error: 'code_required', status: 401, hint: 'Enter the 6-digit code from your authenticator app, or a recovery code.' }; }
    let accepted = false;
    const step = totpMatch(acct.totp.secret, c, now);
    if (step != null) accepted = await claim(registry, `totp-used/${h}/${step}`, { at: now });   // the same step cannot be used twice
    else if (!/^\d{6}$/.test(c.replace(/\s/g, ''))) {
      const rh = await recoveryHash(registry, h, c);
      if (rh && (acct.recovery || []).includes(rh) && (accepted = await claim(registry, `recovery-used/${h}/${rh}`, { at: now }))) await audit(registry, { name: acct.name, role: 'researcher' }, 'recovery.used', acct.email, now);
    }
    if (!accepted) return fail('wrong code');
  }
  await g.release();
  const s = await signSession(registry, acct, now);
  await audit(registry, { name: acct.name, role: 'researcher' }, 'signin.success', acct.email, now);
  return { ok: true, ...s, account: me(acct) };
}

// The current password is asked for again in account settings (change password, turn off the authenticator, new recovery codes). A stolen
// session must not be able to guess it without limit, so those checks are counted per account in the same way.
async function checkPassword(registry, acct, password, now) {
  const g = await attemptGuard(registry, [{ prefix: `pw-try/${acct.id}/`, limit: LIMITS.pw }], now);
  if (g.over) { await g.release(); return lockedReply(g.over, now); }
  const ok = await verifyPassword(String(password || ''), acct);
  if (ok) await g.release();
  return ok ? null : { error: 'wrong_password', status: 400, hint: 'The password was not accepted.' };
}

// ---------- the signed-in account's own settings ----------
export async function changePassword(registry, acct, { current, next, next2 }, now) {
  const bad = await checkPassword(registry, acct, current, now);
  if (bad) return bad.error === 'wrong_password' ? { ...bad, hint: 'The current password was not accepted.' } : bad;
  if (next2 !== undefined && next !== next2) return { error: 'mismatch', status: 400, hint: 'The two new passwords are not the same.' };
  const problem = passwordProblem(next, acct); if (problem) return { error: 'weak_password', status: 400, hint: problem };
  const pw = await hashPassword(next);
  const r = await bumpEpoch(registry, acct.id, d => { Object.assign(d, pw); d.passwordChangedAt = now; });
  if (r.error) return r;
  await audit(registry, { name: acct.name, role: 'researcher' }, 'password.changed', acct.email, now);
  const s = await signSession(registry, { ...r.value, id: acct.id }, now);   // this browser stays signed in; every other session ends
  return { ok: true, ...s };
}

export async function renameSelf(registry, acct, name) {
  name = clean(name, 80); if (!name) return { error: 'name_required', status: 400 };
  const r = await update(registry, `accounts/${acct.id}`, d => { d.name = name; });
  return r.error ? r : { ok: true, name };
}

export async function totpSetup(registry, acct) {
  if (acct.totp && acct.totp.enabledAt) return { error: 'already_enabled', status: 400, hint: 'An authenticator is already set up. Turn it off first to set up a new one.' };
  const secret = newTotpSecret();
  const r = await update(registry, `accounts/${acct.id}`, d => { d.totpPending = { secret, at: Date.now() }; });
  return r.error ? r : { ok: true, secret, uri: otpauthUri(secret, acct.email) };
}

export async function totpEnable(registry, acct, code, now) {
  const cur = await registry.get(`accounts/${acct.id}`);
  if (!cur || !cur.totpPending) return { error: 'no_setup', status: 400, hint: 'Start the setup first.' };
  const step = totpMatch(cur.totpPending.secret, code, now);
  if (step == null) return { error: 'bad_code', status: 400, hint: 'That code was not accepted. Check the code in your app and your device clock, then try again.' };
  await claim(registry, `totp-used/${acct.id}/${step}`, { at: now });
  const codes = newRecoveryCodes(), hashes = await Promise.all(codes.map(c => recoveryHash(registry, acct.id, c, true)));
  const r = await update(registry, `accounts/${acct.id}`, d => { d.totp = { secret: d.totpPending.secret, enabledAt: now }; d.totpPending = null; d.recovery = hashes; d.recoveryAt = now; });
  if (r.error) return r;
  await audit(registry, { name: acct.name, role: 'researcher' }, 'totp.enabled', acct.email, now);
  return { ok: true, recoveryCodes: codes };
}

export async function totpDisable(registry, acct, password, now) {
  const bad = await checkPassword(registry, acct, password, now); if (bad) return bad;
  const r = await update(registry, `accounts/${acct.id}`, d => { d.totp = null; d.totpPending = null; d.recovery = []; });
  if (r.error) return r;
  await audit(registry, { name: acct.name, role: 'researcher' }, 'totp.disabled', acct.email, now);
  return { ok: true };
}

export async function regenRecovery(registry, acct, password, now) {
  if (!acct.totp || !acct.totp.enabledAt) return { error: 'no_totp', status: 400, hint: 'Set up an authenticator first.' };
  const bad = await checkPassword(registry, acct, password, now); if (bad) return bad;
  const codes = newRecoveryCodes(), hashes = await Promise.all(codes.map(c => recoveryHash(registry, acct.id, c, true)));
  const r = await update(registry, `accounts/${acct.id}`, d => { d.recovery = hashes; d.recoveryAt = now; });
  if (r.error) return r;
  await audit(registry, { name: acct.name, role: 'researcher' }, 'recovery.regenerated', acct.email, now);
  return { ok: true, recoveryCodes: codes };
}

export async function recoveryRemaining(registry, acct) {
  const hashes = acct.recovery || [];
  if (!hashes.length) return 0;
  const used = new Set((await registry.list(`recovery-used/${acct.id}/`)).map(k => k.split('/')[2]));
  return hashes.filter(h => !used.has(h)).length;
}
