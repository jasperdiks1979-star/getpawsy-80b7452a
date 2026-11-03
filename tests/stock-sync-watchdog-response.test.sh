#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
script="scripts/verify-stock-sync-watchdog-response.sh"
fixture="$(mktemp)"
trap 'rm -f "$fixture"' EXIT
passes=0
accept() {
  printf '%s\n' "$1" > "$fixture"
  bash "$script" "$fixture" >/dev/null || { echo "Expected accepted response: $1" >&2; exit 1; }
  passes=$((passes+1))
}
reject() {
  printf '%s\n' "$1" > "$fixture"
  if bash "$script" "$fixture" >/dev/null 2>&1; then
    echo "Expected rejected response: $1" >&2; exit 1
  fi
  passes=$((passes+1))
}
accept '{"claimed":true,"verified":true,"checkpoint_before":772,"checkpoint_persisted":773,"status":"completed"}'
accept '{"claimed":true,"verified":true,"checkpoint_before":772,"checkpoint_persisted":773,"status":"needs_review"}'
accept '{"claimed":true,"verified":false,"deferred":true,"checkpoint_before":772,"checkpoint_persisted":773,"status":"needs_review"}'
accept '{"claimed":true,"verified":false,"deferred":true,"checkpoint_before":284,"checkpoint_persisted":285,"status":"running"}'
accept '{"claimed":false,"reason":"No partial running sync"}'
accept '{"claimed":false,"checkpoint":284}'
reject '{"claimed":true,"checkpoint_before":284,"checkpoint_persisted":285,"status":"running"}'
reject '{"claimed":true,"verified":false,"checkpoint_before":284,"checkpoint_persisted":285,"status":"running"}'
reject '{"claimed":true,"verified":true,"deferred":true,"checkpoint_before":284,"checkpoint_persisted":285,"status":"running"}'
reject '{"claimed":true,"verified":false,"deferred":true,"checkpoint_before":772,"checkpoint_persisted":773,"status":"completed"}'
reject '{"claimed":true,"verified":true,"checkpoint_before":284,"checkpoint_persisted":286,"status":"running"}'
reject '{"claimed":true,"verified":true,"ncheckpoint_before":284,"checkpoint_persisted":284,"status":"running"}'
reject '{"claimed":true,"verified":true,"checkpoint_before":284.5,"checkpoint_persisted":285.5,"status":"running"}'
reject '{"claimed":true,"verified":true,"checkpoint_before":-1,"checkpoint_persisted":0,"status":"running"}'
reject '{"claimed":true,"verified":true,"checkpoint_before":284,"checkpoint_persisted":285,"status":"error"}'
reject '{"claimed":false,"checkpoint":"284"}'
reject '{"claimed":false,"reason":"bogus"}'
reject 'not-json'
echo "$passes watchdog response contract scenarios passed"
