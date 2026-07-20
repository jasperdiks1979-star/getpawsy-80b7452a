/**
 * render-worker-selftest
 *
 * Server-side self-test that proves the Lovable-Cloud copy of
 * RENDER_WORKER_SECRET is in sync with what the edge functions expect.
 *
 * It executes the two real auth-gated endpoints the external Render.com
 * worker hits every cycle:
 *   1. render-worker-heartbeat
 *   2. cinematic-ad-claim-job
 *
 * Both calls use `x-render-secret: ${RENDER_WORKER_SECRET}` read from the
 * SAME Lovable Cloud env the target functions read. So:
 *   - 401 anywhere   = the cloud-side secret is empty / mismatched
 *   - 200 heartbeat  = cloud-side secret authenticates against itself
 *   - 403 claim-job  = secret OK (the 403 comes from the non-gh worker
 *                      gate after auth passes; expected for selftest probe)
 *
 * Response also returns a sha256 fingerprint (first 12 hex chars + length)
 * of the cloud-side RENDER_WORKER_SECRET so it can be compared to the
 * Render.com worker's startup log fingerprint without ever exposing the
 * raw value.
 */
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const RENDER_WORKER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fingerprint(secret: string) {
  if (!secret) {
    return { length: 0, sha256_prefix: null as string | null, has_leading_ws: false, has_trailing_ws: false, has_quotes: false };
  }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return {
    length: secret.length,
    sha256_prefix: hex.slice(0, 12),
    has_leading_ws: /^\s/.test(secret),
    has_trailing_ws: /\s$/.test(secret),
    has_quotes: /^["'].*["']$/.test(secret),
  };
}

type Step = {
  name: string;
  function: string;
  env_var: string;
  url: string;
  http_status: number;
  ok: boolean;
  expected: string;
  message: string;
  traceId?: string | null;
  body: unknown;
  duration_ms: number;
};

async function callTarget(fn: string, body: Record<string, unknown>): Promise<Step> {
  const url = `${SUPABASE_URL}/functions/v1/${fn}`;
  const started = Date.now();
  let httpStatus = 0;
  let payload: unknown = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // anon key satisfies the platform router; the real auth is x-render-secret
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "x-render-secret": RENDER_WORKER_SECRET,
      },
      body: JSON.stringify(body),
    });
    httpStatus = res.status;
    const text = await res.text();
    try { payload = JSON.parse(text); } catch { payload = text; }
  } catch (e) {
    payload = { error: e instanceof Error ? e.message : String(e) };
  }
  const duration = Date.now() - started;

  // Per-step interpretation
  let expected = "";
  let ok = false;
  let name = "";
  if (fn === "render-worker-heartbeat") {
    name = "Heartbeat";
    expected = "200 (secret matches → row written)";
    ok = httpStatus === 200;
  } else if (fn === "cinematic-ad-claim-job") {
    name = "Claim job (auth + gate)";
    // We DELIBERATELY send a non-allowlisted worker_id so the function
    // proves two things without stealing a real queued job:
    //   1. secret auth passes (otherwise we'd get 401)
    //   2. the post-auth GH_WORKER_PREFIXES gate is wired up (returns 403
    //      with reason=non_gh_worker_blocked)
    // Real Render workers use render-worker-* IDs which pass this gate.
    expected = "403 non_gh_worker_blocked (auth OK + allowlist gate active; real render-worker-* IDs pass)";
    ok = httpStatus === 403 && (payload as any)?.reason === "non_gh_worker_blocked";
  } else {
    name = fn;
    expected = "200";
    ok = httpStatus === 200;
  }

  return {
    name,
    function: fn,
    env_var: "RENDER_WORKER_SECRET",
    url,
    http_status: httpStatus,
    ok,
    expected,
    message:
      httpStatus === 401
        ? "401 unauthorized — cloud-side RENDER_WORKER_SECRET does not match what this function reads from env"
        : (payload as any)?.message ?? (payload as any)?.reason ?? (ok ? "ok" : "failed"),
    traceId: (payload as any)?.traceId ?? null,
    body: payload,
    duration_ms: duration,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  if (!SUPABASE_URL || !ANON_KEY) {
    return json(500, { ok: false, traceId, message: "SUPABASE_URL or anon key missing in cloud env" });
  }

  const secretFp = await fingerprint(RENDER_WORKER_SECRET);
  // Intentionally NOT a render-worker-* / gh-actions-* prefix: we want the
  // claim-job allowlist gate to reject this probe (403 non_gh_worker_blocked)
  // so we don't steal a real queued render job.
  const probeWorkerId = "selftest-probe-" + traceId;

  const heartbeat = await callTarget("render-worker-heartbeat", {
    worker_id: probeWorkerId,
    claimed: false,
    queue_depth: 0,
    supabase_host: "selftest",
    safe_mode: true,
  });

  const claim = await callTarget("cinematic-ad-claim-job", {
    worker_id: probeWorkerId, // render-worker-* prefix → passes allowlist
  });

  const steps: Step[] = [heartbeat, claim];
  const overall_ok = steps.every((s) => s.ok) && RENDER_WORKER_SECRET.length > 0;

  return json(200, {
    ok: overall_ok,
    traceId,
    cloud_secret: {
      env_var: "RENDER_WORKER_SECRET",
      configured: RENDER_WORKER_SECRET.length > 0,
      fingerprint: secretFp,
      compare_to: "Render.com worker startup log: 'secret fingerprint {length, sha256_prefix, ...}'",
    },
    steps,
    summary: overall_ok
      ? "Cloud-side secret authenticates against both render functions."
      : RENDER_WORKER_SECRET.length === 0
        ? "RENDER_WORKER_SECRET is empty in Lovable Cloud."
        : "At least one step failed — see per-step status below.",
  });
});