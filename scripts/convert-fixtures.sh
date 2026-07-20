#!/usr/bin/env bash
# scripts/convert-fixtures.sh — converts recorded fixture masters (webm/mp4) into .mjpeg
# replays for Chromium's fake video capture (docs/IMPLEMENTATION.md Task 6 /
# docs/MODEL_AND_DATA.md §4). Chromium's --use-file-for-fake-video-capture accepts ONLY
# .y4m/.mjpeg (AGENTS.md verified fact #3) — y4m is uncompressed and too large to commit,
# so every master gets an mjpeg replay instead.
#
# Usage: scripts/convert-fixtures.sh
# Reads every file in tests/fixtures/masters/*.{webm,mp4}, writes the matching
# tests/fixtures/replay/<basename>.mjpeg, and updates fixtures_manifest.json with both paths.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MASTERS_DIR="$ROOT_DIR/tests/fixtures/masters"
REPLAY_DIR="$ROOT_DIR/tests/fixtures/replay"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH — required to convert fixture masters to mjpeg." >&2
  exit 1
fi

mkdir -p "$REPLAY_DIR"

shopt -s nullglob
masters=("$MASTERS_DIR"/*.webm "$MASTERS_DIR"/*.mp4)
shopt -u nullglob

if [ ${#masters[@]} -eq 0 ]; then
  echo "No fixture masters found in $MASTERS_DIR — nothing to convert."
  exit 0
fi

for master in "${masters[@]}"; do
  basename="$(basename "${master%.*}")"
  replay="$REPLAY_DIR/$basename.mjpeg"
  echo "Converting $master -> $replay"
  ffmpeg -y -i "$master" -c:v mjpeg -q:v 3 -an "$replay"
done

echo "Converted ${#masters[@]} fixture(s). Update fixtures_manifest.json with the new entries."
