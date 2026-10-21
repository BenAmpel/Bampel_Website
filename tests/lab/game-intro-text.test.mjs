// The opening instructions of a game say how many rounds the session has in plain words, for every preset and the default content.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../../netlify/lib/lab/game/rules.mjs';
import * as C from '../../netlify/lib/lab/content.mjs';
import { presetList, presetContent } from '../../netlify/lib/lab/game/presets.mjs';
import { type, setup } from './game-helpers.mjs';

assert.equal(R.roundsTextAll({ rounds: 1, practiceRounds: 0 }), '1 round');
assert.equal(R.roundsTextAll({ rounds: 10, practiceRounds: 0 }), '10 rounds');
assert.equal(R.roundsTextAll({ rounds: 10, practiceRounds: 2 }), '12 rounds, including 2 practice rounds');
assert.equal(R.roundsTextAll({ rounds: 1, practiceRounds: 1 }), '2 rounds, including 1 practice round');
assert.equal(R.roundsTextAll({ rounds: 5, practiceRounds: 1 }), '6 rounds, including 1 practice round');

const sentence = spec => C.defaultContent(type).text.instr_intro.replace('{rounds_text}', R.roundsTextAll(spec));
const intro = C.defaultContent(type).text.instr_intro;
assert(intro.includes('{rounds_text}') && !/practice rounds included/i.test(intro) && !/: \{n\}/.test(intro), 'the default no longer reads "Rounds in this session, practice rounds included: N."');
assert.equal(sentence({ rounds: 1, practiceRounds: 0 }), 'Read how the game works below before you start. This session has 1 round.');
assert.equal(sentence({ rounds: 10, practiceRounds: 2 }), 'Read how the game works below before you start. This session has 12 rounds, including 2 practice rounds.');

// every preset starts from that default text (none carries its own old wording), and a study built from it keeps it
for (const p of presetList()) {
  const c = presetContent(p.id);
  assert(!c.text || !c.text.instr_intro || c.text.instr_intro.includes('{rounds_text}'), `${p.id}: no old wording`);
  const { content, spec } = await setup(p.id);
  assert(content.text.instr_intro.includes('{rounds_text}'), `${p.id}: saved content uses {rounds_text}`);
  const pub = type.publicPlanExtras({ game: { spec, params: R.paramsFor(content, content.conditions[0].id), feedback: content.feedback, payment: content.payment, instructions: content.instructions, comprehension: content.comprehension } });
  assert.equal(pub.game.roundsTextAll, R.roundsTextAll(spec), `${p.id}: the plan carries the text`);
  assert(/^\d+ rounds?(, including \d+ practice rounds?)?$/.test(pub.game.roundsTextAll), `${p.id}: ${pub.game.roundsTextAll}`);
}
// content saved before this change with the old, unedited default is brought up to date; an edited one is left alone
{
  const old = 'Read how the game works below before you start. Rounds in this session, practice rounds included: {n}.';
  const c = C.normalize({ ...C.defaultContent(type), text: { ...C.defaultContent(type).text, instr_intro: old } }, type);
  assert(c.text.instr_intro.includes('{rounds_text}'));
  const edited = C.normalize({ ...C.defaultContent(type), text: { ...C.defaultContent(type).text, instr_intro: 'My own words, {n} rounds.' } }, type);
  assert.equal(edited.text.instr_intro, 'My own words, {n} rounds.');
}
// the participant page fills {rounds_text} in the opening instructions from the plan
assert(/rounds_text: p\.game\.roundsTextAll/.test(readFileSync(fileURLToPath(new URL('../../static/lab/engine/participant.js', import.meta.url)), 'utf8')));
console.log('game intro text: natural wording for every preset, old default migrated');
