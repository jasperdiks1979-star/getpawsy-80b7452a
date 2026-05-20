import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EWMA_ALPHA = 0.25;

type StratKey = { dimension: string; key: string };

function dimsForDecision(payload: Record<string, any>): StratKey[] {
  const out: StratKey[] = [];
  if (payload?.recommended_angle) out.push({ dimension: "angle", key: String(payload.recommended_angle) });
  if (payload?.bucket) out.push({ dimension: "bucket", key: String(payload.bucket) });
  if (payload?.category) out.push({ dimension: "category", key: String(payload.category) });
  if (payload?.recommended_hook) {
    const h = String(payload.recommended_hook).toLowerCase().split(/\s+/).slice(0, 3).join(" ");
    if (h) out.push({ dimension: "hook_seed", key: h });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull latest metric per decision (last 7 days)
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const { data: metrics, error } = await sb
      .from("growth_decision_metrics")
      .select("decision_id, reward, impressions, clicks, saves, snapshot_day")
      .gte("snapshot_day", since);
    if (error) throw error;

    // Keep only most-recent snapshot per decision
    const latest = new Map<string, typeof metrics[number]>();
    for (const m of metrics ?? []) {
      const prev = latest.get(m.decision_id);
      if (!prev || prev.snapshot_day < m.snapshot_day) latest.set(m.decision_id, m);
    }
    const decisionIds = Array.from(latest.keys());
    if (decisionIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, traceId, message: "No metrics to learn from" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: decs } = await sb
      .from("growth_decisions")
      .select("id, payload, product_id")
      .in("id", decisionIds);

    // Enrich with product category
    const productIds = Array.from(new Set((decs ?? []).map((d) => d.product_id).filter(Boolean) as string[]));
    const catMap = new Map<string, string>();
    if (productIds.length) {
      const { data: prods } = await sb.from("products").select("id, category").in("id", productIds);
      for (const p of prods ?? []) catMap.set(p.id, p.category ?? "unknown");
    }

    // Pool rewards per (dimension,key) — use mean per pool
    const pool = new Map<string, { sum: number; n: number }>();
    for (const d of decs ?? []) {
      const m = latest.get(d.id)!;
      const r = Number(m.reward ?? 0);
      const payload = { ...(d.payload as any), category: catMap.get(d.product_id ?? "") };
      for (const k of dimsForDecision(payload)) {
        const key = `${k.dimension}::${k.key}`;
        const cur = pool.get(key) ?? { sum: 0, n: 0 };
        cur.sum += r;
        cur.n += 1;
        pool.set(key, cur);
      }
    }

    // Load existing strategy scores
    const dims = Array.from(pool.keys()).map((k) => {
      const [dimension, key] = k.split("::");
      return { dimension, key };
    });
    const updates: Array<{ dimension: string; key: string; score: number; samples: number; meta: Record<string, unknown> }> = [];

    for (const { dimension, key } of dims) {
      const cur = pool.get(`${dimension}::${key}`)!;
      const meanReward = cur.sum / cur.n;

      const { data: existing } = await sb
        .from("growth_strategy_scores")
        .select("score, samples")
        .eq("dimension", dimension)
        .eq("key", key)
        .maybeSingle();

      const prevScore = existing?.score != null ? Number(existing.score) : meanReward;
      const newScore = EWMA_ALPHA * meanReward + (1 - EWMA_ALPHA) * prevScore;
      updates.push({
        dimension,
        key,
        score: Number(newScore.toFixed(3)),
        samples: (existing?.samples ?? 0) + cur.n,
        meta: { last_batch_mean: Number(meanReward.toFixed(3)), last_batch_n: cur.n, updated_at: new Date().toISOString() },
      });
    }

    if (updates.length) {
      const { error: upErr } = await sb
        .from("growth_strategy_scores")
        .upsert(
          updates.map((u) => ({ ...u, updated_at: new Date().toISOString() })),
          { onConflict: "dimension,key" },
        );
      if (upErr) throw upErr;
    }

    await sb.from("growth_events").insert({
      event_type: "learning_loop",
      trace_id: traceId,
      payload: { decisions: decisionIds.length, strategies_updated: updates.length },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Updated ${updates.length} strategy scores from ${decisionIds.length} decisions`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});