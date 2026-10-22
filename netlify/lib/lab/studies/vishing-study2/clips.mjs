// Study 2 passive clip library: 72 clips in 8 cells (structure attack/benign x surface high/low x topic
// financial/community), 9 per cell, and the 18 counterbalanced lists (decision 2026-10-22):
//   3 disjoint sets of 24 (3 clips per cell) x 2 parity forms (cells where structure*surface*topic = +1 give 2 pre and
//   1 post, or the reverse) x 3 rotations of which clips in a cell go pre or post.
// Every phase has 12 clips at 6/6 on all three factors, and every clip is heard pre in 3 lists and post in 3.
//
// PLACEHOLDERS: the real clips are written by the outside script writer, who has not seen the training (writer
// independence). These short placeholder clips only make the study run end to end; each is marked placeholder: true,
// and the launch checklist (PLACEHOLDER_COUNT) must be 0 before data collection.
import { VOICES } from './world.mjs';

const AUDIO = '/lab/media/vishing-study2/clips/';
const ORGS = { financial: ['Tallgrass Bank', 'Keystone Card Services', 'Meridian Ridge Credit Union', 'PayLark Payroll', 'Ashby Mutual Insurance'],
  community: ['Riverton Water and Power', 'the Harlan County Tax Office', 'Brightway Parcel', 'Calder Properties', 'the Riverton Fire Marshal\'s Office'] };
// Placeholder wording by cell: an attack asks for a value transfer through the caller's channel; a benign call asks for
// nothing of value or routes the action through the participant's own channel. High surface = urgency and threat.
const LINES = {
  'attack-high': o => `This is ${o}, and this is urgent. Your account will be locked in the next ten minutes. Read me the six digit code we just sent you, right now, so I can stop it.`,
  'attack-low': o => `Hi, this is ${o}. No rush at all. We are just updating your file, so could you read me the six digit code we just texted you when you have a second?`,
  'benign-high': o => `This is ${o} with an urgent notice. We have stopped a payment that looked unusual. Please call us back today at the number on your statement so we can sort it out.`,
  'benign-low': o => `Hi, this is ${o}, just a quick courtesy call. Your statement for this month is ready in your online account. There is nothing you need to do.`
};
const VOICE_ROTA = [VOICES.V1, VOICES.V2, VOICES.V3, VOICES.V4];

const CELLS = [];
for (const structure of [1, -1]) for (const surface of [1, -1]) for (const topic of [1, -1]) CELLS.push({ structure, surface, topic });
const label = c => ({ structure: c.structure > 0 ? 'attack' : 'benign', surface: c.surface > 0 ? 'high' : 'low', topic: c.topic > 0 ? 'financial' : 'community' });
const code = c => (c.structure > 0 ? 'A' : 'B') + (c.surface > 0 ? 'H' : 'L') + (c.topic > 0 ? 'F' : 'C');

export const CLIPS = CELLS.flatMap((c, ci) => Array.from({ length: 9 }, (_, i) => {
  const l = label(c), org = ORGS[l.topic][i % 5], id = `${code(c)}${i + 1}`;
  return { id, media: `${AUDIO}${id.toLowerCase()}.mp3`, transcript: '', placeholder: true,
    meta: { structure: l.structure, surface: l.surface, topic: l.topic, cell: code(c), placeholder: true },
    text: LINES[`${l.structure}-${l.surface}`](org), voice: VOICE_ROTA[(ci + i) % 4] };
}));

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
  clips: CLIPS.map(({ id, media, transcript, meta }) => ({ id, media, transcript, meta })),
  lists: LISTS,
  // Each clip becomes an audio item: answer while it plays (mouse-tracked), then confidence on six points.
  template: { title: 'Recorded call', body: 'Listen to this call to the Northwind front desk. Decide whether it is legitimate or suspicious.', live: true, mustFinish: true, maxPlays: 1, decide: true, ask: ['confidence6'] }
};
export const CLIP_JOBS = CLIPS.map(c => ({ file: `clips/${c.id.toLowerCase()}.mp3`, text: c.text, voice: c.voice, phone: true }));
export const PLACEHOLDER_CLIPS = CLIPS.filter(c => c.placeholder).length;
