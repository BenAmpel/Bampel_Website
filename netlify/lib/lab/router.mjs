// CCAIR Behavioral Lab: HTTP routes for every study.
//   /api/lab/{study}/{route}   participant and admin routes for one study
//   /api/vc/{route}            the same, for the built-in verification study (original URLs)
//   /api/lab/_lab/{route}      lab-level routes: list, create, and update studies
// Participant routes need a token from login. Admin routes need a key in the x-admin-key header: the
// lab owner key (LAB_ADMIN_KEY, or VC_ADMIN_KEY) or a team key for that study. Each route has a
// minimum role (NEED).
import { blobsStore, getMany as E_getMany } from './store.mjs';
import * as E from './engine.mjs';
import * as content from './content.mjs';
import * as admin from './admin.mjs';
import * as backup from './backup.mjs';
import { runSelfTest } from './selftest.mjs';
import { getStudy, listStudies, createStudy, updateStudy, typeFor } from './registry.mjs';
import { TYPES } from './types/index.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const csv = (text, name) => new Response(text, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const reply = r => r && r.error ? json(r, r.status || 400) : json(r);
const MAX_BODY = 4_000_000;

const NEED = {
  me: 'viewer', participants: 'viewer', 'export.csv': 'viewer', 'export-surveys.csv': 'viewer', 'export.json': 'viewer', rows: 'viewer', records: 'viewer', raw: 'viewer',
  content: 'viewer', 'content-history': 'viewer',
  'content-save': 'editor', 'content-restore': 'editor',
  roster: 'manager', lookup: 'manager', 'credit.csv': 'manager', create: 'manager', 'set-test': 'manager',
  delete: 'owner', 'delete-test': 'owner', 'self-test': 'owner', 'backup-status': 'owner', 'backup-run': 'owner', 'backup-part': 'owner',
  team: 'owner', 'team-add': 'owner', 'team-remove': 'owner', activity: 'owner'
};

export async function handle(req, { getStore, env }) {
  const url = new URL(req.url);
  const ownerKey = env.LAB_ADMIN_KEY || env.VC_ADMIN_KEY || '';
  let studyId, route;
  if (url.pathname.startsWith('/api/vc/')) { studyId = 'verification'; route = url.pathname.slice(8); }
  else { const m = url.pathname.match(/^\/api\/lab\/([^/]+)\/?(.*)$/); if (!m) return json({ error: 'not_found' }, 404); studyId = m[1]; route = m[2]; }

  let body = {};
  if (req.method === 'POST') {
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too_large' }, 413);
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'bad_json' }, 400); }
  }
  const registry = blobsStore(getStore, 'lab-registry');

  try {
    if (studyId === '_lab') return await labRoute(route, req, body, { registry, getStore, ownerKey });

    const study = await getStudy(registry, studyId);
    if (!study) return json({ error: 'no_study' }, 404);
    const type = typeFor(study);
    const S = { store: blobsStore(getStore, study.storeName), type, study };
    const backupStore = () => blobsStore(getStore, study.backupName);

    if (route === 'content') return json(content.publicContent(await content.getContent(S.store, type), type, study));
    if (route === 'login') return reply(await E.login(S, body.email != null ? { email: body.email, confirm: body.confirm === true } : { code: body.code }));
    if (['resume', 'consent', 'session', 'view', 'trial', 'survey'].includes(route)) {
      const pid = await E.verifyToken(S, body.token);
      if (!pid) return json({ error: 'expired' }, 401);
      const idx = body.index === 'practice' ? 'practice' : Number(body.index);
      switch (route) {
        case 'resume': return reply(await E.resume(S, pid));
        case 'consent': return reply(await E.consent(S, pid, body.agree === true));
        case 'session': return reply(await E.startSession(S, pid));
        case 'view': return reply(await E.viewTrial(S, pid, Number(body.session), idx));
        case 'trial': return reply(await E.saveTrial(S, pid, Number(body.session), idx, body.data));
        case 'survey': return reply(await E.saveSurvey(S, pid, Number(body.session), body.kind, body.data));
      }
    }

    if (route.startsWith('admin/')) {
      if (!ownerKey) return json({ error: 'admin_disabled', hint: 'Set LAB_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
      const who = await admin.authAdmin(S.store, req.headers.get('x-admin-key'), ownerKey);
      if (!who) return json({ error: 'forbidden' }, 403);
      const action = route.slice(6), need = NEED[action];
      if (!need) return json({ error: 'not_found' }, 404);
      if (!admin.can(who.role, need)) return json({ error: 'not_allowed', need }, 403);
      const list = v => (Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 2000);
      const gap = body.gapDays == null || body.gapDays === '' ? undefined : Number(body.gapDays);
      if (gap !== undefined && !(Number.isInteger(gap) && gap >= 0 && gap <= 60)) return json({ error: 'bad_gap', hint: 'Gap days must be a whole number from 0 to 60.' }, 400);
      // Batched exports: the admin page asks for a few participants per request.
      const codes = (url.searchParams.get('codes') || '').split(',').filter(x => E.PID_RE.test(x) || /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(x)).slice(0, 25);
      const c = await content.getContent(S.store, type);

      switch (action) {
        case 'me': return json({ name: who.name, role: who.role, roles: admin.ROLE_INFO, study: { id: study.id, name: study.name, type: type.id, typeLabel: type.label, paths: study.paths }, conditions: type.conditionsOf(c) });
        case 'participants': return json(await E.listParticipants(S));
        case 'export.json': return json(await E.exportRecords(S));
        case 'export.csv': return csv(await E.exportCsv(S), `${study.id}_trials.csv`);
        case 'export-surveys.csv': return csv(await E.exportSurveyCsv(S), `${study.id}_surveys.csv`);
        case 'credit.csv': return csv(await E.exportCredit(S), `${study.id}_extra_credit.csv`);
        case 'rows': return json(await E.exportRows(S, url.searchParams.get('kind') === 'surveys' ? 'surveys' : 'trials', codes.length ? codes : ['none']));
        case 'records': return json(await E.exportRecords(S, codes.length ? codes : ['none']));
        case 'raw': return json(codes.length === 1 ? await E.exportRaw(S, codes[0]) : { error: 'one_code' });
        case 'content': return json({ ...c, _textFields: content.textFieldsFor(type), _meta: type.editorMeta ? type.editorMeta() : {}, _type: type.id,
          _conditions: type.conditionsOf(c), _surveyRules: type.surveyRules || [], _questionTypes: content.QUESTION_TYPES });
        case 'content-history': return json(await content.contentHistory(S.store));
        case 'team': return json(await admin.listMembers(S.store));
        case 'activity': return json(await admin.auditLog(S.store));
        case 'backup-status': return json(await backup.backupStatus(backupStore()));
        case 'backup-part': {
          const part = url.searchParams.get('part');
          if (part === 'people') {
            const recs = await E.exportRecords(S, codes.length ? codes : ['none']);
            const contacts = (await E_getMany(S.store, codes.map(x => `contact/${x}`))).map(([k, v]) => v ? { code: k.slice(8), ...v } : null).filter(Boolean);
            const plans = (await E_getMany(S.store, (await Promise.all(codes.map(x => S.store.list(`plans/${x}/`)))).flat())).map(([key, v]) => ({ key, ...v }));
            return json({ ...recs, contacts, plans });
          }
          if (part === 'history') {
            const keys = (await S.store.list('content/history/')).sort(), page = Math.max(0, Number(url.searchParams.get('page')) || 0);
            const vals = await E_getMany(S.store, keys.slice(page * 10, page * 10 + 10));
            return json({ total: keys.length, entries: vals.filter(([, v]) => v != null).map(([key, value]) => ({ key, value })) });
          }
          if (part === 'meta') {
            const keys = (await Promise.all(['content/current', 'cond/', 'cond-test/', 'consent/'].map(p => S.store.list(p)))).flat().filter(k => !k.startsWith('content/history/'));
            const vals = await E_getMany(S.store, keys);
            return json({ study: study.id, type: type.id, exportedAt: new Date().toISOString(), entries: vals.filter(([, v]) => v != null).map(([key, value]) => ({ key, value })),
              team: await admin.listMembers(S.store), activity: await admin.auditLog(S.store, 5000) });
          }
          return json({ error: 'bad_part' }, 400);
        }
      }
      if (req.method !== 'POST') return json({ error: 'post_required' }, 405);
      switch (action) {
        case 'content-save': {
          const r = await content.saveContent(S.store, type, body.content, who.name, body.baseVersion);
          if (r.ok) await admin.audit(S.store, who, 'content.save', `version ${r.version}${body.note ? ': ' + body.note : ''}`);
          return reply(r);
        }
        case 'content-restore': {
          const r = await content.restoreContent(S.store, type, Number(body.version), who.name);
          if (r.ok) await admin.audit(S.store, who, 'content.restore', `version ${body.version} restored as version ${r.version}`);
          return reply(r);
        }
        case 'roster': {
          const r = await E.addRoster(S, list(body.emails), { label: body.label, gapDays: gap, test: !!body.test });
          await admin.audit(S.store, who, 'students.add', `${r.added} added${body.label ? ' (' + body.label + ')' : ''}${body.test ? ', test' : ''}`);
          return json(r);
        }
        case 'lookup': return json(await E.lookupEmails(S, list(body.emails)));
        case 'set-test': {
          const r = await E.setTest(S, String(body.id || ''), body.test === true);
          if (r.ok) await admin.audit(S.store, who, 'participant.set_test', `${r.code} marked ${r.test ? 'test' : 'real'}`);
          return reply(r);
        }
        case 'create': {
          const n = Math.max(1, Math.min(300, Number(body.count) || 1));
          const r = await E.createParticipants(S, n, { label: body.label, gapDays: gap, test: !!body.test });
          await admin.audit(S.store, who, 'codes.create', `${n} pilot codes${body.test ? ', test' : ''}`);
          return json(r);
        }
        case 'self-test': {
          const r = await runSelfTest(S, { condition: String(body.condition || ''), code: body.code ? String(body.code) : undefined, keep: body.keep === true });
          if (r.done) await admin.audit(S.store, who, 'self_test', `${r.condition}: ${r.passed} passed, ${r.failed} failed${r.kept ? ', kept ' + r.code : ''}`);
          return reply(r);
        }
        case 'backup-run': {
          const r = await backup.runBackup(S.store, backupStore(), { budgetMs: 7000 });
          await admin.audit(S.store, who, 'backup.run', `${r.copied} copied, ${r.pending} pending`);
          return json(r);
        }
        case 'delete': {
          const r = await E.deleteParticipant(S, String(body.id || ''));
          if (r.ok) { await backup.purgeParticipant(backupStore(), r.code, r.condition); await admin.audit(S.store, who, 'participant.delete', `${r.code}${r.test ? ' (test)' : ''}, ${r.records} records`); }
          return reply(r);
        }
        case 'delete-test': {
          if (body.confirm !== 'DELETE') return json({ error: 'confirm_required' }, 400);
          const r = await E.deleteTestParticipants(S);
          for (const t of r.deleted) await backup.purgeParticipant(backupStore(), t.code, t.condition);
          await admin.audit(S.store, who, 'participant.delete_test', `${r.participants} test participants, ${r.records} records`);
          return json({ ok: true, participants: r.participants, records: r.records });
        }
        case 'team-add': return reply(await admin.addMember(S.store, body.name, body.role, who));
        case 'team-remove': return reply(await admin.removeMember(S.store, body.id, who));
      }
    }
    return json({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('lab-api error', studyId, route, err);
    return json({ error: 'server_error' }, 500);
  }
}

// Lab-level routes: the public list of studies, and (owner only) study types, creating and updating studies.
async function labRoute(route, req, body, { registry, ownerKey }) {
  if (route === 'studies' && req.method === 'GET' && !req.headers.get('x-admin-key')) {
    return json((await listStudies(registry)).map(s => ({ id: s.id, name: s.name, description: s.description, type: s.type, paths: { participant: s.paths.participant } })));
  }
  if (!ownerKey) return json({ error: 'admin_disabled', hint: 'Set LAB_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
  const who = await admin.authAdmin(registry, req.headers.get('x-admin-key'), ownerKey);
  if (!who || who.role !== 'owner') return json({ error: 'forbidden' }, 403);
  switch (route) {
    case 'me': return json({ name: who.name, role: who.role });
    case 'studies': return json(await listStudies(registry, { all: true }));
    case 'types': return json(Object.values(TYPES).map(t => ({ id: t.id, label: t.label, description: t.description })));
    case 'create': return req.method === 'POST' ? reply(await createStudy(registry, body, who)) : json({ error: 'post_required' }, 405);
    case 'update': return req.method === 'POST' ? reply(await updateStudy(registry, String(body.id || ''), body)) : json({ error: 'post_required' }, 405);
  }
  return json({ error: 'not_found' }, 404);
}

