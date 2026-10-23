// The lab's speech and voice clients and the mini's gateway (scripts/vishing-study2/mini/gateway.py): with
// LAB_SERVICE_TOKEN set, every request (health checks included) carries "Authorization: Bearer <token>"; without it,
// none does (the private-network setup). A gateway that refuses the token reads as the service being unavailable.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { asrHealthy, transcribe } from '../../netlify/lib/lab/asr.mjs';
import { ttsHealthy, synthesize } from '../../netlify/lib/lab/tts.mjs';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';
const seen = [];
const gate = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization || null });
    if (req.headers.authorization !== `Bearer ${TOKEN}` && process.env.REQUIRE !== '0') { res.statusCode = 401; return res.end('unauthorized'); }
    if (req.url === '/health') { res.setHeader('content-type', 'application/json'); return res.end('{"ok":true}'); }
    if (req.url === '/inference') { res.setHeader('content-type', 'application/json'); return res.end('{"text":"harbor"}'); }
    if (req.url === '/tts') { res.setHeader('content-type', 'audio/wav'); return res.end(Buffer.from('RIFF')); }
    res.end('whisper');
  });
});
await new Promise(r => gate.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${gate.address().port}`;
process.env.LAB_ASR_URL = `${base}/inference`;
process.env.LAB_TTS_URL = `${base}/tts`;
// a short WAV with sound in it (silence is never sent to the recognizer)
const wav = (() => { const n = 800, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(i / 3)), 44 + i * 2); return b; })();

// With the token: all four calls pass the gateway.
process.env.LAB_SERVICE_TOKEN = TOKEN;
assert.equal(await asrHealthy(), true);
assert.equal((await transcribe(wav)).text, 'harbor');
assert.equal(await ttsHealthy(), true);
assert.ok((await synthesize('Hello.')).audio, 'the voice comes back');
assert.ok(seen.length === 4 && seen.every(s => s.auth === `Bearer ${TOKEN}`), 'every request carries the token: ' + JSON.stringify(seen));

// A wrong token: the gateway refuses, and the lab treats the service as down (callers fall back).
process.env.LAB_SERVICE_TOKEN = 'wrong-token-0123456789abcdefghijklmn';
assert.equal(await asrHealthy(), false);
assert.equal((await transcribe(wav)).error, 'asr_failed');
assert.equal(await ttsHealthy(), false);
assert.equal((await synthesize('Hello.')).error, 'tts_failed');

// No token (the private-network setup): no Authorization header is sent at all.
delete process.env.LAB_SERVICE_TOKEN; seen.length = 0; process.env.REQUIRE = '0';
assert.equal(await ttsHealthy(), true);
assert.equal(seen[0].auth, null, 'no header without LAB_SERVICE_TOKEN');

gate.close();
delete process.env.LAB_ASR_URL; delete process.env.LAB_TTS_URL; delete process.env.REQUIRE;
console.log('service token: sent on every speech and voice request when set, absent otherwise; a refusal reads as unavailable');
