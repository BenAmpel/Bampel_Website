#!/bin/bash
# Installs (or reinstalls) the lab's speech and voice services, and the gateway in front of them, as launch agents on
# the lab Mac mini. Run on the mini: bash install.sh   (stops any copies started by hand first, then loads all three)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
agents="$HOME/Library/LaunchAgents"
mkdir -p "$agents" "$HOME/Library/Logs" "$HOME/ccair-voice"
uid="$(id -u)"
# The gateway (behind Tailscale Funnel) needs its script and the shared token. The token is made once, readable only
# by this account, and never printed; the lab's LAB_SERVICE_TOKEN (Netlify) must hold the same value.
cp "$here/../gateway.py" "$HOME/ccair-voice/gateway.py"
token="$HOME/.config/ccair/gateway-token"
if [ ! -s "$token" ]; then
  mkdir -p "$(dirname "$token")"; chmod 700 "$(dirname "$token")"
  ( umask 077; /usr/bin/python3 -c 'import secrets; print(secrets.token_urlsafe(32))' > "$token" )
fi
chmod 600 "$token"
for name in com.benampel.ccair-whisper com.benampel.ccair-voice com.benampel.ccair-gateway; do
  launchctl bootout "gui/$uid/$name" 2>/dev/null || true
  cp "$here/$name.plist" "$agents/$name.plist"
done
# Copies started by hand would hold the ports.
pkill -f 'whisper-server .*--port 8178' || true
pkill -f 'voice_server.py --host .* --port 8179' || true
pkill -f 'gateway.py .*--port 8180' || true
sleep 2
for name in com.benampel.ccair-whisper com.benampel.ccair-voice com.benampel.ccair-gateway; do
  launchctl bootstrap "gui/$uid" "$agents/$name.plist"
done
launchctl list | grep ccair || true
