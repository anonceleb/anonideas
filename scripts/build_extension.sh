#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT=dist
MANIFEST="$ROOT/manifest.json"
VERSION=$(node -p "require('./manifest.json').version")
ZIPNAME="wordle-solver-extension-$VERSION.zip"
mkdir -p "$ROOT/$OUT"
node "$ROOT/scripts/check_release.js"
# Files to include
FILES=("manifest.json" "background.js" "content.js" "solver.js" "strategist.js" "styles.css" "icons" "data" "README.md" "LICENSE" )
cd "$ROOT"
rm -f "$OUT/$ZIPNAME"
zip -r "$OUT/$ZIPNAME" "${FILES[@]}"
echo "Wrote $OUT/$ZIPNAME"
