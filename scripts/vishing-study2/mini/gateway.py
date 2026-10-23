#!/usr/bin/env python3
"""CCAIR lab service gateway for the Mac mini: one authenticated front door to the speech and voice services.

The production lab runs as Netlify functions, which cannot reach the mini's Tailscale address. Tailscale Funnel
publishes this gateway (and nothing else) at https://bens-mac-mini.<tailnet>.ts.net; the gateway listens on
localhost only and passes a request on only when it carries the shared secret:

    Authorization: Bearer <token>        token file: ~/.config/ccair/gateway-token (mode 600; never printed or logged)

Routes (the same paths the services use, so LAB_ASR_URL = https://<host>/inference and LAB_TTS_URL = https://<host>/tts):
    GET  /            -> whisper-server page (the lab's ASR health check)
    POST /inference   -> whisper-server (multipart WAV, as asr.mjs sends it)
    GET  /health      -> voice_server.py health (the lab's TTS health check)
    POST /tts         -> voice_server.py (JSON, as tts.mjs sends it)
Anything else is 404; a missing or wrong token is 401. Bodies over 4 MB are refused (a spoken turn is well under 2 MB).

    /usr/bin/python3 gateway.py --port 8180 --token-file ~/.config/ccair/gateway-token \
        --asr http://100.85.210.3:8178 --tts http://100.85.210.3:8179
"""
import argparse
import hmac
import http.client
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

MAX_BODY = 4 * 1024 * 1024
ROUTES = {('GET', '/'): 'asr', ('POST', '/inference'): 'asr', ('GET', '/health'): 'tts', ('POST', '/tts'): 'tts'}
PASS_HEADERS = ('content-type', 'x-gen-ms', 'x-audio-ms')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8180)
    ap.add_argument('--token-file', default=os.path.expanduser('~/.config/ccair/gateway-token'))
    ap.add_argument('--asr', default='http://100.85.210.3:8178')
    ap.add_argument('--tts', default='http://100.85.210.3:8179')
    ap.add_argument('--timeout', type=float, default=30)
    a = ap.parse_args()
    token = open(a.token_file).read().strip()
    if len(token) < 32:
        sys.exit('gateway: the token must be at least 32 characters')
    upstream = {'asr': urlsplit(a.asr), 'tts': urlsplit(a.tts)}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def log_message(self, fmt, *args):   # path and status only: never headers (the token) or bodies (audio)
            sys.stderr.write('%s %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), fmt % args))

        def reply(self, code, body=b'', ctype='text/plain'):
            self.send_response(code)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def handle_one(self, method):
            path = self.path.split('?', 1)[0]
            target = ROUTES.get((method, path))
            if not target:
                return self.reply(404, b'not found')
            got = self.headers.get('Authorization', '')
            if not (got.startswith('Bearer ') and hmac.compare_digest(got[7:].strip().encode(), token.encode())):
                return self.reply(401, b'unauthorized')
            n = int(self.headers.get('Content-Length') or 0)
            if n > MAX_BODY:
                return self.reply(413, b'too large')
            body = self.rfile.read(n) if n else None
            u = upstream[target]
            conn = http.client.HTTPConnection(u.hostname, u.port, timeout=a.timeout)
            try:
                headers = {'Content-Type': self.headers['Content-Type']} if self.headers.get('Content-Type') else {}
                conn.request(method, path, body=body, headers=headers)
                res = conn.getresponse()
                data = res.read()
            except Exception:
                return self.reply(502, b'upstream unavailable')
            finally:
                conn.close()
            self.send_response(res.status)
            for h in PASS_HEADERS:
                v = res.getheader(h)
                if v:
                    self.send_header(h, v)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            self.handle_one('GET')

        def do_POST(self):
            self.handle_one('POST')

    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print('gateway: listening on %s:%d (asr %s, tts %s)' % (a.host, a.port, a.asr, a.tts), flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
