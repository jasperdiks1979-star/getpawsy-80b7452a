#!/usr/bin/env bash
set -euo pipefail

# Offline-only validation. No secrets, cloud services, database writes or deployment.
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required" >&2
  exit 1
fi

node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 22) { console.error("Node.js 22+ required"); process.exit(1); }'

node --experimental-strip-types --test \
  tests/stock-sync-watchdog-crash-restart.node.test.ts \
  tests/stock-sync-final-needs-review.node.test.ts \
  tests/stock-sync-final-status.node.test.ts \
  tests/stock-sync-watchdog-single-batch.node.test.ts \
  tests/stock-sync-deferred-recovery-proof.node.test.ts \
  tests/stock-sync-recovery-boundaries.node.test.ts \
  tests/stock-sync-deferred-policy-boundaries.node.test.ts

if command -v deno >/dev/null 2>&1; then
  deno test supabase/functions/_shared/stock-sync-*test.ts
else
  echo "Deno not installed: required stock tests cannot run (NOT passed)" >&2
  exit 1
fi
