#!/usr/bin/env bash
# Rebuilds the sample stimuli used by the study templates (static/lab/media/samples/):
# four phone-quality voicemails, a mock sign-in page image, and a short video message.
# macOS only (uses `say` and Google Chrome); needs ffmpeg with libmp3lame and libx264.
#   bash scripts/lab-samples.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/static/lab/media/samples"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/lab-samples.XXXXXX")"
trap 'rm -rf -- "${WORK:?}"' EXIT
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"

# A voicemail: synthetic speech through a telephone band (300-3400 Hz), 8 kHz, a little line noise.
voicemail() {   # name voice text
  local name="$1" voice="$2" text="$3"
  say -v "$voice" -r 175 -o "$WORK/$name.aiff" "$text"
  ffmpeg -loglevel error -y -i "$WORK/$name.aiff" -f lavfi -t 60 -i "anoisesrc=color=pink:amplitude=0.004" \
    -filter_complex "[0:a]highpass=f=300,lowpass=f=3400,aresample=8000,aresample=44100,volume=1.6,apad=pad_dur=0.4[v];[v][1:a]amix=inputs=2:duration=first:normalize=0" \
    -ac 1 -codec:a libmp3lame -b:a 48k "$OUT/$name.mp3"
}
voicemail voicemail-bank "Reed (English (US))" "Hi, this is Harborview Bank fraud prevention. We blocked a suspicious payment on your card. Please call us back right away at 800 555 0199, and have your card ready so we can verify you."
voicemail voicemail-it "Eddy (English (US))" "Hey, it's Chris from the I T help desk. We're migrating mailboxes tonight, and yours failed. Call me back at extension 4471 with your login, so I can move it over before the morning."
voicemail voicemail-pharmacy "Samantha (English (US))" "Hello, this is Contoso Pharmacy with a reminder that your prescription is ready for pickup. Our hours are nine to seven. No need to call back."
voicemail voicemail-dentist "Shelley (English (US))" "Hi, this is Bright Smile Dental confirming your cleaning on Thursday at ten. If you need to reschedule, please call the office at the number on our website."

# A mock sign-in page at a look-alike address (for the image template).
cat > "$WORK/login.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font:15px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#eef1f5;color:#1b1b1b}
.bar{background:#fff;border-bottom:1px solid #d9dde3;padding:10px 16px;display:flex;gap:10px;align-items:center}
.url{flex:1;background:#f1f3f6;border-radius:18px;padding:7px 14px;color:#333;font-size:14px}.lock{color:#5b6470}
.card{width:380px;margin:56px auto;background:#fff;padding:36px 40px;box-shadow:0 2px 10px rgba(0,0,0,.12)}
.logo{display:grid;grid-template-columns:repeat(2,11px);gap:2px;margin-bottom:18px}.logo i{width:11px;height:11px;display:block}
h1{font-size:24px;font-weight:600;margin:0 0 18px}input{width:100%;box-sizing:border-box;border:0;border-bottom:1px solid #666;padding:8px 0;font-size:15px;margin-bottom:16px}
.btn{float:right;background:#0067b8;color:#fff;border:0;padding:8px 32px;font-size:15px}.small{font-size:13px;color:#0067b8;margin:8px 0 28px}
</style></head><body><div class="bar"><span class="lock">&#128274;</span><div class="url">https://contos0-login.example/common/oauth2/authorize</div></div>
<div class="card"><div class="logo"><i style="background:#0f6cbd"></i><i style="background:#2aa0a4"></i><i style="background:#2aa0a4"></i><i style="background:#0f6cbd"></i></div>
<h1>Sign in to Contoso 365</h1><input placeholder="Email or phone"><input placeholder="Password" type="password">
<p class="small">Can't access your account?</p><button class="btn">Sign in</button><div style="clear:both"></div></div></body></html>
HTML
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=900,620 --screenshot="$OUT/login-page.png" "file://$WORK/login.html" >/dev/null 2>&1

# A short "video message from the CFO": a title card with the speech's waveform.
cat > "$WORK/card.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:960px;height:540px;background:linear-gradient(135deg,#2b2140,#5b3a5e);font:600 34px -apple-system,Helvetica,Arial,sans-serif;color:#fff7ef;display:flex;flex-direction:column;justify-content:center;align-items:center}
.a{width:120px;height:120px;border-radius:50%;background:#f3c9a6;color:#5b3a5e;display:flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:22px}
small{font-weight:400;font-size:22px;opacity:.8;margin-top:8px}
</style></head><body><div class="a">D</div>Dana Whitfield<small>Chief Financial Officer · video message</small></body></html>
HTML
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=960,540 --screenshot="$WORK/card.png" "file://$WORK/card.html" >/dev/null 2>&1
say -v "Shelley (English (US))" -r 170 -o "$WORK/cfo.aiff" "Hi team, it's Dana, your C F O. I need a favor before the end of the day. Please process a wire to our new supplier. The details are in the email I just sent. Thanks."
ffmpeg -loglevel error -y -loop 1 -i "$WORK/card.png" -i "$WORK/cfo.aiff" \
  -filter_complex "[1:a]showwaves=s=960x90:mode=cline:colors=0xfff7ef@0.85[w];[0:v][w]overlay=0:430,format=yuv420p[v]" \
  -map "[v]" -map 1:a -c:v libx264 -preset slow -crf 30 -tune stillimage -c:a aac -b:a 64k -shortest -movflags +faststart "$OUT/video-cfo.mp4"

ls -lh "$OUT"
