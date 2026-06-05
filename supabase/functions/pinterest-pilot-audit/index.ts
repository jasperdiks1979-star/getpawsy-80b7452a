// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Pilot Batch + Audit
// ─────────────────────────────────────────────────────────────────────────────
// Runs the upgraded creative-director engine on a small pilot of products
// (default 20), then produces an audit report covering:
//   • avg hook relevance (per draft, from meta.intelligence.hook_relevance)
//   • hook uniqueness (distinct headlines / total)
//   • duplicate score (1 - uniqueness)
//   • image uniqueness (distinct pin_image_phash / total)
//   • predicted CTR (heuristic blend of relevance + uniqueness)
// The audit is returned in the JSON response AND saved as a Storage object
// so it's reachable from the admin UI.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("method not allowed", 405);

  const traceId = crypto.randomUUID().slice(0, 8);
  let body: any = {};
  try { body = await req.json(); } catch { /* default */ }

  const sample = Math.max(1, Math.min(50, Number(body?.sample ?? 20)));
  const dryRun = !!body?.dryRun;
  const action = String(body?.action ?? "run");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ── status: list latest pilot audit reports from storage ────────────────
  if (action === "status") {
    const { data: list } = await supabase.storage
      .from("pinterest-ads")
      .list("pilot-audits", { limit: 10, sortBy: { column: "created_at", order: "desc" } });
    const latest = (list ?? [])[0];
    if (!latest) return ok({ traceId, report: null, message: "no audit reports yet" });
    const { data: file } = await supabase.storage
      .from("pinterest-ads")
      .download(`pilot-audits/${latest.name}`);
    const text = file ? await file.text() : null;
    return ok({ traceId, report: text ? JSON.parse(text) : null, file: latest.name });
  }

  // ── run: start the pilot in the background and return immediately ───────
  const startedAt = new Date().toISOString();

  // Persist an initial "running" marker so the admin UI can poll for status.
  const runningPath = `pilot-audits/RUNNING_${startedAt.replace(/[:.]/g, "-")}_${traceId}.json`;
  try {
    await supabase.storage.from("pinterest-ads").upload(
      runningPath,
      new Blob([JSON.stringify({ status: "running", started_at: startedAt, traceId, sample })], { type: "application/json" }),
      { contentType: "application/json", upsert: true },
    );
  } catch { /* non-fatal */ }

  // 1) pick a random sample of active products that have a description.
  const { data: pool, error: poolErr } = await supabase
    .from("products")
    .select("id, slug, name, category")
    .eq("is_active", true)
    .not("description", "is", null)
    .limit(400);
  if (poolErr) return fail(`pool select failed: ${poolErr.message}`, 500);
  if (!pool || pool.length === 0) return fail("no active products with descriptions found", 404);

  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, sample);

  // 2) run creative-director per product in the background.
  const work = (async () => {
    const perProduct: Array<{ slug: string; ok: boolean; error?: string; queueId?: string }> = [];
    for (const p of shuffled) {
    if (dryRun) { perProduct.push({ slug: p.slug, ok: true }); continue; }
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-creative-director", {
        body: { action: "run_full", productId: p.id, count: 1 },
      });
      if (error) throw new Error(error.message);
      const draft = (data as any)?.drafts?.[0];
      perProduct.push({ slug: p.slug, ok: !!draft, queueId: draft?.queueId });
    } catch (e) {
      perProduct.push({ slug: p.slug, ok: false, error: (e as Error).message });
    }
    }

  // 3) load the freshly created drafts and score them.
  const slugs = shuffled.map((p) => p.slug);
  const { data: drafts } = await supabase
    .from("pinterest_pin_queue")
    .select("id, product_slug, pin_title, pin_image_url, pin_image_phash, hook_group, meta, created_at, status")
    .in("product_slug", slugs)
    .gte("created_at", startedAt)
    .order("created_at", { ascending: false });

  const rows = (drafts ?? []) as Array<{
    id: string;
    product_slug: string;
    pin_title: string;
    pin_image_url: string;
    pin_image_phash: string | null;
    hook_group: string | null;
    meta: any;
    status: string;
  }>;

  const total = rows.length;
  const relevances = rows
    .map((r) => Number(r?.meta?.intelligence?.hook_relevance ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const hookSources = rows.map((r) => String(r?.meta?.intelligence?.hook_source ?? "unknown"));
  const aiHookCount = hookSources.filter((s) => s === "ai_product").length;
  const fallbackCount = hookSources.filter((s) => s === "fallback_bank").length;

  const headlines = rows.map((r) => (r.pin_title || "").toLowerCase().trim()).filter(Boolean);
  const uniqueHeadlines = new Set(headlines);
  const phashes = rows.map((r) => r.pin_image_phash || "").filter(Boolean);
  const uniquePhashes = new Set(phashes);

  const avgRelevance = relevances.length
    ? Math.round((relevances.reduce((a, b) => a + b, 0) / relevances.length) * 10) / 10
    : 0;
  const hookUniqueness = headlines.length ? uniqueHeadlines.size / headlines.length : 0;
  const imageUniqueness = phashes.length ? uniquePhashes.size / phashes.length : 0;
  const duplicateScore = headlines.length ? 1 - hookUniqueness : 0;

  // Predicted CTR — simple blended heuristic for the pilot gate:
  //   relevance contributes 70%, hook uniqueness 20%, image uniqueness 10%.
  //   Normalized so 100/1/1 → ~3.0% predicted CTR (baseline Pinterest US).
  const predictedCtrPct =
    Math.round(
      ((avgRelevance / 100) * 0.7 + hookUniqueness * 0.2 + imageUniqueness * 0.1) * 3.0 * 100,
    ) / 100;

  const pass =
    avgRelevance >= 90 &&
    hookUniqueness >= 0.85 &&
    imageUniqueness >= 0.9 &&
    aiHookCount / Math.max(total, 1) >= 0.9;

  const report = {
    traceId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: "complete",
    sample_requested: sample,
    products_run: shuffled.length,
    drafts_created: total,
    ai_hook_drafts: aiHookCount,
    fallback_bank_drafts: fallbackCount,
    avg_relevance: avgRelevance,
    hook_uniqueness: Math.round(hookUniqueness * 1000) / 1000,
    duplicate_score: Math.round(duplicateScore * 1000) / 1000,
    image_uniqueness: Math.round(imageUniqueness * 1000) / 1000,
    predicted_ctr_pct: predictedCtrPct,
    pass,
    threshold: {
      avg_relevance: 90,
      hook_uniqueness: 0.85,
      image_uniqueness: 0.9,
      ai_hook_share: 0.9,
    },
    per_product: perProduct,
    drafts: rows.map((r) => ({
      id: r.id,
      slug: r.product_slug,
      headline: r.pin_title,
      hook_source: r?.meta?.intelligence?.hook_source ?? null,
      hook_relevance: r?.meta?.intelligence?.hook_relevance ?? null,
      phash: r.pin_image_phash,
    })),
  };

    try {
      const path = `pilot-audits/${startedAt.replace(/[:.]/g, "-")}_${traceId}.json`;
      await supabase.storage.from("pinterest-ads").upload(
        path,
        new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
        { contentType: "application/json", upsert: true },
      );
      await supabase.storage.from("pinterest-ads").remove([runningPath]);
    } catch (e) {
      console.warn("[pilot-audit] storage upload failed", (e as Error).message);
    }
  })();

  // Keep the runtime alive for the background job after we respond.
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch((e) => console.warn("[pilot-audit] background error", (e as Error).message));
  }

  return ok({
    traceId,
    status: "running",
    sample,
    started_at: startedAt,
    message: "Pilot batch started. Poll with { action: 'status' }.",
  });
});