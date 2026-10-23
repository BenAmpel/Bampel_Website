// CCAIR Behavioral Lab: server-side speech recognition for studies that keep audio on the lab's own machines.
// LAB_ASR_URL points at a whisper.cpp server (`whisper-server ... --host <tailscale ip>`), for example
// http://100.85.210.3:8178/inference on the lab Mac mini. The participant's audio goes only there; nothing is sent
// to a third-party service. Without LAB_ASR_URL, transcribe() reports { error: 'asr_unavailable' } and callers
// decide what an outage means (an equipment check lets the participant continue, flagged).

const TIMEOUT_MS = () => Number(process.env.LAB_ASR_TIMEOUT_MS) || 8000;

export const asrConfigured = () => /^https?:\/\/[^\s]+$/.test(process.env.LAB_ASR_URL || '');

// The loudest sample of a 16-bit PCM WAV, from 0 to 1 (null when the buffer is not one). Whisper invents words for
// silence ("Thank you.", seen in the 2026-10-22 browser check), so silent audio is never sent to it.
export function peakLevel(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      let peak = 0;
      for (let i = off + 8; i + 1 < Math.min(buf.length, off + 8 + size); i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)));
      return peak / 32768;
    }
    off += 8 + size + (size % 2);
  }
  return null;
}
const SILENCE = 0.01;   // about -40 dBFS: quieter than any speech the check-word recordings or a phone mic produce

// audio: a Buffer (WAV, 16-bit PCM; the browser records it that way so the server needs no converter).
export async function transcribe(audio, { mime = 'audio/wav' } = {}) {
  if (!asrConfigured()) return { error: 'asr_unavailable' };
  const peak = peakLevel(audio);
  if (peak != null && peak < SILENCE) return { text: '', ms: 0, silent: true };
  const t0 = Date.now(), form = new FormData();
  form.append('file', new Blob([audio], { type: mime }), 'clip.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  try {
    const res = await fetch(process.env.LAB_ASR_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS()) });
    if (!res.ok) return { error: 'asr_failed', status: res.status, ms: Date.now() - t0 };
    const j = await res.json();
    return { text: String(j.text || '').trim().slice(0, 2000), ms: Date.now() - t0 };
  } catch (e) {
    return { error: e && e.name === 'TimeoutError' ? 'asr_timeout' : 'asr_unavailable', ms: Date.now() - t0 };
  }
}

// Lowercase words without punctuation: "Harbor." and " harbor!" both give ["harbor"].
export const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

// Did the speaker say `target`? An exact word, or one edit away for words of 5+ letters (Whisper's "harbour").
export function saidWord(text, target) {
  const t = String(target || '').toLowerCase();
  return words(text).some(w => w === t || (t.length >= 5 && editDistance(w, t) <= 1));
}
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
