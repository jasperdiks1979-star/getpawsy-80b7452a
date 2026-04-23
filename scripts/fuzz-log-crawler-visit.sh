#!/usr/bin/env bash
# CLI runner for the `log-crawler-visit` edge-function fuzz test.
#
# Wraps `deno test` with the FUZZ_SEED / FUZZ_ITERATIONS env knobs the
# property-based suite already understands, and surfaces any shrunken
# fixture files the suite drops into /tmp on failure so you can replay
# the exact failing payload without scrolling through test output.
#
# Usage:
#   scripts/fuzz-log-crawler-visit.sh [--seed <hex|int>] [--iterations <N>]
#                                     [--fixture-dir <dir>] [--keep-fixtures]
#                                     [-- <extra deno test args>]
#
# Examples:
#   # Quick local run with defaults (seed=0xC0FFEE, iterations=3)
#   scripts/fuzz-log-crawler-visit.sh
#
#   # Reproduce a nightly failure
#   scripts/fuzz-log-crawler-visit.sh --seed 0xA1B2C3D4 --iterations 25
#
#   # Heavy local soak with a custom fixture output directory
#   scripts/fuzz-log-crawler-visit.sh -s 0xDEADBEEF -i 200 \
#     --fixture-dir ./fuzz-fixtures
#
# Exit codes:
#   0   all iterations passed
#   1   at least one violation detected (fixture path printed)
#   2   bad CLI usage
#   3   deno is not installed

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_FILE="supabase/functions/log-crawler-visit/index_test.ts"
TEST_FILTER="log-crawler-visit fuzz"

# Defaults match the in-test fallbacks so a no-arg invocation reproduces
# what `supabase test edge-functions` does locally.
SEED="${FUZZ_SEED:-0xC0FFEE}"
ITERATIONS="${FUZZ_ITERATIONS:-3}"
FIXTURE_DIR="${FUZZ_FIXTURE_DIR:-/tmp}"
KEEP_FIXTURES=0
EXTRA_ARGS=()

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# --- arg parsing ------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--seed)
      [[ $# -ge 2 ]] || { echo "$SCRIPT_NAME: --seed requires a value" >&2; exit 2; }
      SEED="$2"; shift 2 ;;
    -i|--iterations)
      [[ $# -ge 2 ]] || { echo "$SCRIPT_NAME: --iterations requires a value" >&2; exit 2; }
      ITERATIONS="$2"; shift 2 ;;
    --fixture-dir)
      [[ $# -ge 2 ]] || { echo "$SCRIPT_NAME: --fixture-dir requires a value" >&2; exit 2; }
      FIXTURE_DIR="$2"; shift 2 ;;
    --keep-fixtures)
      KEEP_FIXTURES=1; shift ;;
    -h|--help)
      usage 0 ;;
    --)
      shift; EXTRA_ARGS+=("$@"); break ;;
    *)
      echo "$SCRIPT_NAME: unknown argument '$1'" >&2
      usage 2 ;;
  esac
done

# --- preflight --------------------------------------------------------------
if ! command -v deno >/dev/null 2>&1; then
  echo "$SCRIPT_NAME: 'deno' not found in PATH. Install via https://deno.land/." >&2
  exit 3
fi

if ! [[ "$ITERATIONS" =~ ^[1-9][0-9]*$ ]]; then
  echo "$SCRIPT_NAME: --iterations must be a positive integer (got '$ITERATIONS')" >&2
  exit 2
fi

# Snapshot pre-existing fixtures so we only report ones produced by
# THIS run. The fuzz suite writes
# `log-crawler-visit-fuzz-fixture-<axis>-<ts>.json` files on violation.
FIXTURE_GLOB="log-crawler-visit-fuzz-fixture-*.json"
mkdir -p "$FIXTURE_DIR"
PRE_FIXTURES="$(mktemp)"
trap 'rm -f "$PRE_FIXTURES"' EXIT
( cd "$FIXTURE_DIR" && ls -1 $FIXTURE_GLOB 2>/dev/null || true ) | sort > "$PRE_FIXTURES"

# --- run --------------------------------------------------------------------
echo "[fuzz-cli] seed=$SEED iterations=$ITERATIONS fixture-dir=$FIXTURE_DIR"
echo "[fuzz-cli] running: deno test --allow-net --allow-env --filter \"$TEST_FILTER\" $TEST_FILE"
echo

set +e
(
  cd "$REPO_ROOT"
  FUZZ_SEED="$SEED" FUZZ_ITERATIONS="$ITERATIONS" \
    deno test --allow-net --allow-env \
      --filter "$TEST_FILTER" \
      "$TEST_FILE" \
      "${EXTRA_ARGS[@]}"
)
TEST_EXIT=$?
set -e

# --- fixture surfacing ------------------------------------------------------
POST_FIXTURES="$(mktemp)"
trap 'rm -f "$PRE_FIXTURES" "$POST_FIXTURES"' EXIT
( cd "$FIXTURE_DIR" && ls -1 $FIXTURE_GLOB 2>/dev/null || true ) | sort > "$POST_FIXTURES"

# Anything new since we started is from this run.
NEW_FIXTURES="$(comm -13 "$PRE_FIXTURES" "$POST_FIXTURES" || true)"

echo
if [[ $TEST_EXIT -eq 0 ]]; then
  echo "[fuzz-cli] ✅ no violations (seed=$SEED iterations=$ITERATIONS)"
  exit 0
fi

echo "[fuzz-cli] ❌ fuzz test failed (exit=$TEST_EXIT)"
echo "[fuzz-cli] reproduce locally with:"
echo "    FUZZ_SEED=$SEED FUZZ_ITERATIONS=$ITERATIONS \\"
echo "      deno test --allow-net --allow-env --filter \"$TEST_FILTER\" $TEST_FILE"
echo

if [[ -z "$NEW_FIXTURES" ]]; then
  echo "[fuzz-cli] no shrunken fixture files found in $FIXTURE_DIR"
  echo "[fuzz-cli] (the test may have failed before reaching the shrinker — check the log above)"
  exit 1
fi

echo "[fuzz-cli] failing payload(s) — shrunken fixtures from this run:"
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  path="$FIXTURE_DIR/$name"
  echo
  echo "──── $path ────"
  # Pretty-print with jq if available; otherwise raw cat.
  if command -v jq >/dev/null 2>&1; then
    jq '.' "$path" || cat "$path"
  else
    cat "$path"
  fi
done <<< "$NEW_FIXTURES"

if [[ $KEEP_FIXTURES -eq 0 && "$FIXTURE_DIR" == "/tmp" ]]; then
  echo
  echo "[fuzz-cli] (fixtures left in /tmp; pass --keep-fixtures or --fixture-dir <persistent path> to retain across reboots)"
fi

exit 1