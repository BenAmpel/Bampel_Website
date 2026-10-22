#!/bin/bash
# Double-click this file in Finder to start the CCAIR Behavioral Lab (it runs "npm run lab").
set -u
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org, then double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi
node scripts/lab.mjs
