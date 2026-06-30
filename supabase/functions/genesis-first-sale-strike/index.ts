import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function invokeFn(name: string, body: unknown) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "apikey": SERVICE_ROLE,
        "Content-Type": "application/json",
        "x-internal-call": "1",
      },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 400) }; }
    return { ok: r.ok, status: r.status, body: parsed };
  } catch (e) {
    return { ok: false, status: 0, body: { error: String((e as Error).message) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const conceptsPerProduct = Math.max(3, Math.min(8, Number(body?.concepts ?? 8)));
  const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 10)));
  const dryRun = Boolean(body?.dry_run);

  // STEP 1 — Strike selection: composite score across existing engines.
  const { data: candidates, error: candErr } = await sb.rpc("execute_sql" as any, {} as any).then(
    () => ({ data: null, error: { message: "rpc_unavailable" } }),
    () => ({ data: null, error: { message: "rpc_unavailable" } }),
  );
  void candidates; void candErr;

  // Use direct queries instead.
  const { data: prods } = await sb
    .from("products")
    .select("id, slug, name, margin_percent, stock")
    .eq("is_active", true)
    .gt("stock", 0)
    .limit(2000);

  const ids = (prods ?? []).map((p) => p.id as string);
  const [{ data: fs }, { data: gci }, { data: ros }] = await Promise.all([
    sb.from("gv6_first_sale_scores").select("product_id,fsps").in("product_id", ids),
    sb.from("gci_scores").select("product_id,crs,trust_score,image_score,confidence").in("product_id", ids),
    sb.from("pinterest_revenue_opportunity_scores").select("product_id,score_0_1000").in("product_id", ids),
  ]);

  const fsMap = new Map((fs ?? []).map((r: any) => [r.product_id, r.fsps]));
  const gciMap = new Map((gci ?? []).map((r: any) => [r.product_id, r]));
  const rosMap = new Map((ros ?? []).map((r: any) => [r.product_id, r.score_0_1000]));

  const ranked = (prods ?? []).map((p: any) => {
    const fsps = Number(fsMap.get(p.id) ?? 0);
    const g = gciMap.get(p.id) as any;
    const crs = Number(g?.crs ?? 0);
    const trust = Number(g?.trust_score ?? 0);
    const img = Number(g?.image_score ?? 0);
    const conf = Number(g?.confidence ?? 0);
    const opp = Number(rosMap.get(p.id) ?? 0) / 10;
    const margin = Number(p.margin_percent ?? 0);
    const composite =
      fsps * 0.25 + crs * 0.30 + trust * 0.10 + img * 0.10 + opp * 0.15 + margin * 0.05 + conf * 0.05;
    return { id: p.id, slug: p.slug, name: p.name, fsps, crs, trust, img, opp, margin, conf, composite };
  })
    .sort((a, b) => b.composite - a.composite)
    .slice(0, limit);

  if (dryRun) return json({ ok: true, dry_run: true, selected: ranked });

  // STEP 2 — Enqueue copy repair via existing cpe-copy-engine (cpe_creative_jobs table).
  const copyJobs: any[] = [];
  for (const p of ranked) {
    const payload = { product_id: p.id, product_slug: p.slug, source: "first_sale_strike" };
    const dedupe_key = `first-sale-strike:${p.id}:${new Date().toISOString().slice(0, 10)}`;
    copyJobs.push({ kind: "copy", payload, dedupe_key, status: "pending" });
  }
  const { error: copyErr } = await sb
    .from("cpe_creative_jobs")
    .upsert(copyJobs, { onConflict: "kind,dedupe_key", ignoreDuplicates: true });

  // Fire copy engine workers (best-effort, async).
  invokeFn("cpe-copy-engine", {}).catch(() => {});

  // STEP 3-6 — Creative generation + scoring + publish via existing pinterest-creative-director.
  const creativeResults: any[] = [];
  for (const p of ranked) {
    const r = await invokeFn("pinterest-creative-director", {
      action: "run_full",
      product_slug: p.slug,
      product_id: p.id,
      count: conceptsPerProduct,
      source: "first_sale_strike",
    });
    creativeResults.push({ slug: p.slug, ok: r.ok, status: r.status, body: r.body });
  }

  // STEP 7 — Prioritize Strike-10 drafts in the publish queue (priority 99 / 24h window).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: bumped } = await sb
    .from("pinterest_pin_queue")
    .update({ priority: 99, meta: { first_sale_strike: true } as any })
    .in("product_id", ranked.map((r) => r.id))
    .in("status", ["draft", "approved", "queued", "scheduled"])
    .gte("created_at", since)
    .select("id, product_id, status");

  // Compute expectations (heuristic from CRS/FSPS/Opportunity).
  const avgFsps = ranked.reduce((s, r) => s + r.fsps, 0) / Math.max(1, ranked.length);
  const avgCrs = ranked.reduce((s, r) => s + r.crs, 0) / Math.max(1, ranked.length);
  const pinsGenerated = creativeResults.reduce(
    (s, r) => s + Number(r?.body?.inserted ?? r?.body?.accepted ?? r?.body?.created ?? 0),
    0,
  );
  const expImpressions = Math.round((bumped?.length ?? 0) * 180 * (avgFsps / 100));
  const expCtr = Math.max(0.4, Math.min(2.5, (avgCrs / 100) * 2.2));
  const expSaves = Math.round(expImpressions * 0.012 * (avgCrs / 100));
  const expOutbound = Math.round(expImpressions * (expCtr / 100));
  const etaHours = Math.round(720 * Math.exp(-((avgFsps + avgCrs) / 2) / 35));

  // STEP 8 — Log run for closed-loop learning.
  await sb.from("gv6_runs").insert({
    products_scored: ranked.length,
    avg_top10_fsps: Math.round(avgFsps),
    eta_hours: etaHours,
    queue_changes: bumped?.length ?? 0,
    notes: `first_sale_strike v6.2 — concepts=${conceptsPerProduct} pins_gen=${pinsGenerated}`,
  } as any).catch?.(() => {});

  return json({
    ok: true,
    mode: "FIRST_SALE_STRIKE",
    selected: ranked.map((r) => ({ slug: r.slug, composite: Math.round(r.composite), fsps: r.fsps, crs: Math.round(r.crs) })),
    copy_repair: { enqueued: copyJobs.length, error: copyErr?.message ?? null },
    creative_results: creativeResults,
    queue_changes: bumped?.length ?? 0,
    pins_generated: pinsGenerated,
    expected: {
      impressions: expImpressions,
      ctr_pct: Number(expCtr.toFixed(2)),
      saves: expSaves,
      outbound_clicks: expOutbound,
    },
    first_sale_eta_hours: etaHours,
    bottlenecks: ranked.filter((r) => r.trust < 60 || r.crs < 65).map((r) => ({
      slug: r.slug,
      reason: r.trust < 60 ? "low_trust" : "low_crs",
    })),
  });
});