import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { loadCpeSettings, enqueueJob, isInternalAuthed } from "../_shared/cpe-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const dry = body?.dry_run === true;

  // Auth: admin via JWT OR service-to-service via INTERNAL_FUNCTION_SECRET
  if (!isInternalAuthed(req)) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp({ error: "unauthorized" }, 401);
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return jsonResp({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return jsonResp({ error: "forbidden" }, 403);
  }

  const settings = await loadCpeSettings(sb);
  const { data: run } = await sb
    .from("cpe_pipeline_runs")
    .insert({ trigger: body?.trigger ?? "manual", dry_run: dry, phases_run: [], counts: {} })
    .select("id")
    .single();
  const runId = run!.id as string;

  const phases: string[] = [];
  const counts: Record<string, number> = {};

  // Phase 1: CJ delta — enqueue rehash jobs for assets not checked in 7d
  if (settings.auto_enhance || dry) {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: stale } = await sb
      .from("cj_media_asset_registry")
      .select("id,product_id,public_url,media_type")
      .or(`last_delta_check_at.is.null,last_delta_check_at.lt.${since}`)
      .eq("media_type", "image")
      .limit(50);
    counts.delta_candidates = stale?.length ?? 0;
    if (!dry) {
      for (const a of stale ?? []) {
        await enqueueJob(sb, "delta_check", { asset_id: a.id, product_id: a.product_id, url: a.public_url }, ["asset_id"]);
      }
    }
    phases.push("delta");
  }

  // Phase 2: enqueue enhance jobs for products with no enhanced image yet
  if (settings.auto_enhance || dry) {
    const { data: prods } = await sb
      .from("products")
      .select("id,image_url")
      .eq("is_active", true)
      .not("image_url", "is", null)
      .limit(30);
    let enq = 0;
    for (const p of prods ?? []) {
      const { data: existing } = await sb
        .from("cpe_enhanced_images")
        .select("id")
        .eq("product_id", p.id)
        .in("status", ["succeeded", "pending"])
        .maybeSingle();
      if (existing) continue;
      if (!dry) await enqueueJob(sb, "enhance", { product_id: p.id, source_url: p.image_url }, ["product_id"]);
      enq++;
    }
    counts.enhance_enqueued = enq;
    phases.push("enhance");
  }

  // Phase 3: lifestyle (gated)
  if (settings.auto_lifestyle) {
    const { data: top } = await sb
      .from("products")
      .select("id,revenue_priority_score_v2")
      .eq("is_active", true)
      .gte("revenue_priority_score_v2", 70)
      .order("revenue_priority_score_v2", { ascending: false })
      .limit(15);
    if (!dry) for (const p of top ?? []) {
      await enqueueJob(sb, "lifestyle", { product_id: p.id }, ["product_id"]);
    }
    counts.lifestyle_enqueued = top?.length ?? 0;
    phases.push("lifestyle");
  }

  // Phase 4: copy + QA + learner enqueue tail markers
  if (!dry) {
    await enqueueJob(sb, "qa_sweep", { run_id: runId }, ["run_id"]);
    await enqueueJob(sb, "learner", { run_id: runId }, ["run_id"]);
  }
  phases.push("qa", "learner");

  await sb
    .from("cpe_pipeline_runs")
    .update({ status: "succeeded", finished_at: new Date().toISOString(), phases_run: phases, counts })
    .eq("id", runId);

  return jsonResp({ ok: true, run_id: runId, dry_run: dry, phases, counts });
});