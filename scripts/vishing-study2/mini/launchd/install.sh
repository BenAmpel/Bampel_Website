#!/bin/bash
# Installs (or reinstalls) the lab's speech and voice services as launch agents on the lab Mac mini.
# Run on the mini: bash install.sh   (stops any copies started by hand first, then loads both agents)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
agents="$HOME/Library/LaunchAgents"
mkdir -p "$agents" "$HOME/Library/Logs"
uid="$(id -u)"
for name in com.benampel.ccair-whisper com.benampel.ccair-voice; do
  launchctl bootout "gui/$uid/$name" 2>/dev/null || true
  cp "$here/$name.plist" "$agents/$name.plist"
done
# Copies started by hand would hold the ports.
pkill -f 'whisper-server .*--port 8178' || true
pkill -f 'voice_server.py --host .* --port 8179' || true
sleep 2
for name in com.benampel.ccair-whisper com.benampel.ccair-voice; do
  launchctl bootstrap "gui/$uid" "$agents/$name.plist"
done
launchctl list | grep ccair || true
