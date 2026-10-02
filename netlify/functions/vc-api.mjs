// Verification study API (Netlify Function, served at /api/vc/*).
// Participants sign in (GSU email, or a pilot access code) and get a short-lived token
// that every other participant route requires.
// Admin routes take a key in the x-admin-key header: the owner's VC_ADMIN_KEY environment
// variable, or a team member key the owner created. Each route needs a minimum role.
import { getStore } from '@netlify/blobs';
import * as core from '../lib/vc-core.mjs';
import * as content from '../lib/vc-content.mjs';
import * as admin from '../lib/vc-admin.mjs';
import { runSelfTest } from '../lib/vc-selftest.mjs';

function blobStore() {
  const s = getStore({ name: 'verification-study', consistency: 'strong' });
  return {
    get: key => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value),
    delete: key => s.delete(key),
    // Conditional writes: compare-and-swap on the etag, or create-only.
    getMeta: async key => { const r = await s.getWithMetadata(key, { type: 'json' }); return r ? { data: r.data, etag: r.etag } : null; },
    setIf: async (key, value, cond) => (await s.setJSON(key, value, cond.onlyIfNew ? { onlyIfNew: true } : { onlyIfMatch: cond.etag })).modified !== false,
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
const csv = (text, name) => new Response(text, {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
});
const MAX_BODY = 4_000_000; // bytes; a trial with raw events is well under 1 MB

function reply(result) {
  if (result && result.error) return json(result, result.status || 400);
  return json(result);
}

// Minimum role for each admin action.
const NEED = {
  me: 'viewer', participants: 'viewer', 'export.csv': 'viewer', 'export-surveys.csv': 'viewer', 'export.json': 'viewer', rows: 'viewer', records: 'viewer', raw: 'viewer',
  content: 'viewer', 'content-history': 'viewer',
  'content-save': 'editor', 'content-restore': 'editor',
  roster: 'manager', lookup: 'manager', 'credit.csv': 'manager', create: 'manager', 'set-test': 'manager',
  delete: 'owner', 'delete-test': 'owner', 'self-test': 'owner', team: 'owner', 'team-add': 'owner', 'team-remove': 'owner', activity: 'owner'
};

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/vc\/?/, '');
  const store = blobStore();
  let body = {};
  if (req.method === 'POST') {
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too_large' }, 413);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'bad_json' }, 400); }
  }

  try {
    if (route === 'content') return json(content.publicContent(await content.getContent(store)));
    if (route === 'login') {
      const creds = body.email != null ? { email: body.email, confirm: body.confirm === true } : { code: body.code };
      return reply(await core.login(store, creds));
    }
    if (['resume', 'consent', 'session', 'view', 'trial', 'survey'].includes(route)) {
      const pid = await core.verifyToken(store, body.token);
      if (!pid) return json({ error: 'expired' }, 401);
      switch (route) {
        case 'resume': return reply(await core.resume(store, pid));
        case 'consent': return reply(await core.consent(store, pid, body.agree === true));
        case 'session': return reply(await core.startSession(store, pid));
        case 'view': return reply(await core.viewTrial(store, pid, Number(body.session), body.index === 'practice' ? 'practice' : Number(body.index)));
        case 'trial': return reply(await core.saveTrial(store, pid, Number(body.session), body.index === 'practice' ? 'practice' : Number(body.index), body.data));
        case 'survey': return reply(await core.saveSurvey(store, pid, Number(body.session), body.kind, body.data));
      }
    }

    if (route.startsWith('admin/')) {
      if (!process.env.VC_ADMIN_KEY) return json({ error: 'admin_disabled', hint: 'Set VC_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
      const who = await admin.authAdmin(store, req.headers.get('x-admin-key'), process.env.VC_ADMIN_KEY);
      if (!who) return json({ error: 'forbidden' }, 403);
      const action = route.slice(6);
      const need = NEED[action];
      if (!need) return json({ error: 'not_found' }, 404);
      if (!admin.can(who.role, need)) return json({ error: 'not_allowed', need }, 403);
      const list = v => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 2000);
      const gap = body.gapDays == null || body.gapDays === '' ? undefined : Number(body.gapDays);
      if (gap !== undefined && !(Number.isInteger(gap) && gap >= 0 && gap <= 60)) return json({ error: 'bad_gap', hint: 'Gap days must be a whole number from 0 to 60.' }, 400);
      // Batched exports: the admin page asks for at most 25 participants per request.
      const codes = (url.searchParams.get('codes') || '').split(',').filter(x => /^(P-[0-9a-f]{16}|VC-[A-Z0-9]{4}-[A-Z0-9]{4})$/.test(x)).slice(0, 25);

      switch (action) {
        case 'me': return json({ name: who.name, role: who.role, roles: admin.ROLE_INFO });
        case 'participants': return json(await core.listParticipants(store));
        case 'export.json': return json(await core.exportAll(store));
        case 'rows': return json(await core.exportRows(store, url.searchParams.get('kind') === 'surveys' ? 'surveys' : 'trials', codes.length ? codes : ['none']));
        case 'records': return json(await core.exportRecords(store, codes.length ? codes : ['none']));
        case 'raw': return json(codes.length === 1 ? await core.exportRaw(store, codes[0]) : { error: 'one_code' });
        case 'export.csv': return csv(await core.exportCsv(store), 'verification_trials.csv');
        case 'credit.csv': return csv(await core.exportCredit(store), 'extra_credit.csv');
        case 'export-surveys.csv': return csv(await core.exportSurveyCsv(store), 'verification_surveys.csv');
        case 'content': return json({ ...(await content.getContent(store)), _textFields: content.TEXT_FIELDS, _aiTypes: content.AI_TYPES });
        case 'content-history': return json(await content.contentHistory(store));
        case 'team': return json(await admin.listMembers(store));
        case 'activity': return json(await admin.auditLog(store));
      }
      if (req.method !== 'POST') return json({ error: 'post_required' }, 405);
      switch (action) {
        case 'content-save': {
          const r = await content.saveContent(store, body.content, who.name, body.baseVersion);
          if (r.ok) await admin.audit(store, who, 'content.save', `version ${r.version}${body.note ? ': ' + body.note : ''}`);
          return reply(r);
        }
        case 'content-restore': {
          const r = await content.restoreContent(store, Number(body.version), who.name);
          if (r.ok) await admin.audit(store, who, 'content.restore', `version ${body.version} restored as version ${r.version}`);
          return reply(r);
        }
        case 'roster': {
          const r = await core.addRoster(store, list(body.emails), { label: body.label, gapDays: gap, test: !!body.test });
          await admin.audit(store, who, 'students.add', `${r.added} added${body.label ? ' (' + body.label + ')' : ''}${body.test ? ', test' : ''}`);
          return json(r);
        }
        case 'lookup': return json(await core.lookupEmails(store, list(body.emails)));
        case 'set-test': {
          const r = await core.setTest(store, String(body.id || ''), body.test === true);
          if (r.ok) await admin.audit(store, who, 'participant.set_test', `${r.code} marked ${r.test ? 'test' : 'real'}`);
          return reply(r);
        }
        case 'create': {
          const n = Math.max(1, Math.min(300, Number(body.count) || 1));
          const r = await core.createParticipants(store, n, { label: body.label, gapDays: gap, test: !!body.test });
          await admin.audit(store, who, 'codes.create', `${n} pilot codes${body.test ? ', test' : ''}`);
          return json(r);
        }
        case 'delete': {
          const r = await core.deleteParticipant(store, String(body.id || ''));
          if (r.ok) await admin.audit(store, who, 'participant.delete', `${r.code}${r.test ? ' (test)' : ''}, ${r.records} records`);
          return reply(r);
        }
        case 'delete-test': {
          if (body.confirm !== 'DELETE') return json({ error: 'confirm_required' }, 400);
          const r = await core.deleteTestParticipants(store);
          await admin.audit(store, who, 'participant.delete_test', `${r.participants} test participants, ${r.records} records`);
          return json(r);
        }
        case 'self-test': {
          const r = await runSelfTest(store, { condition: String(body.condition || ''), code: body.code ? String(body.code) : undefined, keep: body.keep === true });
          if (r.done) await admin.audit(store, who, 'self_test', `${r.condition}: ${r.passed} passed, ${r.failed} failed${r.kept ? ', kept ' + r.code : ''}`);
          return reply(r);
        }
        case 'team-add': return reply(await admin.addMember(store, body.name, body.role, who));
        case 'team-remove': return reply(await admin.removeMember(store, body.id, who));
      }
    }
    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('vc-api error', route, err);
    return json({ error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/vc/*' };
