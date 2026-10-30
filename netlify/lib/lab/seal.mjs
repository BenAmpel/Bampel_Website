// CCAIR Behavioral Lab: sealed fields. Participant identifiers (email, panel ID, sensitive embedded data) and free-text
// answers are encrypted on the server with the study's public key before they are stored. Only the holder of the private
// key can read them; the key never reaches the server (the admin page makes it in the browser, or `node scripts/lab/seal.mjs
// keygen`). Netlify's own disk encryption does not protect against someone with access to the site; this does.
//
// Scheme (an ECIES "sealed box"): a fresh X25519 key pair per value; the shared secret with the study key goes through
// HKDF-SHA256 (salt = ephemeral public key + study public key, info = "ccair-lab-seal-v1") to an AES-256-GCM key; the
// header "sealed:v1:<kid>" is authenticated as additional data. Token:
//   sealed:v1:<kid>:<base64url(ephemeral public key 32 | iv 12 | ciphertext | tag 16)>
// kid = the first 16 hex digits of SHA-256(raw public key), so a token names the key that opens it.
// The plaintext is JSON, so a token decrypts back to the exact value (a string, usually). The browser copy of the
// decryption is in static/lab/engine/seal.js; both are tested against each other's output.
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

export const SEAL_RE = /sealed:v1:[0-9a-f]{16}:[A-Za-z0-9_-]{80,}/g;
const INFO = Buffer.from('ccair-lab-seal-v1');
export const isSealed = v => typeof v === 'string' && v.startsWith('sealed:v1:');

const raw = b64 => { const b = Buffer.from(String(b64 || ''), 'base64url'); return b.length === 32 ? b : null; };
export const kidOf = pub => createHash('sha256').update(raw(pub)).digest('hex').slice(0, 16);

// The study's public key as stored (meta/seal): base64url of the raw 32-byte X25519 key. Returns null if it is not one.
export function checkPublicKey(pub) {
  const b = raw(pub);
  if (!b || b.every(x => x === 0)) return null;
  try { createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b.toString('base64url') }, format: 'jwk' }); } catch { return null; }
  return { publicKey: b.toString('base64url'), kid: kidOf(b.toString('base64url')) };
}

export function generateKeys(study = '') {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const jwk = privateKey.export({ format: 'jwk' }), x = publicKey.export({ format: 'jwk' }).x;
  return { publicKey: x, privateKey: { kty: 'OKP', crv: 'X25519', x, d: jwk.d, kid: kidOf(x), study, createdAt: new Date().toISOString(), use: 'CCAIR Behavioral Lab sealed fields' } };
}

// A sealer for one public key: value -> token. Empty values stay empty (nothing to protect, and "" stays "answered nothing").
export function sealer(pub) {
  const k = checkPublicKey(pub);
  if (!k) return null;
  const recipient = createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: k.publicKey }, format: 'jwk' }), rpk = raw(k.publicKey);
  return value => {
    if (value == null || value === '' || isSealed(value)) return value;
    const eph = generateKeyPairSync('x25519'), epk = raw(eph.publicKey.export({ format: 'jwk' }).x);
    const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
    const key = Buffer.from(hkdfSync('sha256', shared, Buffer.concat([epk, rpk]), INFO, 32)), iv = randomBytes(12), head = `sealed:v1:${k.kid}`;
    const c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(head));
    const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final(), c.getAuthTag()]);
    return `${head}:${Buffer.concat([epk, iv, ct]).toString('base64url')}`;
  };
}

// Opens one token with a private key file ({ x, d } as made above). Throws on a wrong key or a changed token.
export function unseal(token, priv) {
  const m = String(token).match(/^sealed:v1:([0-9a-f]{16}):([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('not a sealed value');
  if (m[1] !== kidOf(priv.x)) throw new Error(`sealed with key ${m[1]}, not this key (${kidOf(priv.x)})`);
  const b = Buffer.from(m[2], 'base64url'), epk = b.subarray(0, 32), iv = b.subarray(32, 44), body = b.subarray(44);
  const pk = createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', x: priv.x, d: priv.d }, format: 'jwk' });
  const shared = diffieHellman({ privateKey: pk, publicKey: createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: epk.toString('base64url') }, format: 'jwk' }) });
  const key = Buffer.from(hkdfSync('sha256', shared, Buffer.concat([epk, raw(priv.x)]), INFO, 32));
  const d = createDecipheriv('aes-256-gcm', key, iv); d.setAAD(Buffer.from(`sealed:v1:${m[1]}`)); d.setAuthTag(body.subarray(body.length - 16));
  return JSON.parse(Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString('utf8'));
}

// Replaces every token in a text (a CSV, JSON or JSONL export) that this key opens. CSV fields are quoted when the
// value needs it; inside JSON the value is written as a JSON string. Tokens for other keys are left as they are.
export function unsealText(text, priv, { format = 'csv' } = {}) {
  let opened = 0, other = 0;
  const out = String(text).replace(SEAL_RE, tok => {
    let v;
    try { v = unseal(tok, priv); } catch { other++; return tok; }
    opened++;
    let s = typeof v === 'string' ? v : JSON.stringify(v);
    if (format === 'json') return JSON.stringify(s).slice(1, -1);
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;   // never a spreadsheet formula (as toCsv)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  });
  return { text: out, opened, other };
}

// ---------- the study's key (meta/seal in the study store) ----------
export async function sealInfo(store) {
  const m = await store.get('meta/seal');
  return m && m.publicKey ? { enabled: true, kid: m.kid, publicKey: m.publicKey, setAt: m.setAt, setBy: m.setBy, previous: m.previous || [] } : { enabled: false, previous: (m && m.previous) || [] };
}

// Set or turn off the study's key. A replaced key is kept in `previous`, so the admin page can say which key file opens
// older values. Values already stored are never re-encrypted (the server cannot read them).
export async function setSealKey(store, publicKey, who, now = Date.now()) {
  const cur = (await store.get('meta/seal')) || {};
  const previous = (cur.previous || []).slice(-20);
  if (publicKey == null) {
    if (cur.publicKey) previous.push({ kid: cur.kid, publicKey: cur.publicKey, setAt: cur.setAt, replacedAt: now });
    await store.set('meta/seal', { previous });
    return { ok: true, enabled: false };
  }
  const k = checkPublicKey(publicKey);
  if (!k) return { error: 'bad_key', status: 400, hint: 'That is not an X25519 public key (32 bytes, base64url).' };
  if (k.kid === cur.kid) return { ok: true, enabled: true, kid: k.kid };
  if (cur.publicKey) previous.push({ kid: cur.kid, publicKey: cur.publicKey, setAt: cur.setAt, replacedAt: now });
  await store.set('meta/seal', { publicKey: k.publicKey, kid: k.kid, setAt: now, setBy: who.name, previous });
  return { ok: true, enabled: true, kid: k.kid };
}

// A type's answer log (every change to an answer, with its value): entries for free-text questions are sealed like the answer.
export function sealLog(log, questions, seal) {
  if (!seal || !Array.isArray(log)) return log;
  const text = new Set((questions || []).filter(q => q && q.type === 'text').map(q => q.id));
  for (const a of log) if (a && text.has(a.name) && typeof a.value === 'string') a.value = seal(a.value);
  return log;
}

// One sealer per request, cached on S.
export async function sealerFor(S) {
  if (S._sealer !== undefined) return S._sealer;
  const m = await S.store.get('meta/seal');
  S._sealer = m && m.publicKey ? sealer(m.publicKey) : null;
  return S._sealer;
}

// Embedded data from the study link that identifies a person: declared sensitive, the panel's ID parameter, or a name that
// says so (email, PROLIFIC_PID, workerId, participant_id, ...). Those are sealed; other embedded data (wave, source) is not.
const ID_NAME = /email|prolific|worker|mturk|(^|_)p?id$|participant|respondent|panel_?id|sona/i;
export function sensitiveEmbedded(def, panelParam) {
  if (!def || def.source !== 'url') return false;
  if (def.sensitive === false) return false;
  return def.sensitive === true || (!!panelParam && def.param === panelParam) || ID_NAME.test(def.name || '') || ID_NAME.test(def.param || '');
}
