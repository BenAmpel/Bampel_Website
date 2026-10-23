// Study 2 passive clip library: 72 clips in 8 cells (structure attack/benign x surface high/low x topic
// financial/community), 9 per cell, and the 18 counterbalanced lists (decision 2026-10-22):
//   3 disjoint sets of 24 (3 clips per cell) x 2 parity forms (cells where structure*surface*topic = +1 give 2 pre and
//   1 post, or the reverse) x 3 rotations of which clips in a cell go pre or post.
// Every phase has 12 clips at 6/6 on all three factors, and every clip is heard pre in 3 lists and post in 3.
//
// The clips are the writer's matched pairs (stimuli-data.mjs): each attack clip has a legitimate twin with the same
// surface and topic whose words are identical except the request. A participant must never hear both members of a
// pair, so the legitimate twins are rotated by one set: twin k of a pair whose attack is in set s sits in set s + 1
// (mod 3). The lists then hold no pair (tests/lab/vishing-study2.test.mjs checks this).
import { VOICE } from './world.mjs';
import { STIMULI } from './stimuli-data.mjs';

const AUDIO = '/lab/media/vishing-study2/clips/';
const CELLS = [];
for (const structure of [1, -1]) for (const surface of [1, -1]) for (const topic of [1, -1]) CELLS.push({ structure, surface, topic });
const code = c => (c.structure > 0 ? 'A' : 'B') + (c.surface > 0 ? 'H' : 'L') + (c.topic > 0 ? 'F' : 'C');

// The spoken words (tags removed), and where the request starts and ends, in words.
const plain = t => t.replace(/\[\/?(ASK|RES)\]/g, ' ').replace(/\s+/g, ' ').trim();
const nWords = t => (plain(t).match(/\S+/g) || []).length;
function spans(t) {
  const a = t.indexOf('[ASK]'), b = t.indexOf('[/ASK]');
  return { askStartWord: nWords(t.slice(0, a)), askEndWord: nWords(t.slice(0, b)), words: nWords(t) };
}

const ROTATE = 3;   // one set (three positions) for the legitimate twins
export const CLIPS = CELLS.flatMap(c => {
  const cell = code(c), mine = STIMULI.filter(x => x.set === 'passive' && x.cell === cell).sort((x, y) => x.id.localeCompare(y.id));
  if (mine.length !== 9) throw new Error(`clips.mjs: cell ${cell} has ${mine.length} clips, not 9`);
  const slots = new Array(9);
  mine.forEach((x, k) => { slots[c.structure > 0 ? k : (k + ROTATE) % 9] = x; });
  return slots.map((x, i) => {
    const id = `${cell}${i + 1}`;
    return { id, media: `${AUDIO}${id.toLowerCase()}.mp3`, transcript: '', text: plain(x.text), voice: VOICE,
      meta: { structure: c.structure > 0 ? 'attack' : 'benign', surface: x.surface, topic: x.topic, cell, stimulusId: x.id, pair: x.id.slice(3),
        organization: x.organization, requestKind: x.requestKind, requestPosition: x.requestPosition, ...spans(x.text) } };
  });
});

// The 18 lists (verified by tests/lab/vishing-study2.test.mjs: 12 per phase, 6/6 on every factor, 3 pre + 3 post each).
export const LISTS = [];
for (let set = 0; set < 3; set++) for (let form = 0; form < 2; form++) for (let rot = 0; rot < 3; rot++) {
  const pre = [], post = [];
  for (const c of CELLS) {
    const mine = CLIPS.filter(x => x.meta.cell === code(c)).slice(3 * set, 3 * set + 3).map(x => x.id);
    const k = (c.structure * c.surface * c.topic > 0) === (form === 0) ? 2 : 1;
    const order = mine.slice(rot).concat(mine.slice(0, rot));
    pre.push(...order.slice(0, k)); post.push(...order.slice(k));
  }
  LISTS.push({ pre, post });
}

export const CLIP_LIBRARY = {
  // agentText: the clip's words, sent only to simulated participants (agent mode, test codes) since they cannot listen.
  clips: CLIPS.map(({ id, media, transcript, meta, text }) => ({ id, media, transcript, meta, agentText: text })),
  lists: LISTS,
  // Each clip becomes an audio item: answer while it plays (mouse-tracked), then confidence on six points.
  template: { title: 'Recorded call', body: 'Listen to this call to the Northwind front desk. Decide whether it is legitimate or suspicious.', live: true, mustFinish: true, maxPlays: 1, decide: true, ask: ['confidence6'] }
};
export const CLIP_JOBS = CLIPS.map(c => ({ file: `clips/${c.id.toLowerCase()}.mp3`, text: c.text, voice: c.voice, phone: true }));
export const PLACEHOLDER_CLIPS = 0;
