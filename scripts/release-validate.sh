#!/usr/bin/env bash
# Independent release validation without touching the project checkout or dev server.
# 1) Full TypeScript check (app + node configs) with tsgo.
# 2) Full production build (`npm run build`: idempotency test, US-address guard,
#    vite build + sitemaps + product/guide prerender + seo-coverage gate) in an
#    isolated copy under /tmp, so public/ and dist/ of the project stay untouched.
# 3) Optional rollback rehearsal: build a previous commit from `git archive`
#    (read-only git) in a second isolated copy.
# Usage: bash scripts/release-validate.sh [ROLLBACK_SHA]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT=/tmp/release-validate
LOG=/tmp/release-validate-build.log
cd "$ROOT"
echo "HEAD $(git rev-parse HEAD)"
echo "dirty files: $(git status --porcelain | wc -l)"

tsgo --noEmit -p tsconfig.app.json > /tmp/tsgo-app.log 2>&1; A=$?
tsgo --noEmit -p tsconfig.node.json > /tmp/tsgo-node.log 2>&1; N=$?
echo "typecheck app=$A node=$N"

rm -rf "$OUT" && mkdir -p "$OUT"
rsync -a --exclude node_modules --exclude dist --exclude .git ./ "$OUT/"
ln -s "$ROOT/node_modules" "$OUT/node_modules"
( cd "$OUT" && npm run build ) > "$LOG" 2>&1; B=$?
echo "production build+prerender exit=$B (log $LOG)"
grep -E "seo-coverage|Prerendered [0-9]+ product|Merchant identity" "$LOG" || true

R=0
if [ -n "${1:-}" ]; then
  RB=/tmp/rollback-rehearsal
  rm -rf "$RB" && mkdir -p "$RB"
  git archive "$1" | tar -x -C "$RB"
  ln -s "$ROOT/node_modules" "$RB/node_modules"
  ( cd "$RB" && npx vite build ) > /tmp/rollback-build.log 2>&1; R=$?
  echo "rollback rehearsal ($1) build exit=$R"
fi

[ $A -eq 0 ] && [ $N -eq 0 ] && [ $B -eq 0 ] && [ $R -eq 0 ] && echo "RELEASE_VALIDATION=PASS" && exit 0
echo "RELEASE_VALIDATION=FAIL"; exit 1
