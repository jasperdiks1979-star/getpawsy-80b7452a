/**
 * agp-wave2-media-pipeline
 *
 * Wave 2 orchestrator: drives the existing CJ media stack end-to-end across
 * the active catalog and records a single AGP run row with per-step counters.
 *
 * Steps (in order):
 *  1. cj-media-orchestrator       — rehost images + drain video ingest + derivatives
 *  2. cj-rehost-existing-videos   — second pass for any straggler videos
 *  3. media-integrity-scan        — verify hosted assets resolve
 *  4. snapshot catalog / asset coverage into agp_run_steps
 *
 * Body: { dry_run?: boolean, mode?: 'delta'|'full', batchSize?: number, maxBatches?: number, trigger?: string }
 * All work is delegated — no AI calls, no new tables.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function isAuthed(req: Request) {
  const secret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (!secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  return req.headers.get("x-internal-secret") === secret || auth.includes(secret);
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
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isAuthed(req) && !req.headers.get("authorization")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "content-type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({} as any));
  const dry = body?.dry_run ?? false;
  const mode = (body?.mode ?? "delta") as "delta" | "full";
  const batchSize = Math.min(Math.max(Number(body?.batchSize ?? 25), 5), 50);
  const maxBatches = Math.min(Math.max(Number(body?.maxBatches ?? (mode === "full" ? 20 : 4)), 1), 40);

  const sb = admin();

  // Respect kill switch
  const { data: settings } = await sb.from("agp_settings").select("kill_switch").eq("id", 1).maybeSingle();
  if (settings?.kill_switch) {
    return new Response(JSON.stringify({ ok: true, skipped: "kill_switch" }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const { data: run, error: runErr } = await sb.from("agp_runs").insert({
    engine: "wave2_media_pipeline",
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
  async function logStep(step_key: string, severity: string, message: string, details: any) {
    stepLogs.push({ run_id: runId, engine: "cj_media", step_key, severity, status: "info", message, details });
  }

  const counters: Record<string, number> = {
    images_rehosted: 0,
    videos_rehosted: 0,
    derivatives_processed: 0,
    integrity_checked: 0,
    failures: 0,
    products_scanned: 0,
    products_processed: 0,
  };

  try {
    if (dry) {
      // Inventory snapshot only
      const [{ count: assets }, { count: derivPending }, { count: vidsPending }, { count: products }] = await Promise.all([
        sb.from("cj_media_asset_registry").select("id", { count: "exact", head: true }),
        sb.from("cj_media_derivative_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        sb.from("pinterest_video_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      await logStep("dry_run_snapshot", "info", "Wave 2 dry-run snapshot", {
        registered_assets: assets ?? 0,
        derivative_pending: derivPending ?? 0,
        video_pending: vidsPending ?? 0,
        active_products: products ?? 0,
      });
    } else {
      // 1) Run the existing orchestrator (handles rehost + video ingest + derivatives + integrity)
      const orch = await invoke("cj-media-orchestrator", { mode, batchSize, maxBatches });
      counters.products_scanned += Number(orch.json?.products_scanned ?? 0);
      counters.products_processed += Number(orch.json?.products_processed ?? 0);
      counters.images_rehosted += Number(orch.json?.images_rehosted ?? 0);
      counters.videos_rehosted += Number(orch.json?.videos_rehosted ?? 0);
      counters.derivatives_processed += Number(orch.json?.derivatives_enqueued ?? 0);
      if (!orch.ok) counters.failures += 1;
      await logStep("cj_media_orchestrator", orch.ok ? "info" : "error",
        `orchestrator ${orch.ok ? "ok" : "failed"} (${orch.ms}ms)`,
        { status: orch.status, json: orch.json });

      // 2) Second pass: rehost any straggler product videos still on supplier domains
      const vids = await invoke("cj-rehost-existing-videos", { limit: 25 });
      counters.videos_rehosted += Number(vids.json?.rehosted ?? vids.json?.processed ?? 0);
      if (!vids.ok) counters.failures += 1;
      await logStep("cj_rehost_existing_videos", vids.ok ? "info" : "warn",
        `video rehost pass (${vids.ms}ms)`, { status: vids.status, json: vids.json });

      // 3) Integrity sweep
      const scan = await invoke("media-integrity-scan", { limit: 100 });
      counters.integrity_checked += Number(scan.json?.scanned ?? scan.json?.checked ?? 0);
      if (!scan.ok) counters.failures += 1;
      await logStep("media_integrity_scan", scan.ok ? "info" : "warn",
        `integrity scan (${scan.ms}ms)`, { status: scan.status, json: scan.json });
    }

    // 4) Always: post-run coverage snapshot
    const [{ count: assetsAfter }, { count: derivPendingAfter }, { count: activeProducts }] = await Promise.all([
      sb.from("cj_media_asset_registry").select("id", { count: "exact", head: true }),
      sb.from("cj_media_derivative_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sb.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    counters.assets_registered_total = assetsAfter ?? 0;
    counters.derivatives_pending_after = derivPendingAfter ?? 0;
    counters.active_products = activeProducts ?? 0;

    await logStep("post_run_snapshot", "info", "post-run coverage snapshot", {
      registered_assets: assetsAfter ?? 0,
      derivatives_pending: derivPendingAfter ?? 0,
      active_products: activeProducts ?? 0,
    });

    if (stepLogs.length) await sb.from("agp_run_steps").insert(stepLogs);

    await sb.from("agp_runs").update({
      status: counters.failures > 0 ? "succeeded_with_warnings" : "succeeded",
      counts: counters,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, dry_run: dry, mode, counts: counters }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    if (stepLogs.length) await sb.from("agp_run_steps").insert(stepLogs);
    await sb.from("agp_runs").update({
      status: "failed",
      error: (e as Error).message,
      counts: counters,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, run_id: runId, error: (e as Error).message }), {
      status: 500, headers: { ...cors, "content-type": "application/json" },
    });
  }
});