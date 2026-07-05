#!/usr/bin/env bash
# Assemble a static MagicMirror-module demo bundle for the portfolio pipeline.
# Usage: bash scripts/demo-build.sh [output-dir]
# Runs from the repo root on ubuntu-latest (and macOS for local testing).
set -euo pipefail

OUT="${1:-demo-dist}"
HARNESS_BASE="https://raw.githubusercontent.com/SkylerGodfrey/portfolio-demos/main/pipeline/mmm-harness"

rm -rf "$OUT"
mkdir -p "$OUT/module"

# 1. Fetch the harness (deployed into portfolio-demos from repository-definitions).
for f in index.html harness.js harness.css; do
  curl -fsSL "${HARNESS_BASE}/${f}" -o "${OUT}/${f}"
done

# 2. Copy the module's own front-end files into module/. Exclude server-side and
#    repo cruft. node_helper.js is intentionally dropped (no node at runtime).
rsync -a \
  --exclude "/${OUT}" \
  --exclude ".git" --exclude ".github" \
  --exclude "node_modules" \
  --exclude "node_helper.js" \
  --exclude "*.test.js" \
  ./ "${OUT}/module/"

# 3. The fixture that drives the harness.
cp demo.config.json "${OUT}/demo.config.json"

echo "MMM demo bundle assembled -> ${OUT}"
