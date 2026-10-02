// Adapter: the verification-study tests were written against the original single-study modules.
// These wrappers give them the same signatures on top of the shared engine (alert-triage type,
// built-in "verification" study), so the same tests now exercise the engine.
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { runSelfTest as run } from '../../netlify/lib/lab/selftest.mjs';
import { update as upd } from '../../netlify/lib/lab/store.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { BUILT_IN } from '../../netlify/lib/lab/registry.mjs';
import triage, { AI_TYPES } from '../../netlify/lib/lab/types/alert-triage.mjs';

export const type = TYPES['alert-triage'], study = BUILT_IN.verification;
export const S = store => ({ store, type, study });
const bind = f => (store, ...a) => f(S(store), ...a);
export const core = {
  login: bind(E.login), resume: bind(E.resume), consent: bind(E.consent), startSession: bind(E.startSession), viewTrial: bind(E.viewTrial),
  saveTrial: bind(E.saveTrial), saveSurvey: bind(E.saveSurvey), verifyToken: bind(E.verifyToken), loadParticipant: bind(E.loadParticipant),
  progressOf: bind(E.progressOf), createParticipants: bind(E.createParticipants), createTestParticipant: bind(E.createTestParticipant),
  addRoster: bind(E.addRoster), lookupEmails: bind(E.lookupEmails), listParticipants: bind(E.listParticipants), exportAll: (store, only) => E.exportRecords(S(store), only ? [only] : null),
  exportRecords: bind(E.exportRecords), exportRaw: bind(E.exportRaw), exportRows: bind(E.exportRows), exportCsv: bind(E.exportCsv), exportSurveyCsv: bind(E.exportSurveyCsv),
  exportCredit: bind(E.exportCredit), deleteParticipant: bind(E.deleteParticipant), deleteTestParticipants: bind(E.deleteTestParticipants), setTest: bind(E.setTest),
  update: upd, csvCell: E.csvCell, buildPlan: (p, n, c) => E.buildPlan(S(null), p, n, c)
};
export const content = {
  DEFAULT_CONTENT: C.defaultContent(type), AI_TYPES, TEXT_FIELDS: C.textFieldsFor(type),
  normalize: c => C.normalize(c, type), validateContent: c => C.validateContent(c, type), getContent: store => C.getContent(store, type),
  saveContent: (store, c, who, base, now) => C.saveContent(store, type, c, who, base, now), restoreContent: (store, v, who, now) => C.restoreContent(store, type, v, who, now),
  contentHistory: C.contentHistory, publicContent: c => C.publicContent(c, type, study), itemsFor: (items, kind, ctx) => C.itemsFor(items, kind, ctx, type)
};
export const runSelfTest = (store, opts) => run(S(store), opts);
