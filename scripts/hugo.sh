#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python "$ROOT_DIR/scripts/build_publications_json.py"
python "$ROOT_DIR/scripts/generate_research_summary_pdf.py"

exec hugo "$@"
