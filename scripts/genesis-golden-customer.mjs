#!/usr/bin/env node
/**
 * GENESIS Ω∞ — Zero Regression deployment gate.
 *
 * Invokes the `genesis-golden-customer` edge function against production and
 * fails the CI job (exit 1) if the anonymous customer journey is broken.
 * Blocks the deployment before it can reach production.
 *
 * Env (required, no fallbacks): SUPABASE_URL, SUPABASE_ANON_KEY.
 */
import { requireCiBackendEnv } from './lib/ci-backend-env.mjs';
const { url: SUPABASE_URL, key: ANON_KEY } = requireCiBackendEnv();

// CEO Kill Switch: safe exceptions bypass the deployment block but still
// run the Golden Customer for evidence.
const DEPLOY_KIND = (process.env.DEPLOYMENT_KIND || 'standard').toLowerCase();
const SAFE_KINDS = new Set([
  'hotfix','rollback','diagnostics','monitoring','evidence','production_validation',
]);

const body = {
  trigger: 'ci_deployment_gate',
  git_commit: process.env.GITHUB_SHA ?? null,
  deployment_id: process.env.GITHUB_RUN_ID ?? null,
  migration_id: process.env.MIGRATION_ID ?? null,
  deployment_kind: DEPLOY_KIND,
};

// Pre-flight: consult the CEO Kill Switch BEFORE running the Golden Customer.
// If tripped and this is not a safe-exception deploy, block immediately.
async function killSwitchGate() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ceo_kill_switch_gate`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_deployment_kind: DEPLOY_KIND }),
  });
  if (!r.ok) return { allowed: true, kill_switch_status: 'unknown', reason: 'gate_probe_failed' };
  return r.json();
}

const gate = await killSwitchGate();
console.log('CEO Kill Switch:', JSON.stringify(gate));
if (!gate.allowed && !SAFE_KINDS.has(DEPLOY_KIND)) {
  console.error(`\nCEO KILL SWITCH — DEPLOYMENT BLOCKED (status=${gate.kill_switch_status}).`);
  console.error(`Reason: ${gate.reason}`);
  console.error('Only DEPLOYMENT_KIND in {hotfix,rollback,diagnostics,monitoring,evidence,production_validation} bypasses.');
  process.exit(1);
}

const res = await fetch(`${SUPABASE_URL}/functions/v1/genesis-golden-customer`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const json = await res.json().catch(() => ({}));
console.log(JSON.stringify(json, null, 2));

if (!res.ok || json.status === 'fail') {
  console.error(`\nGENESIS ZERO-REGRESSION GATE — DEPLOYMENT BLOCKED (status=${json.status}, failed=${json.failed}).`);
  console.error('Anonymous customer journey is broken. Fix before deploying.');
  if (SAFE_KINDS.has(DEPLOY_KIND)) {
    console.error(`Safe-exception kind '${DEPLOY_KIND}' — bypassing the block; evidence recorded.`);
    process.exit(0);
  }
  process.exit(1);
}

console.log(`\nGolden Customer PASSED — products=${json.totals?.all_products}, dog=${json.totals?.dog_products}, cat=${json.totals?.cat_products}.`);