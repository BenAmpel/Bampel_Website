#!/usr/bin/env python3
"""CCAIR lab voice service for the Mac mini: Kokoro-82M text-to-speech over HTTP, kept loaded in memory.

The lab server (LAB_TTS_URL) sends each AI caller line here and stores the WAV it gets back, so the caller's voice is
made on the lab's own machine (no third-party TTS) and every spoken line is kept as the caller's audio track.
Speech recognition is the separate whisper.cpp server on the same machine (LAB_ASR_URL).

Run with the Kokoro venv (mlx-audio, misaki, espeak-ng), bound to the mini's Tailscale address only:
    <kokoro venv>/bin/python voice_server.py --host 100.85.210.3 --port 8179

    POST /tts   {"text": "...", "voice": "af_heart", "speed": 1.0}  ->  audio/wav (24 kHz mono, 16-bit)
                response headers: X-Gen-Ms (synthesis time), X-Audio-Ms (length of the audio)
    GET  /health                                                     ->  {"ok": true, "voices": [...]}
"""
import argparse
import io
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SR = 24000
MODEL_ID = os.environ.get("KOKORO_MODEL", "mlx-community/Kokoro-82M-bf16")
VOICES = {"af_heart", "af_bella", "af_nicole", "af_aoede", "af_kore", "af_sarah", "af_nova", "af_alloy", "af_jessica", "af_river",
          "af_sky", "am_michael", "am_fenrir", "am_puck", "am_echo", "am_eric", "am_liam", "am_adam", "am_onyx"}
LOCK = threading.Lock()   # one synthesis at a time: the model is not thread-safe, and lines are short
PIPE = None


def load():
    global PIPE
    os.environ.setdefault("ESPEAK_DATA_PATH", "/opt/homebrew/share/espeak-ng-data")
    os.environ.setdefault("PHONEMIZER_ESPEAK_LIBRARY", "/opt/homebrew/lib/libespeak-ng.dylib")
    from mlx_audio.tts.utils import load_model
    t0 = time.time()
    PIPE = load_model(MODEL_ID)._get_pipeline("a")   # American English
    synth("Ready.", "af_heart")                       # warm-up: the first call compiles the GPU kernels
    print(f"voice_server: Kokoro loaded and warmed in {time.time() - t0:.1f}s", flush=True)


def synth(text, voice, speed=1.0):
    import numpy as np
    with LOCK:
        parts = [np.array(r.output.audio).reshape(-1).astype("float32") for r in PIPE(text, voice=voice, speed=speed, split_pattern=r"\n+") if r.output is not None]
    if not parts:
        raise RuntimeError("no audio")
    return np.concatenate(parts)


def wav_bytes(audio):
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": PIPE is not None, "voices": sorted(VOICES)})
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/tts":
            return self._json(404, {"error": "not_found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > 20000:
                return self._json(400, {"error": "bad_body"})
            req = json.loads(self.rfile.read(n))
            text = str(req.get("text") or "").strip()[:1200]
            voice = req.get("voice") if req.get("voice") in VOICES else "af_heart"
            speed = min(1.3, max(0.7, float(req.get("speed") or 1.0)))
            if not text:
                return self._json(400, {"error": "no_text"})
            t0 = time.time()
            audio = synth(text, voice, speed)
            body = wav_bytes(audio)
        except Exception as e:  # noqa: BLE001  a bad request must not stop the service
            return self._json(500, {"error": type(e).__name__})
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Gen-Ms", str(int((time.time() - t0) * 1000)))
        self.send_header("X-Audio-Ms", str(int(len(audio) / SR * 1000)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):   # one line per request, without the text spoken
        print("voice_server:", self.address_string(), fmt % args, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8179)
    a = ap.parse_args()
    load()
    ThreadingHTTPServer((a.host, a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
