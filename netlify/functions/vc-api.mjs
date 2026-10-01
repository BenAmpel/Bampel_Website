// Verification study API (Netlify Function, served at /api/vc/*).
// Participants sign in (email + PIN, or a pilot access code) and get a short-lived token
// that every other participant route requires.
// Admin routes require the VC_ADMIN_KEY environment variable, sent as the x-admin-key header.
import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import * as core from '../lib/vc-core.mjs';

function blobStore() {
  const s = getStore({ name: 'verification-study', consistency: 'strong' });
  return {
    get: key => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value),
    list: async prefix => {
      const keys = [];
      for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key);
      return keys;
    }
  };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
});

function adminOk(req) {
  const want = process.env.VC_ADMIN_KEY || '';
  const got = req.headers.get('x-admin-key') || '';
  if (want.length < 16 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

function reply(result) {
  if (result && result.error) return json(result, result.status || 400);
  return json(result);
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/vc\/?/, '');
  const store = blobStore();
  let body = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); } }

  try {
    if (route === 'login') {
      const creds = body.email != null ? { email: body.email, pin: body.pin, setPin: body.setPin === true } : { code: body.code };
      return reply(await core.login(store, creds));
    }
    if (['resume', 'consent', 'session', 'trial', 'survey'].includes(route)) {
      const pid = await core.verifyToken(store, body.token);
      if (!pid) return json({ error: 'expired' }, 401);
      switch (route) {
        case 'resume': return reply(await core.resume(store, pid));
        case 'consent': return reply(await core.consent(store, pid, body.agree === true));
        case 'session': return reply(await core.startSession(store, pid));
        case 'trial': return reply(await core.saveTrial(store, pid, Number(body.session), body.index === 'practice' ? 'practice' : Number(body.index), body.data));
        case 'survey': return reply(await core.saveSurvey(store, pid, Number(body.session), body.kind, body.data));
      }
    }
    if (route.startsWith('admin/')) {
      if (!process.env.VC_ADMIN_KEY) return json({ error: 'admin_disabled', hint: 'Set VC_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
      if (!adminOk(req)) return json({ error: 'forbidden' }, 403);
      const action = route.slice(6);
      const list = v => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 2000);
      const gap = body.gapDays == null || body.gapDays === '' ? undefined : Number(body.gapDays);
      if (action === 'create' && req.method === 'POST') {
        const n = Math.max(1, Math.min(300, Number(body.count) || 1));
        return json(await core.createParticipants(store, n, { label: body.label, gapDays: gap, test: !!body.test }));
      }
      if (action === 'roster' && req.method === 'POST') return json(await core.addRoster(store, list(body.emails), { label: body.label, gapDays: gap, test: !!body.test }));
      if (action === 'lookup' && req.method === 'POST') return json(await core.lookupEmails(store, list(body.emails)));
      if (action === 'reset-pin' && req.method === 'POST') return reply(await core.resetPin(store, body.email));
      if (action === 'participants') return json(await core.listParticipants(store));
      if (action === 'export.json') return json(await core.exportAll(store));
      if (action === 'export.csv') return new Response(await core.exportCsv(store), {
        headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="verification_trials.csv"', 'cache-control': 'no-store' }
      });
    }
    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('vc-api error', route, err);
    return json({ error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/vc/*' };
