#!/usr/bin/env bash
# Mirror of the GitHub Action `edge-function-types.yml` — runs the same
# `deno check` + `deno test` sequence locally so contributors can validate
# the pinterest_pin_queue type contract before pushing.
#
# Usage:
#   npm run edge:contract        # one-shot check
#   bash scripts/edge-contract-check.sh
#
# Requirements: Deno v1.x on PATH. Install: https://deno.land/#installation

set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
NC='\033[0m'

if ! command -v deno >/dev/null 2>&1; then
  echo -e "${RED}✗ deno not found on PATH.${NC} Install from https://deno.land/#installation" >&2
  exit 127
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILES=(
  "supabase/functions/_shared/pinterest-queue-types.ts"
  "supabase/functions/pinterest-viral-batch/index.ts"
  "supabase/functions/pinterest-viral-batch/types_test.ts"
  "supabase/functions/pinterest-viral-batch/sanitize_test.ts"
)

echo -e "${YLW}▶ deno check${NC} (${#FILES[@]} files)"
deno check "${FILES[@]}"

echo -e "${YLW}▶ deno test${NC} (pinterest-viral-batch contract suite)"
COVERAGE_DIR="${COVERAGE_DIR:-coverage/edge-contract}"
rm -rf "$COVERAGE_DIR"
mkdir -p "$COVERAGE_DIR"
deno test \
  --allow-net --allow-env \
  --coverage="$COVERAGE_DIR" \
  supabase/functions/pinterest-viral-batch/types_test.ts \
  supabase/functions/pinterest-viral-batch/sanitize_test.ts

echo -e "${YLW}▶ deno coverage${NC} (summary + lcov)"
deno coverage "$COVERAGE_DIR" || true
deno coverage "$COVERAGE_DIR" --lcov --output="$COVERAGE_DIR/lcov.info"
echo "Coverage report written to $COVERAGE_DIR (lcov: $COVERAGE_DIR/lcov.info)"

# Static guard: no backdrop_* keys may live inside the PinterestQueueInsert
# interface body. Mirrors the CI guard in edge-function-types.yml.
echo -e "${YLW}▶ static guard${NC} (PinterestQueueInsert must not contain backdrop_*)"
if awk '/export interface PinterestQueueInsert/{flag=1;next}/^}/{flag=0}flag' \
     supabase/functions/_shared/pinterest-queue-types.ts \
   | grep -E '^\s*backdrop_' ; then
  echo -e "${RED}✗ backdrop_* field detected inside PinterestQueueInsert. Move it to BackdropMetadata.${NC}" >&2
  exit 1
fi

echo -e "${GRN}✓ All edge-function contract checks passed.${NC}"