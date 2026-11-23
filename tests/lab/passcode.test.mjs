// Study access code (enrollment.passcode): every new sign-in must give it, the code alone starts an anonymous
// participant, preview links skip it, browsers and redacted design files never see it, and wrong guesses are capped.
import { core, content, S } from './compat.mjs';
import * as E from '../../netlify/lib/lab/engine.mjs';
import { exportDesign } from '../../netlify/lib/lab/studyfile.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';

const store = memStore({ latency: 0, name: 'passcode-test' });
let now = Date.UTC(2026, 10, 23, 15);

// No code set: sign-in works as before, and the browser is told there is none.
assert.equal(content.publicContent(await content.getContent(store)).passcode, false);
assert.equal((await core.login(store, { passcode: 'anything' }, now)).error, 'invalid_code', 'no code set: a code alone is not a way in');

const c = structuredClone(await content.getContent(store));
c.enrollment.passcode = 'bad code!';
assert(content.validateContent(c).some(e => /access code/.test(e)), 'spaces and symbols refused');
c.enrollment.passcode = 'Demo-7';
assert.deepEqual(content.validateContent(c), [], 'a short word with a hyphen is accepted');
await content.saveContent(store, c, 't', 0, now);
const pub = content.publicContent(await content.getContent(store));
assert.equal(pub.passcode, true); assert(!JSON.stringify(pub).includes('Demo-7'), 'code sent to the browser');

// The code alone, any case, outer spaces: a new anonymous participant each time.
const a = await core.login(store, { passcode: ' demo-7 ' }, now), b = await core.login(store, { passcode: 'DEMO-7' }, now);
assert(a.token && b.token); assert.equal(a.consented, false);
const pa = await core.verifyToken(store, a.token, now), pb = await core.verifyToken(store, b.token, now);
assert(pa && pb && pa !== pb, 'each sign-in is its own participant');
const rec = await core.loadParticipant(store, pa); assert.equal(rec.label, 'access-code'); assert.equal(rec.selfSignup, true); assert.equal(rec.test, false);
console.log('access code alone: case and spaces ignored, one new anonymous participant per sign-in');

// Every other way in needs it too, except test participants made by the team (preview links).
assert.equal((await core.login(store, {}, now)).error, 'passcode');
assert.equal((await core.login(store, { email: 'x@gsu.edu', confirm: true }, now)).error, 'passcode', 'email sign-up bypassed the code');
assert.equal((await core.login(store, { code: pa }, now)).error, 'passcode', 'a participant code bypassed the code');
assert((await core.login(store, { code: pa, passcode: 'demo-7' }, now)).token);
const [t] = (await core.createParticipants(store, 1, { test: true, label: 'preview' }, now)).created;
assert((await core.login(store, { code: t.code }, now)).token, 'preview link asked for the code');
console.log('email, participant-code and empty sign-ins need the code; preview links do not');

// Redacted design files blank it; a clone (redact: false) keeps it.
assert.equal((await exportDesign(S(store), { now })).content.enrollment.passcode, '');
assert.equal((await exportDesign(S(store), { redact: false, now })).content.enrollment.passcode, 'Demo-7');

// Wrong guesses: capped for the whole study per window, then the right code is refused too until the window passes.
const before = (await store.list('passcode-try/')).length; assert.equal(before, 0, 'sign-ins that sent no password are refused but not counted');
assert.equal((await core.login(store, { code: pa, passcode: 'nope' }, now)).error, 'passcode');
assert.equal((await store.list('passcode-try/')).length, 1, 'a wrong password is counted');
for (let i = 1; i < E.PASSCODE_FAIL_LIMIT; i++) assert.equal((await core.login(store, { passcode: 'guess' + i }, now + i)).error, 'passcode');
assert.equal((await core.login(store, { passcode: 'demo-7' }, now + 100)).error, 'too_many_tries');
assert((await core.login(store, { passcode: 'demo-7' }, now + E.PASSCODE_WINDOW_MS + 1000)).token, 'window passed, code works again');
assert.equal((await store.list('passcode-try/')).length, 0, 'old failures cleaned up');
console.log('wrong guesses capped per window and cleaned up after');

// The study's cap holds: once it is full, a new password sign-in gets the "study is full" record, not a place.
const c3 = structuredClone(await content.getContent(store)); c3.enrollment.quota = { total: (await store.list('cond/')).length, perCondition: {} };
await content.saveContent(store, c3, 't', (await content.getContent(store)).version, now);
const late = await core.login(store, { passcode: 'demo-7' }, now + E.PASSCODE_WINDOW_MS + 2000);
assert.equal((await core.loadParticipant(store, await core.verifyToken(store, late.token, now + E.PASSCODE_WINDOW_MS + 2000))).screenedOut.reason, 'quota_full');
console.log('the study cap stops new password sign-ins');

// Clearing it restores the usual sign-in.
const c2 = structuredClone(await content.getContent(store)); c2.enrollment.passcode = '';
await content.saveContent(store, c2, 't', (await content.getContent(store)).version, now);
assert.equal(content.publicContent(await content.getContent(store)).passcode, false);
assert.equal((await core.login(store, { email: 'y@gsu.edu' }, now)).error, 'confirm_new');
console.log('blank code: back to email sign-in');
