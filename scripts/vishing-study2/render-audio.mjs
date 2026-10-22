#!/usr/bin/env node
// Renders Study 2's recorded audio with the lab's Kokoro voice service and puts it on the telephone band:
// the training examples (studies/vishing-study2/training.mjs) and the passive clip library (clips.mjs).
//
//   LAB_TTS_URL=http://100.85.210.3:8179/tts node scripts/vishing-study2/render-audio.mjs [--force] [training|clips]
//
// Phone band, as in the build spec: 300-3,400 Hz, 8 kHz, light line noise; saved as MP3 (served at 8 kHz) under
// static/lab/media/vishing-study2/. Existing files are kept unless --force. Needs ffmpeg.
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { CLIP_JOBS as TRAINING } from '../../netlify/lib/lab/studies/vishing-study2/training.mjs';
import { CLIP_JOBS as CLIPS } from '../../netlify/lib/lab/studies/vishing-study2/clips.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../static/lab/media/vishing-study2');
const URL_ = process.env.LAB_TTS_URL;
if (!URL_) { console.error('Set LAB_TTS_URL to the voice service, for example http://100.85.210.3:8179/tts'); process.exit(1); }
const args = process.argv.slice(2), force = args.includes('--force'), only = args.find(a => !a.startsWith('--'));
const jobs = (only === 'training' ? TRAINING : only === 'clips' ? CLIPS : TRAINING.concat(CLIPS));

let made = 0, kept = 0;
for (const j of jobs) {
  const dest = join(OUT, j.file);
  if (existsSync(dest) && !force) { kept++; continue; }
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: j.text, voice: j.voice }) });
  if (!res.ok) { console.error(`${j.file}: voice service answered ${res.status}`); process.exit(1); }
  const wav = join(tmpdir(), `vs2-${process.pid}-${made}.wav`);
  writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
  const filter = j.phone ? '[0:a]aresample=48000,highpass=f=300,lowpass=f=3400[v];[v][1:a]amix=inputs=2:duration=first:normalize=0,aresample=8000' : 'anull';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-f', 'lavfi', '-t', '60', '-i', 'anoisesrc=color=pink:amplitude=0.004',
    '-filter_complex', filter, '-ac', '1', '-b:a', '32k', dest]);
  rmSync(wav, { force: true });
  made++;
  if (made % 10 === 0) console.log(`${made} rendered…`);
}
console.log(`done: ${made} rendered, ${kept} already there (of ${jobs.length})`);
