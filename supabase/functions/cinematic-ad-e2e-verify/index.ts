/**
 * cinematic-ad-e2e-verify
 *
 * Admin-only one-click verification: runs prepare → preflight → queue →
 * dispatch (self_heal) → polls until output_mp4_url → returns publish
 * readiness with every timestamp + job id.
 *
 * Uses the caller's admin JWT for all downstream admin-gated calls; only
 * the polling client uses the service role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const trace = () =>
  `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Step = {
  name: string;
  status: "ok" | "fail" | "timeout" | "skip";
  started_at: string;
  finished_at: string;
  ms: number;
  detail?: unknown;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  const t0 = Date.now();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { ok: false, traceId, message: "unauthenticated" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: u, error: userErr } = await userClient.auth.getUser();
  if (userErr || !u?.user) return json(401, { ok: false, traceId, message: "unauthenticated" });
  const { data: role } = await admin
    .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return json(403, { ok: false, traceId, message: "admin required" });

  // Feature-flag gate
  const { data: flag } = await admin
    .from("app_config").select("value").eq("key", "e2e_route_enabled").maybeSingle();
  if (flag?.value !== true) {
    return json(410, { ok: false, traceId, message: "e2e route disabled" });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const product_slug: string = String(
    body.product_slug ?? "automatic-cat-litter-box-self-cleaning-app-control"
  ).trim();
  const hook_variant: string = body.hook_variant ?? "problem_solution";

  const fnBase = `${SUPABASE_URL}/functions/v1`;
  const adminHeaders = {
    "Content-Type": "application/json",
    Authorization: authHeader,
    apikey: ANON_KEY,
  };

  const steps: Step[] = [];
  async function step<T>(name: string, fn: () => Promise<{ ok: boolean; detail: T }>): Promise<T | null> {
    const s0 = Date.now();
    const started_at = new Date(s0).toISOString();
    try {
      const r = await fn();
      const f0 = Date.now();
      steps.push({
        name, status: r.ok ? "ok" : "fail",
        started_at, finished_at: new Date(f0).toISOString(), ms: f0 - s0,
        detail: r.detail,
      });
      return r.ok ? r.detail : null;
    } catch (e) {
      const f0 = Date.now();
      steps.push({
        name, status: "fail",
        started_at, finished_at: new Date(f0).toISOString(), ms: f0 - s0,
        detail: { error: e instanceof Error ? e.message : String(e) },
      });
      return null;
    }
  }

  // 1) prepare
  const prepared = await step<any>("prepare", async () => {
    const r = await fetch(`${fnBase}/cinematic-ad-prepare`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ product_slug, hook_variant, variant_count: 1, force_new: true }),
    });
    const j = await r.json().catch(() => ({}));
    const jid = j?.job?.id ?? j?.job_id ?? null;
    return {
      ok: r.ok && !!jid,
      detail: {
        status: r.status,
        job_id: jid,
        message: j?.message,
        error_code: j?.error_code ?? null,
        step: j?.step ?? null,
        existing_job_id: j?.existing_job_id ?? null,
        existing_status: j?.existing_status ?? null,
        traceId: j?.traceId ?? null,
        body: j,
      },
    };
  });
  const job_id: string | null = prepared?.job_id ?? null;
  if (!job_id) {
    return json(200, { ok: false, traceId, product_slug, steps, total_ms: Date.now() - t0, message: "prepare failed" });
  }

  // 2) preflight
  const pre = await step<any>("preflight", async () => {
    const r = await fetch(`${fnBase}/cinematic-ad-preflight`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ job_id }),
    });
    const j = await r.json().catch(() => ({}));
    const row = Array.isArray(j?.results) ? j.results[0] : j;
    return { ok: r.ok, detail: { status: r.status, preflight_status: row?.preflight_status, reasons: row?.preflight_reasons, raw: j } };
  });
  const preflight_status = pre?.preflight_status ?? null;

  if (preflight_status !== "pass") {
    return json(200, {
      ok: false, traceId, product_slug, job_id,
      preflight_status, steps, total_ms: Date.now() - t0,
      message: "preflight did not pass — fix the product or retry with a different one",
    });
  }

  // 3) queue
  await step("queue", async () => {
    const r = await fetch(`${fnBase}/cinematic-ad-queue-render`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ job_id }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, detail: { status: r.status, raw: j } };
  });

  // 4) dispatch — per-job trigger so we capture GitHub HTTP status + error body.
  await step("dispatch", async () => {
    const r = await fetch(`${fnBase}/cinematic-ad-worker-control`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ action: "trigger_github_workflow", job_id }),
    });
    const j: any = await r.json().catch(() => ({}));
    // GitHub-side HTTP details are surfaced on the body for forensic display.
    return {
      ok: r.ok && j?.ok !== false,
      detail: {
        status: r.status,
        dispatched: j?.dispatched ?? null,
        gh_http_status: j?.http_status ?? null,
        gh_error_body: j?.error_body ?? null,
        gh_error_code: j?.code ?? null,
        gh_error_message: j?.message ?? null,
        repo: j?.repo ?? null,
        workflow: j?.workflow ?? null,
        ref: j?.ref ?? null,
        runs_url: j?.runsUrl ?? null,
        job_id,
        raw: j,
      },
    };
  });

  // 5) poll for claim (render_started_at)
  const claimDeadline = Date.now() + 120_000; // 2 min
  let render_started_at: string | null = null;
  let render_worker_id: string | null = null;
  {
    const s0 = Date.now();
    const started_at = new Date(s0).toISOString();
    while (Date.now() < claimDeadline) {
      const { data: row } = await admin
        .from("cinematic_ad_jobs")
        .select("render_started_at, render_worker_id, status")
        .eq("id", job_id).maybeSingle();
      if (row?.render_started_at) {
        render_started_at = row.render_started_at;
        render_worker_id = row.render_worker_id;
        break;
      }
      await sleep(5000);
    }
    const f0 = Date.now();
    steps.push({
      name: "claim",
      status: render_started_at ? "ok" : "timeout",
      started_at, finished_at: new Date(f0).toISOString(), ms: f0 - s0,
      detail: { render_started_at, render_worker_id },
    });
  }

  // 6) poll for output_mp4_url
  let output_mp4_url: string | null = null;
  let render_completed_at: string | null = null;
  let render_log_tail: unknown = null;
  {
    const s0 = Date.now();
    const started_at = new Date(s0).toISOString();
    const renderDeadline = Date.now() + 7 * 60_000;
    while (Date.now() < renderDeadline) {
      const { data: row } = await admin
        .from("cinematic_ad_jobs")
        .select("output_mp4_url, render_complete_at, status, render_log")
        .eq("id", job_id).maybeSingle();
      if (row?.output_mp4_url) {
        output_mp4_url = row.output_mp4_url;
        render_completed_at = row.render_complete_at;
        render_log_tail = Array.isArray(row.render_log) ? row.render_log.slice(-5) : null;
        break;
      }
      if (row?.status === "render_failed") {
        render_log_tail = Array.isArray(row.render_log) ? row.render_log.slice(-5) : null;
        break;
      }
      await sleep(10_000);
    }
    const f0 = Date.now();
    steps.push({
      name: "render",
      status: output_mp4_url ? "ok" : "timeout",
      started_at, finished_at: new Date(f0).toISOString(), ms: f0 - s0,
      detail: { output_mp4_url, render_completed_at, render_log_tail },
    });
  }

  // 7) preview HEAD
  let preview_ok = false;
  if (output_mp4_url) {
    await step("preview", async () => {
      const r = await fetch(output_mp4_url!, { method: "HEAD" });
      const ct = r.headers.get("content-type") ?? "";
      preview_ok = r.ok && ct.startsWith("video/");
      return { ok: preview_ok, detail: { status: r.status, content_type: ct } };
    });
  }

  // 8) publish readiness
  let publish_enabled = false;
  const publish_blockers: string[] = [];
  {
    const { data: row } = await admin
      .from("cinematic_ad_jobs")
      .select("preflight_status, output_mp4_url, pin_title, pin_description, pin_destination_url, status")
      .eq("id", job_id).maybeSingle();
    if (row?.preflight_status !== "pass") publish_blockers.push("preflight_not_pass");
    if (!row?.output_mp4_url) publish_blockers.push("no_output_mp4_url");
    if (!row?.pin_title) publish_blockers.push("missing_pin_title");
    if (!row?.pin_description) publish_blockers.push("missing_pin_description");
    if (!row?.pin_destination_url) publish_blockers.push("missing_pin_destination_url");
    publish_enabled = publish_blockers.length === 0;
    steps.push({
      name: "publish_ready",
      status: publish_enabled ? "ok" : "fail",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      ms: 0,
      detail: { publish_enabled, blockers: publish_blockers, row },
    });
  }

  return json(200, {
    ok: !!output_mp4_url && publish_enabled,
    traceId,
    product_slug,
    job_id,
    preflight_status,
    render_started_at,
    render_completed_at,
    output_mp4_url,
    preview_url: `/admin/pinterest-ad-studio?focus=${job_id}`,
    publish_enabled,
    publish_blockers,
    steps,
    total_ms: Date.now() - t0,
  });
});