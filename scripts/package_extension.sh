#!/usr/bin/env bash
set -euo pipefail

OUT=dist
mkdir -p "$OUT"
ZIP_NAME="$OUT/wordle-solver-extension-$(date +%Y%m%d-%H%M%S).zip"

echo "Packaging extension to $ZIP_NAME"
zip -r "$ZIP_NAME" . -x "node_modules/*" "tests/*" "**/.git/*" "**/.github/*" "dist/*" "*.zip"

echo "Package created: $ZIP_NAME"
