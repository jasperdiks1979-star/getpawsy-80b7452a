/**
 * cinematic-ad-worker-control
 *
 * Admin-only control surface for the cinematic-ad pipeline.
 * Actions:
 *   - health         → returns secret presence, DB-derived worker health,
 *                      stale-candidate jobs, and proxies /health/worker
 *                      (when RENDER_WORKER_HEALTH_URL is set).
 *   - mark_stale     → flips render_queued > 10min jobs without
 *                      render_started_at to status='worker_stale'.
 *   - retry_render   → resets a job back to render_queued.
 *   - retry_publish  → re-runs the Pinterest publish chain for a job
 *                      that already has output_mp4_url.
 *
 * Logging tags: [worker-health] [worker-claim] [worker-stale]
 *               [retry-render] [retry-pinterest]
 *               [pinterest-publish-success] [pinterest-publish-error]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import sodium from "https://esm.sh/libsodium-wrappers-sumo@0.7.15";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
const RENDER_WORKER_HEALTH_URL = Deno.env.get("RENDER_WORKER_HEALTH_URL") ?? "";
const GH_PAT_ENV = Deno.env.get("GH_PAT") ?? Deno.env.get("GITHUB_TOKEN") ?? "";
const GH_REPO = Deno.env.get("GH_REPO") ?? Deno.env.get("GITHUB_REPO") ?? "";
const GH_WORKFLOW = Deno.env.get("GH_WORKFLOW") ?? "render-cinematic-ad.yml";
const GH_REF = Deno.env.get("GH_REF") ?? "main";
const DEFAULT_PAT_TEST_REPO = "jasperdiks1979-star/getpawsy-80b7452a";

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const WORKER_LIVE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
// Parallel render capacity. Each "slot" maps to one concurrent GitHub Actions
// runner. A slot is considered occupied when a job is either actively
// rendering or has been dispatched within DISPATCH_LOCK_MS but not yet claimed
// (prevents a thundering-herd that exceeds the cap before workers pick up).
const MAX_RENDER_SLOTS = Math.max(1, Number(Deno.env.get("MAX_RENDER_SLOTS") ?? "6"));
const DISPATCH_LOCK_MS = 5 * 60 * 1000;
const CANONICAL_FUNCTIONS = [
  "cinematic-ad-claim-job",
  "cinematic-ad-render-webhook",
  "worker-health",
  "cinematic-ad-worker-control",
  "cinematic-ad-queue-render",
] as const;
const COMPAT_FUNCTIONS = [
  "cinematic-ad-complete-job",
  "cinematic-ad-fail-job",
  "cinematic-ad-worker-health",
  "cinematic-ad-dispatch",
] as const;

function trace() { return crypto.randomUUID().slice(0, 8); }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resolve effective GH_PAT: DB-backed rotation takes precedence over env.
// The raw value never leaves this function.
async function getEffectiveGhPat(admin: any): Promise<{ token: string; source: "db" | "env" | "none"; updatedAt: string | null }> {
  try {
    const { data } = await admin
      .from("admin_secrets")
      .select("value, updated_at")
      .eq("name", "GH_PAT")
      .maybeSingle();
    if (data?.value) return { token: String(data.value), source: "db", updatedAt: data.updated_at ?? null };
  } catch (_e) { /* table may not exist yet */ }
  if (GH_PAT_ENV) return { token: GH_PAT_ENV, source: "env", updatedAt: null };
  return { token: "", source: "none", updatedAt: null };
}

function maskToken(t: string): string {
  if (!t) return "";
  const prefix = t.slice(0, 8);
  return `${prefix}${"•".repeat(8)}`;
}

// Acceptable PAT formats: classic `ghp_…` or fine-grained `github_pat_…`.
function isValidPatFormat(t: string): { ok: boolean; kind: "classic" | "fine_grained" | "unknown" } {
  if (/^ghp_[A-Za-z0-9]{30,}$/.test(t)) return { ok: true, kind: "classic" };
  if (/^github_pat_[A-Za-z0-9_]{40,}$/.test(t)) return { ok: true, kind: "fine_grained" };
  return { ok: false, kind: "unknown" };
}

function requiredSecretsReport(ghPatPresent: boolean) {
  return {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
    RENDER_WORKER_SECRET: !!RENDER_WORKER_SECRET,
    RENDER_WORKER_HEALTH_URL: !!RENDER_WORKER_HEALTH_URL,
    GH_PAT: ghPatPresent,
    GH_REPO: !!GH_REPO,
  };
}

function activeBackend() {
  let supabaseHost = "unknown";
  try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }
  return {
    supabase_url: SUPABASE_URL,
    supabase_host: supabaseHost,
    functions_base_url: SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "",
    required_github_secret: {
      name: "SUPABASE_URL",
      value: SUPABASE_URL,
      must_match_queue_table: true,
    },
  };
}

// Required secrets that must live on the GitHub repo for
// .github/workflows/render-cinematic-ad.yml to succeed.
const REQUIRED_GITHUB_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RENDER_WORKER_SECRET",
] as const;

type GhSecretsValidation = {
  ok: boolean;
  repo: string | null;
  workflow: string;
  ref: string;
  ghPatPresent: boolean;
  ghRepoPresent: boolean;
  ghApiStatus: number | null;
  ghApiOk: boolean;
  message?: string;
  // Per-required secret presence on the GitHub repo (never includes values).
  secrets: Record<string, { present: boolean; updatedAt?: string | null }>;
  missing: string[];
  hint?: string;
};

async function validateGithubSecrets(traceId: string, ghPat: string): Promise<GhSecretsValidation> {
  const base: GhSecretsValidation = {
    ok: false,
    repo: GH_REPO || null,
    workflow: GH_WORKFLOW,
    ref: GH_REF,
    ghPatPresent: !!ghPat,
    ghRepoPresent: !!GH_REPO,
    ghApiStatus: null,
    ghApiOk: false,
    secrets: Object.fromEntries(REQUIRED_GITHUB_SECRETS.map((k) => [k, { present: false }])),
    missing: [...REQUIRED_GITHUB_SECRETS],
  };
  if (!ghPat) {
    base.message = "GH_PAT secret missing in Lovable Cloud. Cannot query GitHub API.";
    base.hint = "Add a GitHub Personal Access Token with repo scope as GH_PAT in Cloud → Functions → Secrets.";
    return base;
  }
  if (!GH_REPO) {
    base.message = "GH_REPO secret missing in Lovable Cloud (format: owner/repo).";
    base.hint = "Add GH_REPO (e.g. your-org/your-repo) in Cloud → Functions → Secrets.";
    return base;
  }
  try {
    const url = `https://api.github.com/repos/${GH_REPO}/actions/secrets?per_page=100`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${ghPat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "lovable-cinematic-ads",
      },
    });
    base.ghApiStatus = res.status;
    base.ghApiOk = res.ok;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[gh-secrets] ${traceId} list failed`, { status: res.status, body: text.slice(0, 200) });
      if (res.status === 401 || res.status === 403) {
        base.message = `GitHub API ${res.status}: token rejected. PAT needs 'repo' scope (classic) or 'Secrets: read' (fine-grained) on ${GH_REPO}.`;
        base.hint = "Rotate GH_PAT with the correct scopes and update it in Cloud secrets.";
      } else if (res.status === 404) {
        base.message = `GitHub API 404: repo ${GH_REPO} not found or token has no access.`;
        base.hint = "Verify GH_REPO is exactly owner/repo and the PAT owner can see it.";
      } else {
        base.message = `GitHub API ${res.status}: ${text.slice(0, 200)}`;
      }
      return base;
    }
    const body = await res.json().catch(() => ({ secrets: [] }));
    const found = new Map<string, string | null>();
    for (const s of body.secrets ?? []) {
      if (s?.name) found.set(s.name, s.updated_at ?? null);
    }
    const missing: string[] = [];
    for (const k of REQUIRED_GITHUB_SECRETS) {
      if (found.has(k)) {
        base.secrets[k] = { present: true, updatedAt: found.get(k) ?? null };
      } else {
        missing.push(k);
      }
    }
    base.missing = missing;
    base.ok = missing.length === 0;
    if (!base.ok) {
      base.message = `Missing GitHub repo secrets: ${missing.join(", ")}`;
      base.hint = `Open https://github.com/${GH_REPO}/settings/secrets/actions and add the missing entries.`;
    } else {
      base.message = `All ${REQUIRED_GITHUB_SECRETS.length} required GitHub secrets are present on ${GH_REPO}.`;
    }
    console.log(`[gh-secrets] ${traceId} validate`, { repo: GH_REPO, ok: base.ok, missing });
    return base;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[gh-secrets] ${traceId} crash`, msg);
    base.message = `GitHub API call failed: ${msg}`;
    return base;
  }
}

async function putGithubSecret(
  traceId: string,
  ghPat: string,
  repo: string,
  secretName: string,
  secretValue: string,
): Promise<{ name: string; ok: boolean; status: number; updated: boolean; message: string }> {
  await sodium.ready;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${ghPat}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lovable-cinematic-ads",
  };
  const keyRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, { headers });
  const publicKey = await keyRes.json().catch(() => ({}));
  if (!keyRes.ok || !publicKey?.key || !publicKey?.key_id) {
    return { name: secretName, ok: false, status: keyRes.status, updated: false, message: "GitHub public key fetch failed" };
  }
  const encryptedBytes = sodium.crypto_box_seal(
    secretValue,
    sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL),
  );
  const encrypted_value = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
  const putRes = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${secretName}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_value, key_id: publicKey.key_id }),
  });
  const body = await putRes.text().catch(() => "");
  const ok = putRes.status === 201 || putRes.status === 204;
  console.log(`[gh-secrets] ${traceId} sync ${secretName}`, { status: putRes.status, ok });
  return {
    name: secretName,
    ok,
    status: putRes.status,
    updated: ok,
    message: ok ? "secret synced" : body.slice(0, 200),
  };
}

async function syncGithubSecrets(traceId: string, ghPat: string) {
  if (!ghPat) throw new Error("GH_PAT secret not configured");
  if (!GH_REPO) throw new Error("GH_REPO secret not configured (format: owner/repo)");
  const desired = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    RENDER_WORKER_SECRET,
  } as const;
  const results = [] as Array<{ name: string; ok: boolean; status: number; updated: boolean; message: string }>;
  for (const [name, value] of Object.entries(desired)) {
    if (!value) throw new Error(`Cannot sync missing secret: ${name}`);
    results.push(await putGithubSecret(traceId, ghPat, GH_REPO, name, value));
  }
  const validation = await validateGithubSecrets(traceId, ghPat);
  return {
    ok: results.every((r) => r.ok) && validation.ok,
    repo: GH_REPO,
    workflow: GH_WORKFLOW,
    synced: results,
    validation,
    expected: activeBackend().required_github_secret,
  };
}

/**
 * Validate a GH_PAT against GitHub by probing the specific permissions the
 * render workflow needs. Never logs or echoes the token value.
 *
 * Probes:
 *   - GET /user                       → token works at all
 *   - GET /repos/{repo}               → repository access
 *   - GET /repos/{repo}/actions/permissions → Actions read
 *   - GET /repos/{repo}/actions/secrets       → Secrets read
 *   - GET /repos/{repo}/actions/workflows/{wf} → workflow_dispatch target visible
 */
type PatCheck = { ok: boolean; status: number | null; message: string };
type PatValidation = {
  ok: boolean;
  format: { ok: boolean; kind: string };
  repoTested: string;
  workflow: string;
  checks: {
    api_access: PatCheck;
    repo_access: PatCheck;
    actions_permission: PatCheck;
    secrets_permission: PatCheck;
    workflow_dispatch: PatCheck;
  };
  scopes: string[] | null;
  tokenKind: "classic" | "fine_grained" | "unknown";
  hint?: string;
};

async function validateGithubPat(
  traceId: string,
  ghPat: string,
  opts: { repo?: string },
): Promise<PatValidation> {
  const fmt = isValidPatFormat(ghPat);
  const repoTested = opts.repo || GH_REPO || DEFAULT_PAT_TEST_REPO;
  const out: PatValidation = {
    ok: false,
    format: { ok: fmt.ok, kind: fmt.kind },
    repoTested,
    workflow: GH_WORKFLOW,
    checks: {
      api_access:         { ok: false, status: null, message: "not checked" },
      repo_access:        { ok: false, status: null, message: "not checked" },
      actions_permission: { ok: false, status: null, message: "not checked" },
      secrets_permission: { ok: false, status: null, message: "not checked" },
      workflow_dispatch:  { ok: false, status: null, message: "not checked" },
    },
    scopes: null,
    tokenKind: fmt.kind,
  };
  if (!ghPat) {
    out.hint = "No GH_PAT configured. Paste a token in 'Update GitHub Token'.";
    return out;
  }
  if (!fmt.ok) {
    out.hint = "Token format invalid. Expect ghp_… (classic) or github_pat_… (fine-grained).";
    return out;
  }

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${ghPat}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lovable-cinematic-ads",
  };

  // 1. /user — basic token validity. Also reveals scopes header for classic PATs.
  try {
    const r = await fetch("https://api.github.com/user", { headers });
    const scopes = r.headers.get("x-oauth-scopes");
    out.scopes = scopes ? scopes.split(",").map((s) => s.trim()).filter(Boolean) : null;
    out.checks.api_access = {
      ok: r.ok, status: r.status,
      message: r.ok ? "PAT authenticates to GitHub API" : `GitHub API rejected token (${r.status})`,
    };
    if (!r.ok) {
      out.hint = "Token is invalid or revoked. Generate a new PAT at https://github.com/settings/personal-access-tokens.";
      return out;
    }
  } catch (e) {
    out.checks.api_access = { ok: false, status: null, message: `network error: ${e instanceof Error ? e.message : String(e)}` };
    return out;
  }

  // 2. repo access
  try {
    const r = await fetch(`https://api.github.com/repos/${repoTested}`, { headers });
    out.checks.repo_access = {
      ok: r.ok, status: r.status,
      message: r.ok
        ? `Repository access OK (${repoTested})`
        : r.status === 404
          ? `Repository access denied (404). Token cannot see ${repoTested}.`
          : `Repository access failed (${r.status})`,
    };
  } catch (e) {
    out.checks.repo_access = { ok: false, status: null, message: `network error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 3. actions permission (read)
  try {
    const r = await fetch(`https://api.github.com/repos/${repoTested}/actions/permissions`, { headers });
    out.checks.actions_permission = {
      ok: r.ok, status: r.status,
      message: r.ok
        ? "Actions: read OK"
        : r.status === 403
          ? "Missing Actions write permission (fine-grained PAT needs Actions: Read and write)"
          : `Actions permission check failed (${r.status})`,
    };
  } catch (e) {
    out.checks.actions_permission = { ok: false, status: null, message: `network error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 4. secrets permission (read)
  try {
    const r = await fetch(`https://api.github.com/repos/${repoTested}/actions/secrets?per_page=1`, { headers });
    out.checks.secrets_permission = {
      ok: r.ok, status: r.status,
      message: r.ok
        ? "Secrets: read OK"
        : r.status === 403
          ? "Missing Secrets permission (fine-grained PAT needs Secrets: Read and write)"
          : `Secrets permission check failed (${r.status})`,
    };
  } catch (e) {
    out.checks.secrets_permission = { ok: false, status: null, message: `network error: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 5. workflow_dispatch target
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repoTested}/actions/workflows/${GH_WORKFLOW}`,
      { headers },
    );
    out.checks.workflow_dispatch = {
      ok: r.ok, status: r.status,
      message: r.ok
        ? "workflow_dispatch OK"
        : r.status === 404
          ? `Workflow ${GH_WORKFLOW} not found in ${repoTested}`
          : `workflow_dispatch check failed (${r.status})`,
    };
  } catch (e) {
    out.checks.workflow_dispatch = { ok: false, status: null, message: `network error: ${e instanceof Error ? e.message : String(e)}` };
  }

  const allOk = Object.values(out.checks).every((c) => c.ok);
  out.ok = allOk;
  if (!allOk && !out.hint) {
    if (!out.checks.repo_access.ok) {
      out.hint = `Grant the PAT access to ${repoTested}. Fine-grained PATs must explicitly select this repository.`;
    } else if (!out.checks.actions_permission.ok) {
      out.hint = "Fine-grained PAT needs Actions: Read and write.";
    } else if (!out.checks.secrets_permission.ok) {
      out.hint = "Fine-grained PAT needs Secrets: Read and write.";
    } else if (!out.checks.workflow_dispatch.ok) {
      out.hint = `Push the render workflow file to ${repoTested}, or set GH_REPO to the correct repository.`;
    }
  }
  console.log(`[gh-pat] ${traceId} validate`, {
    repo: repoTested,
    kind: fmt.kind,
    ok: out.ok,
    statuses: Object.fromEntries(Object.entries(out.checks).map(([k, v]) => [k, v.status])),
  });
  return out;
}

async function updateGhPat(
  admin: any,
  traceId: string,
  newToken: string,
  userId: string,
): Promise<PatValidation> {
  const fmt = isValidPatFormat(newToken);
  if (!fmt.ok) {
    const err: any = new Error("Token format invalid. Expect ghp_… (classic) or github_pat_… (fine-grained).");
    err.code = "GH_PAT_FORMAT";
    throw err;
  }
  // Test BEFORE persisting so we never store a broken token.
  const validation = await validateGithubPat(traceId, newToken, {});
  if (!validation.checks.api_access.ok) {
    const err: any = new Error("Token did not authenticate to GitHub. Not saved.");
    err.code = "GH_PAT_REJECTED";
    err.validation = validation;
    throw err;
  }
  const { error } = await admin
    .from("admin_secrets")
    .upsert({ name: "GH_PAT", value: newToken, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "name" });
  if (error) throw error;
  console.log(`[gh-pat] ${traceId} rotated`, {
    user: userId,
    kind: fmt.kind,
    apiOk: validation.checks.api_access.ok,
    repoOk: validation.checks.repo_access.ok,
    actionsOk: validation.checks.actions_permission.ok,
    secretsOk: validation.checks.secrets_permission.ok,
    workflowOk: validation.checks.workflow_dispatch.ok,
  });
  return validation;
}

function missingRequired(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!RENDER_WORKER_SECRET) missing.push("RENDER_WORKER_SECRET");
  return missing;
}

function actionAllowsServiceAuth(req: Request, secret: string, action: string): boolean {
  if (!secret || req.headers.get("x-render-secret") !== secret) return false;
  return ["health", "debug_panel", "validate_github_secrets", "sync_github_secrets", "trigger_github_workflow", "self_heal"].includes(action);
}

async function fetchWorkerHealth(traceId: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!RENDER_WORKER_HEALTH_URL) return { ok: false, error: "RENDER_WORKER_HEALTH_URL not set" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(RENDER_WORKER_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    console.log(`[worker-health] ${traceId} fetched`, { status: res.status, busy: body?.busy });
    return { ok: res.ok, data: body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[worker-health] ${traceId} fetch failed`, msg);
    return { ok: false, error: msg };
  }
}

async function buildHealthSnapshot(admin: any, traceId: string) {
  const now = Date.now();

  // last claim = most recent render_started_at across all jobs
  const { data: lastClaimRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_started_at,render_worker_id,status")
    .not("render_started_at", "is", null)
    .order("render_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastCompleteRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,render_complete_at")
    .not("render_complete_at", "is", null)
    .order("render_complete_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // currently rendering job (if any)
  const { data: currentRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_worker_id,render_started_at")
    .eq("status", "rendering")
    .order("render_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // queued jobs that look stale (queued > 10min, never started)
  const cutoffIso = new Date(now - STALE_AFTER_MS).toISOString();
  const { data: staleCandidates } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at,status")
    .eq("status", "render_queued")
    .is("render_started_at", null)
    .lt("render_queued_at", cutoffIso);

  // already-flagged stale jobs
  const { data: flaggedStale } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at,status_message")
    .eq("status", "worker_stale");

  // Heartbeat row written by the Render background worker on every poll —
  // this is the primary liveness signal because Background Workers expose
  // no public HTTP routes.
  const { data: heartbeatRow } = await admin
    .from("cinematic_worker_heartbeats")
    .select("worker_id,last_poll_at,last_claim_at,last_job_id,updated_at")
    .order("last_poll_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Most recent activity timestamp from cinematic_ad_jobs (any of the worker-touched fields)
  const { data: lastTouchedRow } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,updated_at,render_started_at,render_complete_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const heartbeatAt = heartbeatRow?.last_poll_at ?? null;
  const heartbeatAgeMs = heartbeatAt ? now - new Date(heartbeatAt).getTime() : null;
  const lastClaimAt =
    heartbeatRow?.last_claim_at ?? lastClaimRow?.render_started_at ?? null;
  const lastCompleteAt = lastCompleteRow?.render_complete_at ?? null;
  const lastTouchedAt = lastTouchedRow?.updated_at ?? null;
  const lastClaimAgeMs = lastClaimAt ? now - new Date(lastClaimAt).getTime() : null;
  const lastTouchedAgeMs = lastTouchedAt ? now - new Date(lastTouchedAt).getTime() : null;

  // Worker is "live" if ANY of these signals fired within the live window
  // (heartbeat is preferred, but job activity is enough — Background Workers
  // have no HTTP endpoint we can rely on).
  const liveSignals = [heartbeatAgeMs, lastClaimAgeMs, lastTouchedAgeMs]
    .filter((v): v is number => typeof v === "number");
  const workerLive =
    liveSignals.length > 0 && Math.min(...liveSignals) < STALE_AFTER_MS;

  // Only mark "stale" when there are jobs sitting in render_queued AND no
  // liveness signal in the last 10 minutes. A backlog with a live worker
  // is just a backlog, not a stuck worker.
  const hasStaleQueue =
    (staleCandidates?.length ?? 0) > 0 || (flaggedStale?.length ?? 0) > 0;
  const workerStale = hasStaleQueue && !workerLive;

  console.log(`[worker-health] ${traceId} snapshot`, {
    workerLive, workerStale,
    heartbeatAgeMs, lastClaimAgeMs, lastTouchedAgeMs,
    staleCandidates: staleCandidates?.length ?? 0,
    flaggedStale: flaggedStale?.length ?? 0,
  });

  return {
    workerLive,
    workerStale,
    lastClaimAt,
    lastClaimAgeMs,
    lastClaimWorkerId: lastClaimRow?.render_worker_id ?? null,
    lastClaimJobId: lastClaimRow?.id ?? null,
    lastCompleteAt,
    heartbeat: heartbeatRow ?? null,
    heartbeatAgeMs,
    lastTouchedAt,
    lastTouchedAgeMs,
    currentJob: currentRow ?? null,
    staleCandidates: staleCandidates ?? [],
    flaggedStale: flaggedStale ?? [],
    staleThresholdMs: STALE_AFTER_MS,
    workerLiveWindowMs: STALE_AFTER_MS,
    queueHealth: (await admin.rpc("cinematic_queue_health")).data ?? null,
  };
}

async function markStale(admin: any, traceId: string) {
  // Safety: never auto-mark queued jobs as stale if the worker has any
  // liveness signal in the last 10 minutes (heartbeat, claim, or job touch).
  const now = Date.now();
  const cutoffIso10 = new Date(now - STALE_AFTER_MS).toISOString();
  const { data: hb } = await admin
    .from("cinematic_worker_heartbeats")
    .select("last_poll_at,last_claim_at")
    .gt("last_poll_at", cutoffIso10)
    .limit(1)
    .maybeSingle();
  const { data: recentTouch } = await admin
    .from("cinematic_ad_jobs")
    .select("id")
    .gt("updated_at", cutoffIso10)
    .limit(1)
    .maybeSingle();
  if (hb || recentTouch) {
    console.log(`[worker-stale] ${traceId} skip auto-mark — worker has recent activity`);
    return { marked: 0, ids: [] as string[], skipped: true as const };
  }
  const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data: targets, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id,product_slug,render_queued_at")
    .eq("status", "render_queued")
    .is("render_started_at", null)
    .lt("render_queued_at", cutoffIso);
  if (error) throw error;
  if (!targets || targets.length === 0) {
    console.log(`[worker-stale] ${traceId} no stale jobs`);
    return { marked: 0, ids: [] as string[] };
  }
  const ids = targets.map((t: any) => t.id);
  const { error: updErr } = await admin
    .from("cinematic_ad_jobs")
    .update({
      status: "worker_stale",
      status_message: "Render worker is not claiming jobs",
    })
    .in("id", ids);
  if (updErr) throw updErr;
  console.warn(`[worker-stale] ${traceId} marked ${ids.length} jobs`, { ids });
  return { marked: ids.length, ids };
}

async function retryRender(admin: any, jobId: string, traceId: string) {
  let supabaseHost = "unknown";
  try { supabaseHost = new URL(SUPABASE_URL).host; } catch { /* noop */ }
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) throw new Error("job not found");
  const prevStatus = job.status;
  const renderToken = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const patch = {
    status: "render_queued",
    render_token: renderToken,
    render_queued_at: nowIso,
    render_started_at: null,
    render_complete_at: null,
    render_worker_id: null,
    error_message: null,
    pinterest_publish_error: null,
    rendered_at: null,
    status_message: "Re-queued via admin retry.",
    updated_at: nowIso,
  };
  const { error: updErr, count: updCount } = await admin
    .from("cinematic_ad_jobs")
    .update(patch, { count: "exact" })
    .eq("id", jobId);
  if (updErr) throw updErr;
  // Re-fetch to confirm DB-side state.
  const { data: fresh } = await admin
    .from("cinematic_ad_jobs")
    .select("id,status,render_queued_at,render_started_at,render_complete_at,render_worker_id,render_attempts,error_message,updated_at")
    .eq("id", jobId)
    .maybeSingle();
  console.log(`[retry-render] ${traceId} re-queued`, {
    jobId,
    prevStatus,
    newStatus: fresh?.status,
    supabase_host: supabaseHost,
    update_count: updCount ?? null,
    fresh,
  });
  return { ok: true, jobId, prevStatus, newStatus: fresh?.status ?? "render_queued", supabase_host: supabaseHost, fresh };
}

async function retryPublish(admin: any, jobId: string, traceId: string) {
  const { data: job, error: jobErr } = await admin
    .from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) throw new Error("job not found");
  if (!job.output_mp4_url) throw new Error("job has no output_mp4_url; render first");

  // Re-invoke the webhook with status="uploaded" so the auto-publish chain
  // runs end-to-end (asset upsert → queue_draft → publish) with its own
  // bounded retries — no duplication of logic here.
  console.log(`[retry-pinterest] ${traceId} triggering publish chain`, { jobId });
  await admin.from("cinematic_ad_jobs").update({
    pinterest_publish_error: null,
    status_message: "Manual retry: re-running publish chain.",
  }).eq("id", jobId);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/cinematic-ad-render-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-render-secret": RENDER_WORKER_SECRET,
    },
    body: JSON.stringify({
      job_id: jobId,
      status: "uploaded",
      render_token: job.render_token ?? "",
      mp4_url: job.output_mp4_url,
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body?.ok) {
    console.error(`[pinterest-publish-error] ${traceId} retry failed`, { status: res.status, body });
    throw new Error(body?.message ?? `webhook status ${res.status}`);
  }
  console.log(`[pinterest-publish-success] ${traceId} retry chain dispatched`, { jobId });
  return { ok: true, jobId, webhookTrace: body.traceId ?? null };
}

async function resetStale(admin: any, traceId: string, ids?: string[]) {
  let query = admin
    .from("cinematic_ad_jobs")
    .select("id")
    .eq("status", "worker_stale");
  if (ids && ids.length > 0) query = query.in("id", ids);
  const { data: targets, error } = await query;
  if (error) throw error;
  if (!targets || targets.length === 0) {
    return { reset: 0, ids: [] as string[] };
  }
  const targetIds = targets.map((t: any) => t.id);
  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from("cinematic_ad_jobs")
    .update({
      status: "render_queued",
      render_queued_at: nowIso,
      render_started_at: null,
      render_complete_at: null,
      render_worker_id: null,
      error_message: null,
      status_message: "Re-queued from worker_stale via admin reset.",
      updated_at: nowIso,
    })
    .in("id", targetIds);
  if (updErr) throw updErr;
  console.log(`[reset-stale] ${traceId} reset ${targetIds.length} jobs`, { ids: targetIds });
  return { reset: targetIds.length, ids: targetIds };
}

/**
 * Counts render "slots" currently occupied. A slot is held by either:
 *   - a job with status='rendering' (worker actively encoding), or
 *   - a job with status='render_queued' whose render_dispatched_at is within
 *     the dispatch lock window (already handed to GitHub Actions but the
 *     runner has not yet claimed it).
 * Pass excludeJobId to ignore a specific row (useful when we are about to
 * dispatch that exact row and don't want to double-count it).
 */
async function countActiveRenderSlots(admin: any, excludeJobId: string | null): Promise<number> {
  console.log("[slot-check] SLOT_CHECK_START", { excludeJobId });
  const lockCutoffIso = new Date(Date.now() - DISPATCH_LOCK_MS).toISOString();

  let rendering = 0;
  try {
    let renderingQuery = admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "rendering");
    if (excludeJobId) renderingQuery = renderingQuery.neq("id", excludeJobId);
    const { count, error } = await renderingQuery;
    if (error) throw error;
    rendering = count ?? 0;
  } catch (e: any) {
    console.warn("[slot-check] SLOT_CHECK_FALLBACK rendering-count failed", {
      message: e?.message, code: e?.code,
    });
    rendering = 0;
  }

  let dispatching = 0;
  try {
    let dispatchingQuery = admin
      .from("cinematic_ad_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "render_queued")
      .gte("render_dispatched_at", lockCutoffIso);
    if (excludeJobId) dispatchingQuery = dispatchingQuery.neq("id", excludeJobId);
    const { count, error } = await dispatchingQuery;
    if (error) throw error;
    dispatching = count ?? 0;
  } catch (e: any) {
    // Schema cache / missing column / PostgREST 42703: never block dispatch.
    console.warn("[slot-check] SLOT_CHECK_FALLBACK dispatching-count failed — returning 0", {
      message: e?.message, code: e?.code,
    });
    dispatching = 0;
  }

  const total = rendering + dispatching;
  console.log("[slot-check] SLOT_CHECK_SUCCESS", { rendering, dispatching, total });
  return total;
}

async function triggerGithubWorkflow(
  admin: any,
  traceId: string,
  opts: { job_id?: string; claim_next?: boolean; ghPat?: string },
) {
  const ghPat = opts.ghPat ?? (await getEffectiveGhPat(admin)).token;
  if (!ghPat) throw new Error("GH_PAT secret not configured");
  if (!GH_REPO) throw new Error("GH_REPO secret not configured (format: owner/repo)");
  if (!opts.job_id && !opts.claim_next) {
    throw new Error("Either job_id or claim_next=true is required");
  }

  // Block dispatch if the GitHub repo is missing any required workflow secret —
  // otherwise the run starts and fails deep inside the Render MP4 step.
  const ghValidation = await validateGithubSecrets(traceId, ghPat);
  if (!ghValidation.ok) {
    const detail = ghValidation.missing.length
      ? `GitHub repository secrets missing: ${ghValidation.missing.join(", ")}. Open https://github.com/${GH_REPO}/settings/secrets/actions and add them before dispatching.`
      : ghValidation.message ?? "GitHub secrets validation failed";
    const err: any = new Error(detail);
    err.code = "GH_SECRETS_MISSING";
    err.validation = ghValidation;
    throw err;
  }

  let jobId = opts.job_id ?? "";
  // Slot accounting: enforce MAX_RENDER_SLOTS for true parallel rendering.
  // A slot is occupied by either an actively rendering job OR a job that was
  // dispatched within DISPATCH_LOCK_MS and not yet claimed by a worker.
  // NEVER let a slot-query error block dispatch — countActiveRenderSlots is
  // defensive and returns 0 on failure.
  let activeSlots = 0;
  try {
    activeSlots = await countActiveRenderSlots(admin, jobId || null);
  } catch (e: any) {
    console.warn("[gh-dispatch] SLOT_CHECK_FALLBACK outer — proceeding with dispatch", {
      message: e?.message, code: e?.code,
    });
    activeSlots = 0;
  }
  if (activeSlots >= MAX_RENDER_SLOTS) {
    return {
      ok: true,
      dispatched: false,
      message: `all ${MAX_RENDER_SLOTS} render slots active (${activeSlots}) — next job will dispatch when a slot frees up`,
      active_slots: activeSlots,
      max_render_slots: MAX_RENDER_SLOTS,
    };
  }
  if (!jobId && opts.claim_next) {
    const lockCutoff = new Date(Date.now() - DISPATCH_LOCK_MS).toISOString();
    let next: { id: string; render_dispatched_at: string | null } | null = null;
    try {
      const { data, error } = await admin
        .from("cinematic_ad_jobs")
        .select("id,render_dispatched_at")
        .eq("status", "render_queued")
        .or(`render_dispatched_at.is.null,render_dispatched_at.lt.${lockCutoff}`)
        .order("render_queued_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      next = data as any;
    } catch (e: any) {
      // Fallback: column-agnostic claim using two passes.
      console.warn("[gh-dispatch] SLOT_CHECK_FALLBACK claim_next .or() failed — using plain select", {
        message: e?.message, code: e?.code,
      });
      const { data, error } = await admin
        .from("cinematic_ad_jobs")
        .select("id,render_dispatched_at")
        .eq("status", "render_queued")
        .order("render_queued_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      next = (data ?? []).find((r: any) =>
        !r.render_dispatched_at || r.render_dispatched_at < lockCutoff
      ) ?? null;
    }
    if (!next) return { ok: true, dispatched: false, message: "no render_queued jobs to claim" };
    jobId = next.id;
  }

  if (!UUID_RE.test(jobId)) {
    throw new Error(`Full UUID required. Do not use shortened display id. (got: "${jobId}")`);
  }

  // ── PRE-DISPATCH SAFETY GATE ──
  // The claim-job edge function will reject any render that lacks
  // preflight_status='pass' or a creative_plan with HTTP 412
  // blocked_by_safety_gate. Without this check we burn a GitHub Actions
  // runner minute (and a render slot) just to fail in the claim step.
  // Re-check here so a stale or partially-prepared job never reaches the
  // runner: move it to needs_admin_review and skip dispatch.
  const { data: gateRow } = await admin
    .from("cinematic_ad_jobs")
    .select("preflight_status, creative_plan, legacy_unverified, blocked_reason")
    .eq("id", jobId)
    .maybeSingle();
  const preGateFailures: string[] = [];
  if (!gateRow) preGateFailures.push("job_missing");
  if (gateRow?.legacy_unverified) preGateFailures.push("legacy_unverified");
  if (gateRow && gateRow.preflight_status !== "pass") {
    preGateFailures.push(`preflight_${gateRow.preflight_status ?? "missing"}`);
  }
  if (gateRow && !gateRow.creative_plan) preGateFailures.push("creative_plan_missing");
  if (preGateFailures.length > 0) {
    const reasonStr = preGateFailures.join(", ");
    await admin
      .from("cinematic_ad_jobs")
      .update({
        status: "needs_admin_review",
        status_message: `Dispatch skipped — safety gate would block render: ${reasonStr}`,
        blocked_reason: `safety_gate_would_fail: ${reasonStr}`,
        render_dispatched_at: null,
        recoverable: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    console.warn(`[gh-dispatch] ${traceId} skipped — safety gate`, { jobId, preGateFailures });
    return {
      ok: true,
      dispatched: false,
      jobId,
      message: `safety gate would block — moved to needs_admin_review (${reasonStr})`,
      fail_reasons: preGateFailures,
    };
  }

  // Atomically reserve the slot: only flip render_dispatched_at when the row
  // is not already mid-dispatch. Two concurrent self-heal passes targeting the
  // same jobId cannot both succeed — the second sees zero rows returned and
  // bails out without invoking GitHub a second time.
  //
  // PostgREST regression: chaining .update().or() on a recently-added column
  // returns 42703 even when SELECT works. Split into SELECT-then-UPDATE so a
  // schema-cache hiccup can never block dispatch.
  const nowIso = new Date().toISOString();
  const lockCutoffIso = new Date(Date.now() - DISPATCH_LOCK_MS).toISOString();
  const { data: current, error: currentErr } = await admin
    .from("cinematic_ad_jobs")
    .select("id,render_dispatched_at,render_started_at,status")
    .eq("id", jobId)
    .maybeSingle();
  if (currentErr) throw currentErr;
  if (!current) {
    return { ok: true, dispatched: false, message: "job not found", jobId };
  }
  const lockHeld =
    !!current.render_dispatched_at &&
    current.render_dispatched_at >= lockCutoffIso &&
    !current.render_started_at;
  if (lockHeld) {
    console.log("[gh-dispatch] duplicate suppressed", { jobId, render_dispatched_at: current.render_dispatched_at });
    return {
      ok: true,
      dispatched: false,
      message: "duplicate dispatch suppressed — job already reserved within lock window",
      jobId,
    };
  }
  const { data: reserved, error: reserveErr } = await admin
    .from("cinematic_ad_jobs")
    .update({
      status: "render_queued",
      render_queued_at: nowIso,
      render_dispatched_at: nowIso,
      render_started_at: null,
      render_worker_id: null,
      status_message: `Dispatching to GitHub Actions (${GH_WORKFLOW}@${GH_REF}) at ${nowIso}`,
      updated_at: nowIso,
    })
    .eq("id", jobId)
    .select("id")
    .maybeSingle();
  if (reserveErr) throw reserveErr;
  if (!reserved) {
    return { ok: true, dispatched: false, message: "reservation update returned no row", jobId };
  }
  console.log("[gh-dispatch] SLOT_RESERVED", { jobId, render_dispatched_at: nowIso });
  console.log("[gh-dispatch] DISPATCH_STARTED", { jobId, repo: GH_REPO, workflow: GH_WORKFLOW, ref: GH_REF });

  const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const ghRes = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${ghPat}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "lovable-cinematic-ads",
    },
    body: JSON.stringify({ ref: GH_REF, inputs: { job_id: jobId } }),
  });

  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => "");
    console.error(`[gh-dispatch] ${traceId} failed`, { status: ghRes.status, body: text.slice(0, 500) });
    // Release the slot reservation so the watchdog can retry.
    await admin
      .from("cinematic_ad_jobs")
      .update({ render_dispatched_at: null, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "render_queued")
      .is("render_started_at", null);
    const err: any = new Error(`GitHub workflow_dispatch failed: ${ghRes.status} ${text.slice(0, 200)}`);
    err.code = "GH_DISPATCH_HTTP_FAILED";
    err.http_status = ghRes.status;
    err.error_body = text.slice(0, 500);
    err.job_id = jobId;
    err.repo = GH_REPO;
    err.workflow = GH_WORKFLOW;
    err.ref = GH_REF;
    throw err;
  }

  // Confirm queued-for-render only while the job is still queued. If the worker
  // already claimed it, do not overwrite rendering/render_complete state.
  await admin
    .from("cinematic_ad_jobs")
    .update({
      status_message: `Dispatched to GitHub Actions (${GH_WORKFLOW}@${GH_REF}) at ${nowIso}`,
      updated_at: nowIso,
    })
    .eq("id", jobId)
    .eq("status", "render_queued");

  const runsUrl = `https://github.com/${GH_REPO}/actions/workflows/${GH_WORKFLOW}`;
  console.log(`[gh-dispatch] ${traceId} dispatched`, { jobId, repo: GH_REPO, workflow: GH_WORKFLOW });
  return {
    ok: true,
    dispatched: true,
    jobId,
    repo: GH_REPO,
    workflow: GH_WORKFLOW,
    ref: GH_REF,
    runsUrl,
    http_status: ghRes.status,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const missing = missingRequired();
    if (missing.length > 0) {
      return json({
        ok: false,
        traceId,
        code: "MISSING_SECRETS",
        message: `Missing required secrets: ${missing.join(", ")}. Configure them in Lovable Cloud → Functions → Secrets.`,
        secrets: requiredSecretsReport(!!GH_PAT_ENV),
      }, 500);
    }

    // Auth: admin UI token, or render-secret for backend-only maintenance actions.
    const peekedAction = String((await req.clone().json().catch(() => ({}))).action ?? "health");
    // self_heal is idempotent recovery only — allow internal cron callers
    // (pg_net from this project) without the shared secret.
    const isInternalSelfHeal = peekedAction === "self_heal";
    const serviceAuthorized = isInternalSelfHeal || actionAllowsServiceAuth(req, RENDER_WORKER_SECRET, peekedAction);
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!serviceAuthorized && !authHeader.startsWith("Bearer ")) {
      return json({ ok: false, traceId, message: "unauthenticated" }, 401);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let userId: string | null = null;
    if (!serviceAuthorized) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return json({ ok: false, traceId, message: "unauthenticated" }, 401);
      }
      userId = userData.user.id;
      const { data: roleRow } = await admin
        .from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, traceId, message: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "health");

    if (action === "health") {
      // Auto-mark stale on every health poll so UI never lies.
      let autoMarked = { marked: 0, ids: [] as string[] };
      try { autoMarked = await markStale(admin, traceId); } catch (e) {
        console.error(`[worker-stale] ${traceId} auto-mark failed`, e);
      }
      const snapshot = await buildHealthSnapshot(admin, traceId);
      const workerHealth = await fetchWorkerHealth(traceId);
      const ghPat = await getEffectiveGhPat(admin);
      console.log(`[worker-claim] ${traceId} lastClaimAt=${snapshot.lastClaimAt} live=${snapshot.workerLive}`);
      return json({
        ok: true,
        traceId,
        activeBackend: activeBackend(),
        secrets: requiredSecretsReport(!!ghPat.token),
        ghPat: { source: ghPat.source, present: !!ghPat.token, updatedAt: ghPat.updatedAt, masked: ghPat.token ? maskToken(ghPat.token) : null },
        snapshot,
        autoMarked,
        workerHealth,
      });
    }

    if (action === "mark_stale") {
      const result = await markStale(admin, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "retry_render") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const result = await retryRender(admin, jobId, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "retry_publish") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const result = await retryPublish(admin, jobId, traceId);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "cancel_render") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const { data: updated, error: updErr } = await admin
        .from("cinematic_ad_jobs")
        .update({
          status: "cancelled",
          status_message: "cancelled by admin",
          render_worker_id: null,
          render_heartbeat_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .select("id,status")
        .maybeSingle();
      if (updErr) return json({ ok: false, traceId, message: updErr.message }, 500);
      return json({ ok: true, traceId, job: updated });
    }

    if (action === "delete_job") {
      const jobId = String(body.job_id ?? "");
      if (!jobId) return json({ ok: false, traceId, message: "job_id required" }, 400);
      const { error: delErr } = await admin
        .from("cinematic_ad_jobs").delete().eq("id", jobId);
      if (delErr) return json({ ok: false, traceId, message: delErr.message }, 500);
      return json({ ok: true, traceId, deleted: jobId });
    }

    if (action === "self_heal") {
      // Aggressive self-healing pass intended for the 60s cron.
      // 1) status=rendering with heartbeat older than 90s → reset to render_queued.
      // 2) status=render_queued older than 2 minutes with no worker → re-dispatch GH Actions.
      const now = Date.now();
      const heartbeatCutoff = new Date(now - 90 * 1000).toISOString();
      const queuedCutoff = new Date(now - 2 * 60 * 1000).toISOString();

      // (1) recover stale rendering jobs
      const { data: stuck } = await admin
        .from("cinematic_ad_jobs")
        .select("id,render_attempts,render_heartbeat_at,render_started_at,render_worker_id,render_log")
        .eq("status", "rendering")
        .or(`render_heartbeat_at.lt.${heartbeatCutoff},and(render_heartbeat_at.is.null,render_started_at.lt.${heartbeatCutoff})`)
        .limit(50);
      const recovered: string[] = [];
      const nowIso = new Date(now).toISOString();
      for (const row of stuck ?? []) {
        const reason = row.render_heartbeat_at
          ? `stale heartbeat (last ${row.render_heartbeat_at})`
          : "zombie worker (no heartbeat)";
        const prevLog = Array.isArray(row.render_log) ? row.render_log : [];
        const newLog = [
          ...prevLog,
          {
            at: nowIso,
            event: "auto_recovered",
            reason,
            prev_worker_id: row.render_worker_id ?? null,
            prev_started_at: row.render_started_at ?? null,
            prev_heartbeat_at: row.render_heartbeat_at ?? null,
          },
        ];
        const { error: updErr } = await admin
          .from("cinematic_ad_jobs")
          .update({
            status: "render_queued",
            render_worker_id: null,
            render_started_at: null,
            render_heartbeat_at: null,
            render_attempts: (row.render_attempts ?? 0) + 1,
            render_queued_at: nowIso,
            status_message: `Auto-recovered: ${reason}`,
            render_log: newLog,
            updated_at: nowIso,
          })
          .eq("id", row.id)
          .eq("status", "rendering");
        if (!updErr) {
          recovered.push(row.id);
          console.warn(`[self-heal] ${traceId} recovered`, { jobId: row.id, reason });
        }
      }

      // (2) re-dispatch render_queued jobs older than 2min with no worker
      const { data: queuedStale } = await admin
        .from("cinematic_ad_jobs")
        .select("id,render_queued_at,render_worker_id,render_started_at")
        .eq("status", "render_queued")
        .is("render_worker_id", null)
        .is("render_started_at", null)
        .lt("render_queued_at", queuedCutoff)
        .order("render_queued_at", { ascending: true })
        .limit(10);
      const ghPat = (await getEffectiveGhPat(admin)).token;
      const redispatched: Array<{ jobId: string; ok: boolean; reason?: string }> = [];
      if (ghPat) {
        // Dispatch up to (MAX_RENDER_SLOTS - active) jobs in parallel so the
        // queue drains concurrently instead of one-at-a-time. Queue ordering
        // is preserved by the .order(render_queued_at ASC) above; we simply
        // take the head N candidates.
        const activeSlots = await countActiveRenderSlots(admin, null);
        const available = Math.max(0, MAX_RENDER_SLOTS - activeSlots);
        const toDispatch = (queuedStale ?? []).slice(0, available);
        const results = await Promise.all(toDispatch.map(async (row) => {
          try {
            const r = await triggerGithubWorkflow(admin, traceId, { job_id: row.id, ghPat });
            return { jobId: row.id, ok: !!r.dispatched, reason: r.dispatched ? undefined : r.message };
          } catch (e: any) {
            return { jobId: row.id, ok: false, reason: e?.message ?? String(e) };
          }
        }));
        redispatched.push(...results);
      }

      console.log(`[self-heal] ${traceId} done`, {
        recovered: recovered.length,
        redispatched: redispatched.filter((r) => r.ok).length,
        queue_candidates: queuedStale?.length ?? 0,
        gh_pat_present: !!ghPat,
        max_render_slots: MAX_RENDER_SLOTS,
      });
      return json({
        ok: true,
        traceId,
        recovered_count: recovered.length,
        recovered,
        redispatched_count: redispatched.filter((r) => r.ok).length,
        redispatched,
        gh_pat_present: !!ghPat,
      });
    }

    if (action === "auto_heal_stuck") {
      // Jobs are stuck if status='rendering' and heartbeat older than 10 minutes.
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: stuck } = await admin
        .from("cinematic_ad_jobs")
        .select("id,render_heartbeat_at,render_started_at")
        .eq("status", "rendering")
        .or(`render_heartbeat_at.lt.${cutoff},and(render_heartbeat_at.is.null,render_started_at.lt.${cutoff})`)
        .limit(50);
      const healed: string[] = [];
      const dispatched: Array<{ jobId: string; ok: boolean; reason?: string }> = [];
      const ghPat = (await getEffectiveGhPat(admin)).token;
      for (const row of stuck ?? []) {
        try {
          await retryRender(admin, row.id, traceId);
          healed.push(row.id);
          if (ghPat) {
            try {
              const r = await triggerGithubWorkflow(admin, traceId, { job_id: row.id, ghPat });
              dispatched.push({ jobId: row.id, ok: true });
            } catch (e: any) {
              dispatched.push({ jobId: row.id, ok: false, reason: e?.message ?? String(e) });
            }
          }
        } catch (e) {
          console.error(`[auto-heal] ${traceId} reset failed`, row.id, e);
        }
      }
      return json({ ok: true, traceId, healed_count: healed.length, healed, dispatched });
    }

    if (action === "render_all_queued") {
      const { data: queued } = await admin
        .from("cinematic_ad_jobs")
        .select("id")
        .eq("status", "render_queued")
        .order("render_queued_at", { ascending: true })
        .limit(25);
      const ghPat = (await getEffectiveGhPat(admin)).token;
      if (!ghPat) return json({ ok: false, traceId, code: "GH_SECRETS_MISSING", message: "GH_PAT not configured" }, 412);
      // Dispatch up to the available parallel slot count concurrently. Excess
      // jobs stay in render_queued and will be picked up by the next self_heal
      // pass when slots free.
      const activeSlots = await countActiveRenderSlots(admin, null);
      const available = Math.max(0, MAX_RENDER_SLOTS - activeSlots);
      const toDispatch = (queued ?? []).slice(0, available);
      const dispatched = await Promise.all(toDispatch.map(async (row) => {
        try {
          const r = await triggerGithubWorkflow(admin, traceId, { job_id: row.id, ghPat });
          return { jobId: row.id, ok: !!r.dispatched, reason: r.dispatched ? undefined : r.message };
        } catch (e: any) {
          return { jobId: row.id, ok: false, reason: e?.message ?? String(e) };
        }
      }));
      return json({
        ok: true,
        traceId,
        queued_count: queued?.length ?? 0,
        dispatched_count: dispatched.filter((d) => d.ok).length,
        dispatched,
        active_slots: activeSlots,
        max_render_slots: MAX_RENDER_SLOTS,
      });
    }

    if (action === "publish_all_completed") {
      // Find all rendered jobs that haven't been pinned to Pinterest yet.
      const { data: ready, error: readyErr } = await admin
        .from("cinematic_ad_jobs")
        .select("id")
        .in("status", ["render_complete", "awaiting_approval", "approved"])
        .not("output_mp4_url", "is", null)
        .is("pinterest_pin_url", null)
        .order("render_complete_at", { ascending: true })
        .limit(50);
      if (readyErr) return json({ ok: false, traceId, message: readyErr.message }, 500);
      const published: Array<{ jobId: string; ok: boolean; reason?: string }> = [];
      for (const row of ready ?? []) {
        try {
          await retryPublish(admin, row.id, traceId);
          published.push({ jobId: row.id, ok: true });
        } catch (e: any) {
          published.push({ jobId: row.id, ok: false, reason: e?.message ?? String(e) });
        }
      }
      const okCount = published.filter((p) => p.ok).length;
      return json({ ok: true, traceId, completed_count: ready?.length ?? 0, published_count: okCount, published });
    }

    if (action === "reset_stale") {
      const ids = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)) : undefined;
      const result = await resetStale(admin, traceId, ids);
      return json({ ok: true, traceId, ...result });
    }

    if (action === "clear_stale_duplicates") {
      const { data, error } = await admin.rpc("clear_stale_cinematic_duplicates");
      if (error) throw error;
      return json({ ok: true, traceId, ...(data ?? {}) });
    }

    if (action === "trigger_github_workflow") {
      try {
        const ghPat = (await getEffectiveGhPat(admin)).token;
        const result = await triggerGithubWorkflow(admin, traceId, {
          job_id: body.job_id ? String(body.job_id) : undefined,
          claim_next: Boolean(body.claim_next),
          ghPat,
        });
        return json({ ok: true, traceId, ...result });
      } catch (e: any) {
        if (e?.code === "GH_SECRETS_MISSING") {
          return json({
            ok: false, traceId,
            code: "GH_SECRETS_MISSING",
            message: e.message,
            validation: e.validation,
          }, 412);
        }
        if (e?.code === "GH_DISPATCH_HTTP_FAILED") {
          return json({
            ok: false, traceId,
            code: "GH_DISPATCH_HTTP_FAILED",
            message: e.message,
            http_status: e.http_status ?? null,
            error_body: e.error_body ?? null,
            job_id: e.job_id ?? null,
            repo: e.repo ?? null,
            workflow: e.workflow ?? null,
            ref: e.ref ?? null,
          }, 502);
        }
        throw e;
      }
    }

    if (action === "validate_github_secrets") {
      const ghPat = (await getEffectiveGhPat(admin)).token;
      const validation = await validateGithubSecrets(traceId, ghPat);
      return json({
        ok: validation.ok,
        traceId,
        secrets: requiredSecretsReport(!!ghPat),
        github: validation,
      });
    }

    if (action === "sync_github_secrets") {
      const ghPat = (await getEffectiveGhPat(admin)).token;
      const result = await syncGithubSecrets(traceId, ghPat);
      return json({ ok: result.ok, traceId, ...result }, result.ok ? 200 : 500);
    }

    if (action === "validate_github_pat") {
      const ghPat = (await getEffectiveGhPat(admin)).token;
      const repo = body.repo ? String(body.repo) : undefined;
      const validation = await validateGithubPat(traceId, ghPat, { repo });
      return json({ ok: validation.ok, traceId, pat: validation });
    }

    if (action === "update_github_pat") {
      const newToken = String(body.token ?? "");
      const retry = Boolean(body.retry_dispatch);
      if (!newToken) return json({ ok: false, traceId, message: "token required" }, 400);
      try {
          const validation = await updateGhPat(admin, traceId, newToken, userId ?? "service");
        let dispatched: any = null;
        if (retry && validation.ok) {
          try {
            dispatched = await triggerGithubWorkflow(admin, traceId, {
              claim_next: true,
              ghPat: newToken,
            });
          } catch (dispatchErr: any) {
            dispatched = { ok: false, error: dispatchErr?.message ?? String(dispatchErr) };
          }
        }
        return json({
          ok: true, traceId,
          masked: maskToken(newToken),
          source: "db",
          pat: validation,
          dispatched,
        });
      } catch (e: any) {
        return json({
          ok: false, traceId,
          code: e?.code ?? "GH_PAT_UPDATE_FAILED",
          message: e?.message ?? String(e),
          pat: e?.validation ?? null,
        }, 400);
      }
    }

    if (action === "debug_panel") {
      const { data: rows, error: rowsErr } = await admin
        .from("cinematic_ad_jobs")
        .select("id,status,render_queued_at,render_started_at,render_complete_at,render_worker_id,updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);
      const { data: allStatus, error: statErr } = await admin
        .from("cinematic_ad_jobs")
        .select("status");
      const { count: tableCount, error: tableErr } = await admin
        .from("cinematic_ad_jobs")
        .select("id", { count: "exact", head: true });
      const counts: Record<string, number> = {};
      for (const r of allStatus ?? []) {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      }
      const backend = activeBackend();
      return json({
        ok: true,
        traceId,
        ...backend,
        table: "cinematic_ad_jobs",
        table_exists: !tableErr,
        table_count: tableCount ?? 0,
        status_counts: counts,
        endpoint_urls: Object.fromEntries([...CANONICAL_FUNCTIONS, ...COMPAT_FUNCTIONS].map((name) => [name, `${backend.functions_base_url}/${name}`])),
        github_actions_expected: {
          secret_name: "SUPABASE_URL",
          expected_value: backend.supabase_url,
          workflow: GH_WORKFLOW,
          repo: GH_REPO || null,
        },
        latest_rows: rows ?? [],
        errors: { rowsErr: rowsErr?.message ?? null, statErr: statErr?.message ?? null, tableErr: tableErr?.message ?? null },
      });
    }

    return json({ ok: false, traceId, message: `unknown action: ${action}` }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker-health] ${traceId} crash`, msg);
    return json({ ok: false, traceId, message: msg }, 500);
  }
});