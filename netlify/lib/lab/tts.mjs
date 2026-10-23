// CCAIR Behavioral Lab: server-side text-to-speech for AI callers, on the lab's own machine.
// LAB_TTS_URL points at the voice service on the lab Mac mini (scripts/vishing-study2/mini/voice_server.py, Kokoro-82M),
// for example http://100.85.210.3:8179/tts. Each caller line comes back as a WAV that the study stores as a file, so
// the browser plays it through the telephone-band filter and the caller's side of every call is kept as audio.
// Without LAB_TTS_URL, or on an error or timeout, synthesize() returns { error } and the caller's line is spoken
// by the browser's own voice instead (the call never stalls on the voice service).

import { serviceAuth } from './asr.mjs';   // the gateway's shared secret, when the mini is reached through Funnel

const TIMEOUT_MS = () => Number(process.env.LAB_TTS_TIMEOUT_MS) || 5000;

export const ttsConfigured = () => /^https?:\/\/[^\s]+$/.test(process.env.LAB_TTS_URL || '');

// Is the voice service answering? (voice_server.py: GET /health gives { ok: true }.)
export async function ttsHealthy(ms = 3000) {
  if (!ttsConfigured()) return false;
  try {
    const r = await fetch(new URL('/health', process.env.LAB_TTS_URL), { headers: serviceAuth(), signal: AbortSignal.timeout(ms) });
    return r.ok && (await r.json()).ok === true;
  } catch { return false; }
}

export async function synthesize(text, { voice = 'af_heart', speed = 1 } = {}) {
  if (!ttsConfigured()) return { error: 'tts_unavailable' };
  const t0 = Date.now();
  try {
    const res = await fetch(process.env.LAB_TTS_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...serviceAuth() },
      body: JSON.stringify({ text: String(text || '').slice(0, 1200), voice, speed }), signal: AbortSignal.timeout(TIMEOUT_MS()) });
    if (!res.ok) return { error: 'tts_failed', status: res.status, ms: Date.now() - t0 };
    const audio = Buffer.from(await res.arrayBuffer());
    return { audio, mime: 'audio/wav', ms: Date.now() - t0, genMs: Number(res.headers.get('x-gen-ms')) || null, audioMs: Number(res.headers.get('x-audio-ms')) || null };
  } catch (e) {
    return { error: e && e.name === 'TimeoutError' ? 'tts_timeout' : 'tts_unavailable', ms: Date.now() - t0 };
  }
}
