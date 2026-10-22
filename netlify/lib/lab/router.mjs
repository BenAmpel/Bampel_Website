// CCAIR Behavioral Lab: HTTP routes for every study.
//   /api/lab/{study}/{route}   participant and admin routes for one study
//   /api/vc/{route}            the same, for the built-in verification study (original URLs)
//   /api/lab/_lab/{route}      lab-level routes: list, create, and update studies
// Participant routes need a token from login. Admin routes need either a key in the x-admin-key header (the
// lab owner key LAB_ADMIN_KEY or VC_ADMIN_KEY, or a team key for that study) or a researcher session in the
// Authorization header ("Bearer <token>", from /api/lab/_lab/auth/signin; its role for the study comes from the
// account's studyRoles, and a lab owner account is owner everywhere). Each route has a minimum role (NEED).
// The two kinds of token are different formats signed with different secrets, so neither works in the other's place.
import { blobsStore, getMany as E_getMany } from './store.mjs';
import * as E from './engine.mjs';
import * as content from './content.mjs';
import * as admin from './admin.mjs';
import * as backup from './backup.mjs';
import * as acc from './accounts.mjs';
import { runSelfTest } from './selftest.mjs';
import { getStudy, listStudies, createStudy, updateStudy, typeFor } from './registry.mjs';
import { TYPES } from './types/index.mjs';
import { importSurvey, ImportError } from './import/index.mjs';
import { templateList } from './templates.mjs';
import * as recruit from './recruit.mjs';
import { exportDesign, importDesign, cloneStudy } from './studyfile.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const csv = (text, name) => new Response(text, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const reply = r => r && r.error ? json(r, r.status || 400) : json(r);
const MAX_BODY = 4_000_000;
const MAX_IMPORT_BODY = 8_000_000;   // a survey file as JSON text (an .xlsx is base64); Netlify itself caps a request near 6 MB

const NEED = {
  me: 'viewer', participants: 'viewer', 'design.json': 'viewer', 'export.csv': 'viewer', 'export-surveys.csv': 'viewer', 'export.json': 'viewer', rows: 'viewer', records: 'viewer', raw: 'viewer',
  content: 'viewer', 'content-history': 'viewer',
  'content-save': 'editor', 'content-restore': 'editor', import: 'editor', preview: 'editor',
  roster: 'manager', lookup: 'manager', 'credit.csv': 'manager', create: 'manager', 'set-test': 'manager',
  delete: 'owner', 'delete-test': 'owner', 'self-test': 'owner', 'backup-status': 'owner', 'backup-run': 'owner', 'backup-part': 'owner',
  team: 'owner', 'team-add': 'owner', 'team-remove': 'owner', activity: 'owner'
};

export async function handle(req, { getStore, env, now }) {
  const clock = typeof now === 'function' ? now : Date.now;   // tests inject a clock
  const url = new URL(req.url);
  const ownerKey = env.LAB_ADMIN_KEY || env.VC_ADMIN_KEY || '';
  let studyId, route;
  if (url.pathname.startsWith('/api/vc/')) { studyId = 'verification'; route = url.pathname.slice(8); }
  else { const m = url.pathname.match(/^\/api\/lab\/([^/]+)\/?(.*)$/); if (!m) return json({ error: 'not_found' }, 404); studyId = m[1]; route = m[2]; }

  let body = {};
  if (req.method === 'POST') {
    const limit = /\/admin\/import$/.test(url.pathname) ? MAX_IMPORT_BODY : MAX_BODY;
    if (Number(req.headers.get('content-length') || 0) > limit) return json({ error: 'too_large', hint: limit === MAX_IMPORT_BODY ? 'This file is too large to import (the limit is about 5 MB).' : undefined }, 413);
    const text = await req.text();
    if (text.length > limit) return json({ error: 'too_large', hint: limit === MAX_IMPORT_BODY ? 'This file is too large to import (the limit is about 5 MB).' : undefined }, 413);
    try { body = JSON.parse(text || '{}'); } catch { return json({ error: 'bad_json' }, 400); }
  }
  const registry = blobsStore(getStore, 'lab-registry');

  try {
    if (studyId === '_lab') return await labRoute(route, req, body, { registry, getStore, ownerKey, clock });

    const study = await getStudy(registry, studyId);
    if (!study) return json({ error: 'no_study' }, 404);
    const type = typeFor(study);
    const S = { store: blobsStore(getStore, study.storeName), type, study };
    const backupStore = () => blobsStore(getStore, study.backupName);

    if (route === 'content') return json(content.publicContent(await content.getContent(S.store, type), type, study));
    // Stimulus files a researcher uploaded (audio, video, images), public like any page asset. Random names, so
    // a file name never hints at a condition or an answer. Range requests let browsers seek (Safari needs them).
    const fm = route.match(/^file\/(f-[0-9a-f]{12}\.[a-z0-9]{2,4})$/);
    if (fm && (req.method === 'GET' || req.method === 'HEAD')) return await serveFile(S.store, fm[1], req);
    if (route === 'login') return reply(await E.login(S, body.email != null ? { email: body.email, confirm: body.confirm === true } : body.panelId != null ? { panelId: body.panelId, panelMeta: { study: body.panelStudy, session: body.panelSession } } : { code: body.code }));
    if (['resume', 'consent', 'session', 'view', 'trial', 'survey', 'handoff', 'withdraw'].includes(route)) {
      const pid = await E.verifyToken(S, body.token);
      if (!pid) return json({ error: 'expired' }, 401);
      const idx = body.index === 'practice' ? 'practice' : Number(body.index);
      switch (route) {
        case 'resume': return reply(await E.resume(S, pid));
        case 'consent': return reply(await E.consent(S, pid, body.agree === true, Date.now(), { recording: typeof body.recording === 'boolean' ? body.recording : undefined }));
        case 'session': return reply(await E.startSession(S, pid, Date.now(), { embedded: body.embedded }));
        case 'view': return reply(await E.viewTrial(S, pid, Number(body.session), idx));
        case 'trial': return reply(await E.saveTrial(S, pid, Number(body.session), idx, body.data));
        case 'survey': return reply(await E.saveSurvey(S, pid, Number(body.session), body.kind, body.data));
        case 'withdraw': { const r = await recruit.markReturned(S, pid); if (r.error) return reply(r); }   // then the returned code, as for handoff
        // falls through
        case 'handoff': {   // the code and redirect for the outcome this participant has reached (none while the study goes on)
          const p = await E.loadParticipant(S, pid), c = await content.getContent(S.store, type);
          if (!p) return json({ error: 'expired' }, 401);
          return json(await recruit.handoff(S, p, (await E.resume(S, pid)).status || {}, c.enrollment.panel));
        }
      }
    }

    // Routes a study type adds for participants (type.routes, for example 'game/poll'); same token as the engine routes.
    if (type.routes && Object.hasOwn(type.routes, route)) {
      if (req.method !== 'POST') return json({ error: 'post_required' }, 405);
      const pid = await E.verifyToken(S, body.token);
      if (!pid) return json({ error: 'expired' }, 401);
      return reply(await type.routes[route](S, pid, body, clock()));
    }

    if (route.startsWith('admin/')) {
      const bearer = acc.bearerOf(req);
      let session = null;
      if (bearer) { session = await acc.sessionAccount(registry, bearer, clock()); if (!session) return json({ error: 'session_expired', hint: 'Your sign-in expired. Sign in again.' }, 401); }
      else if (!ownerKey) return json({ error: 'admin_disabled', hint: 'Set LAB_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
      const who = await admin.authAdmin(S.store, req.headers.get('x-admin-key'), ownerKey, clock(), { account: session && session.account, studyId: study.id });
      if (!who) return json({ error: 'forbidden' }, 403);
      const action = route.slice(6), typeRoute = type.adminRoutes && Object.hasOwn(type.adminRoutes, action) ? type.adminRoutes[action] : null, need = NEED[action] || (typeRoute && typeRoute.need);
      if (!need) return json({ error: 'not_found' }, 404);
      if (!admin.can(who.role, need)) return json({ error: 'not_allowed', need }, 403);
      // Admin routes a study type adds (type.adminRoutes: { need, post?, handler }); a result with csv is sent as a download.
      if (typeRoute) {
        if (typeRoute.post && req.method !== 'POST') return json({ error: 'post_required' }, 405);
        const r = await typeRoute.handler(S, { body, url, who, now: clock(), audit: (a, d) => admin.audit(S.store, who, a, d) });
        return r && r.csv != null ? csv(r.csv, r.filename || `${study.id}.csv`) : reply(r);
      }
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
        case 'design.json': return json(await exportDesign(S));
        case 'export.csv': return csv(await E.exportCsv(S), `${study.id}_trials.csv`);
        case 'export-surveys.csv': return csv(await E.exportSurveyCsv(S), `${study.id}_surveys.csv`);
        case 'credit.csv': return csv(await E.exportCredit(S), `${study.id}_extra_credit.csv`);
        case 'rows': return json(await E.exportRows(S, url.searchParams.get('kind') === 'surveys' ? 'surveys' : 'trials', codes.length ? codes : ['none']));
        case 'records': return json(await E.exportRecords(S, codes.length ? codes : ['none']));
        case 'raw': return json(codes.length === 1 ? await E.exportRaw(S, codes[0]) : { error: 'one_code' });
        case 'content': return json({ ...c, _textFields: content.textFieldsFor(type), _meta: type.editorMeta ? type.editorMeta() : {}, _type: type.id,
          _conditions: type.conditionsOf(c), _surveyRules: type.surveyRules || [], _questionTypes: content.QUESTION_TYPES, _panelPresets: recruit.presetList() });
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
            const extras = type.backupExtras ? await type.backupExtras(S, codes) : [];   // a study type's own per-participant state (the game: matches, payment draws, external IDs)
            return json({ ...recs, contacts, plans, extras });
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
        case 'import': {   // preview only: nothing is saved; the admin page loads the result into its draft and the normal save makes a version
          if (type.id !== 'vignettes') return json({ error: 'import_not_supported', hint: `Survey import works for studies of the type "${TYPES.vignettes.label}". This study's type is "${type.label}", which has no survey content to replace.` }, 400);
          try {
            const r = importSurvey(body);
            await admin.audit(S.store, who, 'survey.import_preview', `survey import previewed: ${r.report.detected}, ${r.report.counts.questions} questions${r.report.filename ? ' (' + r.report.filename.replace(/[^\w. -]/g, '').slice(0, 60) + ')' : ''}`);
            return json(r);
          } catch (e) { if (e instanceof ImportError) return json({ error: 'import_failed', hint: e.userMessage }, 400); throw e; }
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
        case 'preview': {   // one throwaway test participant, in the arm chosen, with no wait between sessions
          const conds = type.conditionsOf(c), cond = String(body.condition || '');
          if (cond && !conds.includes(cond)) return json({ error: 'bad_condition', hint: 'That condition no longer exists. Reload the page.' }, 400);
          const r = await E.createParticipants(S, 1, { label: 'preview', gapDays: 0, test: true, condition: cond || undefined });
          const made = r.created[0];
          await admin.audit(S.store, who, 'preview', `${made.code} (${made.condition})`);
          return json({ code: made.code, condition: made.condition, url: `${study.paths.participant}?code=${encodeURIComponent(made.code)}&preview=1` });
        }
        case 'self-test': {
          const r = await runSelfTest(S, { condition: String(body.condition || ''), code: body.code ? String(body.code) : undefined, keep: body.keep === true });
          if (r.done) {
            await admin.audit(S.store, who, 'self_test', `${r.condition}: ${r.passed} passed, ${r.failed} failed${r.kept ? ', kept ' + r.code : ''}`);
            await S.store.set('meta/last-selftest', { at: clock(), condition: r.condition, passed: r.passed, failed: r.failed, by: who.name });   // shown on "My studies"
          }
          return reply(r);
        }
        case 'backup-run': {
          const r = await backup.runBackup(S.store, backupStore(), { budgetMs: 7000 });
          await admin.audit(S.store, who, 'backup.run', `${r.copied} copied, ${r.pending} pending`);
          return json(r);
        }
        case 'delete': {
          const r = await E.deleteParticipant(S, String(body.id || ''));
          if (r.ok) { await backup.purgeParticipant(backupStore(), r.code, r.condition, r.extraKeys); await admin.audit(S.store, who, 'participant.delete', `${r.code}${r.test ? ' (test)' : ''}, ${r.records} records`); }
          return reply(r);
        }
        case 'delete-test': {
          if (body.confirm !== 'DELETE') return json({ error: 'confirm_required' }, 400);
          const r = await E.deleteTestParticipants(S);
          for (const t of r.deleted) await backup.purgeParticipant(backupStore(), t.code, t.condition, t.extraKeys);
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

const FILE_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime', png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
async function serveFile(store, name, req) {
  const f = await store.get(`files/${name}`);
  if (!f || typeof f.data !== 'string') return new Response('not found', { status: 404 });
  const bytes = Buffer.from(f.data, 'base64'), size = bytes.length;
  const head = { 'content-type': f.mime || FILE_TYPES[name.split('.').pop()] || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff' };
  const m = (req.headers.get('range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(req.method === 'HEAD' ? null : bytes.subarray(start, end + 1), { status: 206, headers: { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(req.method === 'HEAD' ? null : bytes, { status: 200, headers: { ...head, 'content-length': String(size) } });
}

// Lab-level routes.
//   public:        studies (the listed studies), auth/* (sign in; open an invitation or reset link)
//   any signed-in: me, mystudies, study-summary (a researcher session, or the owner key)
//   researcher:    account/* (their own settings; a session only)
//   owner:         types, studies (all), create, update, researchers/*, activity (owner key or a lab owner account)
async function labRoute(route, req, body, { registry, getStore, ownerKey, clock }) {
  const now = clock(), key = req.headers.get('x-admin-key'), bearer = acc.bearerOf(req);
  if (route === 'studies' && req.method === 'GET' && !key && !bearer) {
    return json((await listStudies(registry)).map(s => ({ id: s.id, name: s.name, description: s.description, type: s.type, paths: { participant: s.paths.participant } })));
  }
  if (route.startsWith('auth/')) return authRoute(route.slice(5), req, body, { registry, now });

  // Who is asking: a researcher session, or the owner key.
  let who, session = null;
  if (bearer) {
    session = await acc.sessionAccount(registry, bearer, now);
    if (!session) return json({ error: 'session_expired', hint: 'Your sign-in expired. Sign in again.' }, 401);
    const a = session.account;
    who = { id: 'account', name: a.name, role: a.labOwner ? 'owner' : 'researcher', accountId: a.id };
  } else {
    if (!ownerKey) return json({ error: 'admin_disabled', hint: 'Set LAB_ADMIN_KEY (16+ characters) in Netlify environment variables.' }, 503);
    who = await admin.authAdmin(registry, key, ownerKey, now);
    if (!who || who.role !== 'owner') return json({ error: 'forbidden' }, 403);
  }
  const isOwner = who.role === 'owner', post = req.method === 'POST';
  const needPost = () => (post ? null : json({ error: 'post_required' }, 405));

  if (route.startsWith('account/')) {
    if (!session) return json({ error: 'account_required', hint: 'These settings belong to a researcher account. Sign in with one.' }, 403);
    return accountRoute(route.slice(8), req, body, { registry, session, now, getStore });
  }
  switch (route) {
    case 'me': return json(session ? { ...acc.me(session.account), role: who.role } : { name: who.name, role: who.role });
    case 'mystudies': return json(await studiesFor(registry, getStore, session ? session.account : null));
    case 'study-summary': {
      const id = new URL(req.url).searchParams.get('id') || '';
      const a = session ? session.account : null;
      if (a && !a.labOwner && !Object.hasOwn(a.studyRoles || {}, id)) return json({ error: 'forbidden' }, 403);
      const study = await getStudy(registry, id);
      if (!study) return json({ error: 'no_study' }, 404);
      return json(await studySummary({ store: blobsStore(getStore, study.storeName), type: typeFor(study), study }));
    }
  }
  if (!isOwner) return json({ error: 'forbidden' }, 403);
  const studyIds = async () => (await listStudies(registry, { all: true })).map(s => s.id);
  switch (route) {
    case 'studies': return json(await listStudies(registry, { all: true }));
    case 'types': return json(Object.values(TYPES).map(t => ({ id: t.id, label: t.label, description: t.description })));
    case 'templates': return json(templateList());
    case 'create': {   // from a template or a type, or (body.design) from a study design file
      if (!post) return needPost();
      if (body.design) return reply(await importDesign(registry, st => blobsStore(getStore, st.storeName), body.design, { id: body.id, name: body.name, description: body.description }, who, now));
      return reply(await createStudy(registry, body, who));
    }
    case 'clone': {   // a new study with the same design (content, settings, files); no participants or data
      if (!post) return needPost();
      const from = await getStudy(registry, String(body.from || ''));
      if (!from) return json({ error: 'no_study', hint: 'That study no longer exists.' }, 404);
      return reply(await cloneStudy(registry, st => blobsStore(getStore, st.storeName), { store: blobsStore(getStore, from.storeName), type: typeFor(from), study: from }, { id: body.id, name: body.name }, who, now));
    }
    case 'update': return needPost() || reply(await updateStudy(registry, String(body.id || ''), body));
    case 'researchers': return json(await acc.listResearchers(registry));
    case 'researchers/invite': return needPost() || reply(await acc.inviteResearcher(registry, body, who, await studyIds(), now));
    case 'researchers/update': return needPost() || reply(await acc.updateResearcher(registry, String(body.id || ''), body, who, await studyIds(), now));
    case 'researchers/reset-link': return needPost() || reply(await acc.resetLink(registry, String(body.id || ''), who, now));
    case 'researchers/revoke': return needPost() || reply(await acc.revokeAll(registry, String(body.id || ''), who, now));
    case 'researchers/clear-totp': return needPost() || reply(await acc.clearTotp(registry, String(body.id || ''), who, now));
    case 'researchers/remove': return needPost() || reply(await acc.removeResearcher(registry, String(body.id || ''), who, now));
    case 'activity': return json(await admin.auditLog(registry));
  }
  return json({ error: 'not_found' }, 404);
}

// Sign-in and links. No credentials needed; these never say whether an email has an account.
async function authRoute(route, req, body, { registry, now }) {
  if (req.method !== 'POST') return json({ error: 'post_required' }, 405);
  switch (route) {
    case 'signin': return reply(await acc.signIn(registry, body, { now, ip: req.headers.get('x-nf-client-connection-ip') || '' }));
    case 'link-info': return reply(await acc.linkInfo(registry, body.token, now));
    case 'accept': return reply(await acc.acceptLink(registry, body, now));
  }
  return json({ error: 'not_found' }, 404);
}

// The signed-in researcher's own account.
async function accountRoute(route, req, body, { registry, session, now }) {
  const a = session.account;
  if (route === 'me') {
    const studies = [];
    for (const [id, role] of Object.entries(a.studyRoles || {})) { const st = await getStudy(registry, id); if (st) studies.push({ id, name: st.name, role }); }
    return json({ ...acc.me(a), studies, recoveryRemaining: await acc.recoveryRemaining(registry, a), passwordChangedAt: a.passwordChangedAt || null, expiresAt: session.claims.x });
  }
  if (req.method !== 'POST') return json({ error: 'post_required' }, 405);
  switch (route) {
    case 'name': return reply(await acc.renameSelf(registry, a, body.name));
    case 'password': return reply(await acc.changePassword(registry, a, body, now));
    case 'totp-setup': return reply(await acc.totpSetup(registry, a));
    case 'totp-enable': return reply(await acc.totpEnable(registry, a, body.code, now));
    case 'totp-disable': return reply(await acc.totpDisable(registry, a, body.password, now));
    case 'recovery': return reply(await acc.regenRecovery(registry, a, body.password, now));
    case 'signout':
      await acc.revokeSession(registry, session.claims, now);
      await admin.audit(registry, { name: a.name, role: 'researcher' }, 'signout', a.email, now);
      return json({ ok: true });
    case 'signout-all': {
      const r = await acc.bumpEpoch(registry, a.id);
      if (r.error) return reply(r);
      await admin.audit(registry, { name: a.name, role: 'researcher' }, 'signout.all', a.email, now);
      return json({ ok: true });
    }
  }
  return json({ error: 'not_found' }, 404);
}

// "My studies": the studies this caller can open (all of them for an owner), with what is cheap to read: one get for the
// last backup and one for the last self-test per study. Participant counts are not here (see studySummary).
async function studiesFor(registry, getStore, account) {
  const all = await listStudies(registry, { all: true });
  const rows = account && !account.labOwner ? all.filter(s => Object.hasOwn(account.studyRoles || {}, s.id) && !s.archived) : all;
  return Promise.all(rows.map(async s => {
    const bk = await backup.backupStatus(blobsStore(getStore, s.backupName)), st = await blobsStore(getStore, s.storeName).get('meta/last-selftest');
    return { id: s.id, name: s.name, type: s.type, typeLabel: (TYPES[s.type] || {}).label || s.type, role: account && !account.labOwner ? account.studyRoles[s.id] : 'owner', paths: s.paths, listed: !!s.listed, archived: !!s.archived, builtIn: !!s.builtIn,
      lastBackupAt: bk.lastCompleteAt || null, lastBackupTriedAt: bk.lastRunAt || null, lastSelfTest: st || null };
  }));
}

// Participant counts for one study, read when asked for: it lists the study's participants, which is too much work for every page load.
async function studySummary(S) {
  const rows = await E.listParticipants(S), agg = () => ({ started: 0, completed: 0, total: 0 });
  const real = agg(), test = agg(); let last = null;
  for (const p of rows) {
    const g = p.test ? test : real;
    g.total++;
    if (p.consented || p.completedSessions > 0 || p.inProgress > 0) g.started++;
    if (p.totalSessions > 0 && p.completedSessions >= p.totalSessions) g.completed++;
    if (p.lastSeenAt && (!last || p.lastSeenAt > last)) last = p.lastSeenAt;
  }
  return { real, test, lastActivityAt: last };
}
