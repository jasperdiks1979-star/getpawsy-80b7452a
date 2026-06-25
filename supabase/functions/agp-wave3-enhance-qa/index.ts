/**
 * agp-wave3-enhance-qa
 *
 * Wave 3 orchestrator: Enhancement + QA loop.
 *
 * Steps:
 *  1. Snapshot enhance + QA backlog (always).
 *  2. If !dry_run: enqueue 'enhance' jobs for products missing an enhanced image
 *     (capped by maxEnqueue) into cpe_creative_jobs.
 *  3. Drive cpe-image-enhancer in slices of `batch` until limit or budget hit.
 *  4. Drive cpe-qa-engine to grade pending creative_assets.
 *  5. Post-run snapshot.
 *
 * Hard caps: maxEnhance default 6, max 20. Budget cap respected by enhancer
 * itself; this orchestrator also exits early if AGP daily_budget_usd reached.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";

function admin() { return createClient(SUPABASE_URL, SERVICE_KEY); }

function isAuthed(req: Request) {
  if (!SECRET) return true;
  const auth = req.headers.get("authorization") ?? "";
  return req.headers.get("x-internal-secret") === SECRET || auth.includes(SECRET);
}

async function invoke(name: string, body: unknown) {
  const started = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
        "x-internal-secret": SECRET,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await r.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { ok: r.ok, status: r.status, json, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, json: { error: (e as Error).message }, ms: Date.now() - started };
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isAuthed(req) && !req.headers.get("authorization")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({} as any));
  const dry = body?.dry_run ?? true;
  const maxEnhance = Math.min(Math.max(Number(body?.maxEnhance ?? 6), 1), 20);
  const maxEnqueue = Math.min(Math.max(Number(body?.maxEnqueue ?? maxEnhance), 1), 50);
  const qaLimit = Math.min(Math.max(Number(body?.qaLimit ?? 100), 10), 500);

  const sb = admin();

  // Kill switch
  const { data: settings } = await sb.from("agp_settings").select("kill_switch,daily_budget_usd").eq("id", 1).maybeSingle();
  if (settings?.kill_switch) {
    return new Response(JSON.stringify({ ok: true, skipped: "kill_switch" }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data: run, error: runErr } = await sb.from("agp_runs").insert({
    engine: "wave3_enhance_qa",
    trigger: body?.trigger ?? "manual",
    dry_run: dry,
    status: "running",
  }).select("id").single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message ?? "run insert failed" }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
  const runId = run.id as string;

  const stepLogs: any[] = [];
  function log(step_key: string, severity: string, message: string, details: any) {
    stepLogs.push({ run_id: runId, engine: "cpe", step_key, severity, status: "info", message, details });
  }

  const counters: Record<string, number> = {
    enqueued: 0, enhanced: 0, enhance_succeeded: 0, qa_evaluated: 0,
    qa_passed: 0, qa_failed: 0, spent_usd: 0, failures: 0,
  };

  try {
    // Snapshot (always)
    const [enhPending, qaPending, enhTotal, products] = await Promise.all([
      sb.from("cpe_creative_jobs").select("id", { count: "exact", head: true }).eq("kind", "enhance").eq("status", "pending"),
      sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("qa_status", "pending"),
      sb.from("cpe_enhanced_images").select("id", { count: "exact", head: true }).eq("status", "succeeded"),
      sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    log("pre_snapshot", "info", "Wave 3 pre-run snapshot", {
      enhance_jobs_pending: enhPending.count ?? 0,
      qa_pending: qaPending.count ?? 0,
      enhanced_images_total: enhTotal.count ?? 0,
      active_products: products.count ?? 0,
      daily_budget_usd: settings?.daily_budget_usd ?? null,
    });

    if (!dry) {
      // 1) Enqueue enhance jobs for products with no enhanced image yet
      const { data: candidates } = await sb
        .from("products")
        .select("id,featured_image,image_url")
        .eq("is_active", true)
        .limit(maxEnqueue * 4);
      const { data: already } = await sb
        .from("cpe_enhanced_images")
        .select("product_id")
        .eq("status", "succeeded");
      const have = new Set((already ?? []).map((r: any) => r.product_id));
      const toEnqueue = (candidates ?? [])
        .filter((p: any) => !have.has(p.id) && (p.featured_image || p.image_url))
        .slice(0, maxEnqueue);

      for (const p of toEnqueue) {
        const payload = { product_id: p.id, source_url: p.featured_image ?? p.image_url };
        const dedupe_key = await sha256Hex(`enhance::${JSON.stringify(payload)}`);
        const { data: ins } = await sb.from("cpe_creative_jobs")
          .upsert({ kind: "enhance", payload, dedupe_key, status: "pending" },
            { onConflict: "kind,dedupe_key", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (ins?.id) counters.enqueued += 1;
      }
      log("enqueue", "info", `enqueued ${counters.enqueued} enhance jobs`, { requested: toEnqueue.length });

      // 2) Drive enhancer in slices (cap 10 per invoke per the function)
      let remaining = maxEnhance;
      while (remaining > 0) {
        const slice = Math.min(remaining, 3);
        const r = await invoke("cpe-image-enhancer", { limit: slice });
        const processed = Number(r.json?.processed ?? 0);
        counters.enhanced += processed;
        counters.enhance_succeeded += Number(r.json?.succeeded ?? 0);
        counters.spent_usd += Number(r.json?.spent_usd ?? 0);
        if (!r.ok) { counters.failures += 1; log("enhance_slice", "error", `enhancer ${r.status}`, r.json); break; }
        log("enhance_slice", "info", `enhancer slice ok (${r.ms}ms)`, r.json);
        if (processed === 0) break;
        remaining -= processed;
        if (settings?.daily_budget_usd && counters.spent_usd >= Number(settings.daily_budget_usd)) {
          log("budget_stop", "warn", "daily budget reached, halting enhancer", { spent_usd: counters.spent_usd });
          break;
        }
      }

      // 3) QA pass over pending creative_assets
      const qa = await invoke("cpe-qa-engine", { limit: qaLimit });
      counters.qa_evaluated = Number(qa.json?.evaluated ?? 0);
      counters.qa_passed = Number(qa.json?.passed ?? 0);
      counters.qa_failed = Number(qa.json?.failed ?? 0);
      if (!qa.ok) counters.failures += 1;
      log("qa", qa.ok ? "info" : "error", `qa pass (${qa.ms}ms)`, qa.json);
    }

    // Post snapshot
    const [enhPostTotal, qaPostPending] = await Promise.all([
      sb.from("cpe_enhanced_images").select("id", { count: "exact", head: true }).eq("status", "succeeded"),
      sb.from("creative_assets").select("id", { count: "exact", head: true }).eq("qa_status", "pending"),
    ]);
    counters.enhanced_images_after = enhPostTotal.count ?? 0;
    counters.qa_pending_after = qaPostPending.count ?? 0;
    log("post_snapshot", "info", "post-run snapshot", counters);

    if (stepLogs.length) await sb.from("agp_run_steps").insert(stepLogs);
    await sb.from("agp_runs").update({
      status: counters.failures > 0 ? "succeeded_with_warnings" : "succeeded",
      counts: counters,
      ai_cost_usd: counters.spent_usd,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, dry_run: dry, counts: counters }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    if (stepLogs.length) await sb.from("agp_run_steps").insert(stepLogs);
    await sb.from("agp_runs").update({
      status: "failed", error: (e as Error).message, counts: counters,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, run_id: runId, error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});