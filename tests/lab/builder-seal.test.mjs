// Builder studies seal like every other study (seal.mjs): a participant's arm is picked late, when session 1 starts
// (deferred assignment), and that path must still build a plan that seals free text. With a study key set:
//  - a real participant of a builder-template study gets an arm at session 1, and the free-text answer is stored
//    sealed (never readable) and opens with the private key
//  - with "require browser sealing" on, readable free text is refused (seal_required) and nothing is stored
import assert from 'node:assert/strict';
import * as E from '../../netlify/lib/lab/engine.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import * as Seal from '../../netlify/lib/lab/seal.mjs';
import { TYPES } from '../../netlify/lib/lab/types/index.mjs';
import { TEMPLATES } from '../../netlify/lib/lab/templates.mjs';
import { memStore } from './memstore.mjs';

const type = TYPES.multimodal;
const { publicKey, privateKey } = Seal.generateKeys('builder');
const SECRET = 'I work at Acme as a nurse';

async function study(requireBrowser) {
  const S = { store: memStore(), type, study: { id: 'bs', name: 'bs', type: 'multimodal', codePrefix: 'BS' } };
  const c = C.normalize(structuredClone(TEMPLATES['multimodal-builder'].content()), type);
  assert(c.builder, 'the template is a builder study');
  c.survey.pre = (c.survey.pre || []).filter(q => !(q.sessions || [1]).includes(1)).concat([{ id: 'job', text: 'What is your job?', type: 'text', sessions: [1] }]);
  const r = await C.saveContent(S.store, type, c, 'T', 0);
  assert(r.ok, JSON.stringify(r));
  await S.store.set('meta/seal', { publicKey, kid: privateKey.kid, setAt: 0, setBy: 'T', requireBrowser });
  const { created } = await E.createParticipants(S, 1, { gapDays: 0 });
  const code = created[0].code;
  assert.equal((await E.loadParticipant(S, code)).condition ?? null, null, 'no arm at sign-up (deferred)');
  await E.consent(S, code, true);
  const plan = await E.startSession(S, code);
  assert(!plan.error, JSON.stringify(plan));
  assert((await E.loadParticipant(S, code)).condition, 'the arm is picked when session 1 starts');
  return { S, code };
}

{
  const { S, code } = await study(false);
  const r = await E.saveSurvey(S, code, 1, 'pre', { job: SECRET });
  assert(r.ok, JSON.stringify(r));
  const rec = await S.store.get(`data/${code}/s1/survey-pre`);
  assert(Seal.isSealed(rec.data.job), 'the free-text answer is stored sealed');
  assert(!JSON.stringify(rec).includes('Acme'), 'the readable text is nowhere in the record');
  assert.equal(Seal.unseal(rec.data.job, privateKey), SECRET, 'and opens with the study key');
  console.log('a builder study seals free text after the deferred assignment');
}
{
  const { S, code } = await study(true);
  const r = await E.saveSurvey(S, code, 1, 'pre', { job: SECRET });
  assert.equal(r.error, 'seal_required', 'readable free text is refused when browser sealing is required');
  assert.equal(await S.store.get(`data/${code}/s1/survey-pre`), null, 'nothing was stored');
  console.log('require-browser sealing refuses readable text in a builder study');
}
