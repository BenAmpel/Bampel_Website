// CCAIR Behavioral Lab: server-side speech recognition for studies that keep audio on the lab's own machines.
// LAB_ASR_URL points at a whisper.cpp server (`whisper-server ... --host <tailscale ip>`), for example
// http://100.85.210.3:8178/inference on the lab Mac mini. The participant's audio goes only there; nothing is sent
// to a third-party service. Without LAB_ASR_URL, transcribe() reports { error: 'asr_unavailable' } and callers
// decide what an outage means (an equipment check lets the participant continue, flagged).

const TIMEOUT_MS = () => Number(process.env.LAB_ASR_TIMEOUT_MS) || 8000;

export const asrConfigured = () => /^https?:\/\/[^\s]+$/.test(process.env.LAB_ASR_URL || '');

// audio: a Buffer (WAV, 16-bit PCM; the browser records it that way so the server needs no converter).
export async function transcribe(audio, { mime = 'audio/wav' } = {}) {
  if (!asrConfigured()) return { error: 'asr_unavailable' };
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
