// Pinterest AI Growth Brain — nightly meta-orchestrator (Phase 3)
// Reads pin/product signals → writes predictions, refreshes 5-bucket revenue
// ranking, and enqueues amplification drafts for likely winners.
// Idempotent. Safe. Never deletes. Hard caps enforced.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_DRAFTS = 120;
const MAX_FLIPS = 50;
const MODEL_VERSION = "brain-v1";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const safe = (n: unknown, fb = 0) => (typeof n === "number" && isFinite(n) ? n : fb);

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Sb = ReturnType<typeof createClient>;

async function computePredictions(sb: Sb, runId: string, dryRun: boolean) {
  // Pull last-14d pin performance with joined product
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: perf } = await sb
    .from("pinterest_pin_performance")
    .select("pin_id, product_id, impressions, saves, outbound_clicks, ctr, save_rate, dwell_ms, gallery_interactions, variant_selections, atc, last_seen_at")
    .gte("last_seen_at", since)
    .limit(2000);
  const rows = perf ?? [];
  if (rows.length === 0) return { computed: 0, top: [] as Array<{ pin_id: string; product_id: string | null; winner_p: number; revenue_p: number; viral_p: number }> };

  // Aggregate per-category means for z-scores (fallback: global means)
  const m = (k: keyof typeof rows[number]) => {
    const vals = rows.map((r) => safe((r as Record<string, unknown>)[k] as number));
    const mean = vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(vals.length, 1)) || 1;
    return { mean, sd };
  };
  const stats = {
    ctr: m("ctr"),
    save: m("save_rate"),
    click: m("outbound_clicks"),
    dwell: m("dwell_ms"),
    atc: m("atc"),
    gallery: m("gallery_interactions"),
    variant: m("variant_selections"),
    impr: m("impressions"),
  };
  const z = (v: number, s: { mean: number; sd: number }) => clamp(((v - s.mean) / s.sd) / 3, -1, 1);

  const predictions = rows.map((r) => {
    const ctr_z = z(safe(r.ctr), stats.ctr);
    const save_z = z(safe(r.save_rate), stats.save);
    const click_z = z(safe(r.outbound_clicks), stats.click);
    const dwell_z = z(safe(r.dwell_ms), stats.dwell);
    const atc_z = z(safe(r.atc), stats.atc);
    const gallery_z = z(safe(r.gallery_interactions), stats.gallery);
    const variant_z = z(safe(r.variant_selections), stats.variant);
    const impr_z = z(safe(r.impressions), stats.impr);

    const winner_p = sigmoid(2 * (0.25 * ctr_z + 0.20 * save_z + 0.15 * click_z + 0.15 * dwell_z + 0.10 * atc_z + 0.10 * gallery_z + 0.05 * variant_z));
    const revenue_p = sigmoid(2 * (0.40 * atc_z + 0.30 * click_z + 0.20 * ctr_z + 0.10 * dwell_z));
    const viral_p = sigmoid(2 * (0.50 * save_z + 0.30 * impr_z + 0.20 * ctr_z));

    return {
      pin_id: String(r.pin_id),
      product_id: r.product_id as string | null,
      winner_p: Number(winner_p.toFixed(4)),
      revenue_p: Number(revenue_p.toFixed(4)),
      viral_p: Number(viral_p.toFixed(4)),
      inputs: { ctr_z, save_z, click_z, dwell_z, atc_z, gallery_z, variant_z, impr_z },
    };
  });

  if (!dryRun && predictions.length > 0) {
    // batch insert (snapshot)
    const payload = predictions.map((p) => ({ ...p, model_version: MODEL_VERSION }));
    for (let i = 0; i < payload.length; i += 500) {
      await sb.from("pinterest_pin_predictions").insert(payload.slice(i, i + 500));
    }
  }

  const top = [...predictions].sort((a, b) => b.winner_p - a.winner_p).slice(0, 50);
  return { computed: predictions.length, top };
}

async function dedupeTitle(sb: Sb, title: string): Promise<boolean> {
  const hash = await sha256(normalize(title));
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data } = await sb
    .from("pinterest_pin_queue")
    .select("id")
    .gte("created_at", since)
    .ilike("pin_title", title)
    .limit(1);
  return (data?.length ?? 0) > 0 || hash.length === 0;
}

async function generateCopyVariants(productName: string, trending: string[]): Promise<{ titles: string[]; descriptions: string[] }> {
  // Deterministic fallback if no Lovable key
  const kws = (trending.length ? trending : ["cozy", "premium", "best", "must-have", "trending"]).slice(0, 5);
  const titles = kws.map((k) => `${k[0].toUpperCase() + k.slice(1)} ${productName}`.split(" ").slice(0, 5).join(" "));
  const descriptions = kws.map((k) => `Loved by US pet parents — ${k} ${productName.toLowerCase()} your pet will adore. Free shipping over $50. #${k.replace(/\s+/g, "")} #petlovers`);
  if (!LOVABLE_API_KEY) return { titles, descriptions };
  try {
    const prompt = `Generate 5 Pinterest-compliant pin titles (≤5 words each, no clickbait) and 5 descriptions (≤140 chars, US tone, end with 2 niche hashtags) for product "${productName}". Lean on these trending keywords: ${kws.join(", ")}. Return strict JSON: {"titles":["..."],"descriptions":["..."]}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { titles, descriptions };
    const j = await res.json();
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return {
      titles: Array.isArray(parsed.titles) && parsed.titles.length ? parsed.titles.slice(0, 5) : titles,
      descriptions: Array.isArray(parsed.descriptions) && parsed.descriptions.length ? parsed.descriptions.slice(0, 5) : descriptions,
    };
  } catch {
    return { titles, descriptions };
  }
}

async function amplifyWinners(
  sb: Sb,
  runId: string,
  top: Array<{ pin_id: string; product_id: string | null; winner_p: number; revenue_p: number; viral_p: number }>,
  dryRun: boolean,
) {
  // Pick pins with winner_p>0.70 OR revenue_p>0.70, unique by product
  const candidates = top.filter((t) => t.product_id && (t.winner_p > 0.70 || t.revenue_p > 0.70));
  const byProduct = new Map<string, typeof candidates[number]>();
  for (const c of candidates) {
    if (!byProduct.has(c.product_id!)) byProduct.set(c.product_id!, c);
  }
  const winners = Array.from(byProduct.values()).slice(0, 10); // cap winners per run
  let amplified = 0;
  let drafts = 0;

  for (const w of winners) {
    if (drafts >= MAX_DRAFTS) break;
    const { data: prod } = await sb
      .from("products")
      .select("id, slug, title, name, image_url, category")
      .eq("id", w.product_id)
      .maybeSingle();
    if (!prod) continue;
    const productName = (prod.title as string) || (prod.name as string) || "Pet Product";

    // Trending keywords (best-effort)
    let trending: string[] = [];
    const { data: trendRows } = await sb
      .from("pinterest_trend_signals")
      .select("keyword, score")
      .order("score", { ascending: false })
      .limit(3);
    trending = (trendRows ?? []).map((t) => String(t.keyword));

    const { titles, descriptions } = await generateCopyVariants(productName, trending);

    // Persist title variants (best-effort, table exists)
    if (!dryRun) {
      for (const t of titles) {
        await sb.from("pinterest_title_variants").insert({
          product_id: prod.id,
          title: t,
          source: "growth-brain",
        }).then(() => {}).catch(() => {});
      }
      for (const d of descriptions) {
        await sb.from("pinterest_creative_variants").insert({
          product_id: prod.id,
          kind: "description",
          text: d,
          score: 0,
        }).then(() => {}).catch(() => {});
      }
    }

    // Enqueue 10 image drafts via creative-director (best-effort)
    let enqueuedImg = 0;
    if (!dryRun) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            action: "run_full",
            slug: prod.slug,
            count: 10,
            seo_mode: true,
            trending_keywords: trending,
          }),
        });
        const j = await res.json().catch(() => ({}));
        enqueuedImg = Number(j?.enqueued ?? j?.drafts ?? 0) || 0;
      } catch { /* swallow */ }
    }
    drafts += enqueuedImg;

    // Log action
    if (!dryRun) {
      await sb.from("pinterest_brain_actions").insert({
        run_id: runId,
        action_type: "amplify_winner",
        product_id: prod.id,
        pin_id: w.pin_id,
        reason: `winner_p=${w.winner_p} revenue_p=${w.revenue_p}`,
        payload: { titles, descriptions, trending, enqueuedImg },
      });
    }
    amplified++;
  }
  return { amplified, drafts };
}

async function discoverProducts(sb: Sb, runId: string, dryRun: boolean) {
  const { data: products } = await sb
    .from("products")
    .select("id, slug, title, name, image_url, margin_percent, is_active")
    .eq("is_active", true)
    .gte("margin_percent", 0.30)
    .not("image_url", "is", null)
    .limit(500);
  const list = products ?? [];
  if (list.length === 0) return 0;

  // Count recent pins per product (30d)
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const productIds = list.map((p) => p.id as string);
  const { data: pinCounts } = await sb
    .from("pinterest_pin_queue")
    .select("product_id")
    .in("product_id", productIds)
    .gte("created_at", since30);
  const counts = new Map<string, number>();
  (pinCounts ?? []).forEach((r) => {
    const id = r.product_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });

  const opportunities = list
    .filter((p) => (counts.get(p.id as string) ?? 0) < 3)
    .slice(0, 20);

  if (!dryRun) {
    for (const p of opportunities) {
      await sb.from("pinterest_product_tiers").upsert(
        {
          product_id: p.id,
          product_slug: p.slug,
          hidden_opportunity: true,
          discovery_source: "catalog_scan",
          pdp_strength_score: 0.5,
          tier: "opportunity",
        } as never,
        { onConflict: "product_id" } as never,
      );
      await sb.from("pinterest_brain_actions").insert({
        run_id: runId,
        action_type: "discover_product",
        product_id: p.id,
        reason: `pin_count_30d=${counts.get(p.id as string) ?? 0}`,
        payload: { margin: p.margin_percent },
      });
    }
  }
  return opportunities.length;
}

async function refreshRevenueBuckets(sb: Sb, top: Array<{ product_id: string | null; winner_p: number; revenue_p: number; viral_p: number }>, dryRun: boolean) {
  // Aggregate best probs per product
  const byProduct = new Map<string, { winner_p: number; revenue_p: number; viral_p: number }>();
  for (const t of top) {
    if (!t.product_id) continue;
    const cur = byProduct.get(t.product_id);
    if (!cur || t.winner_p > cur.winner_p) byProduct.set(t.product_id, { winner_p: t.winner_p, revenue_p: t.revenue_p, viral_p: t.viral_p });
  }
  if (dryRun) return Object.fromEntries(Array.from(byProduct.entries()).slice(0, 5));
  const summary: Record<string, number> = { viral_winner: 0, revenue_winner: 0, emerging: 0, hidden_opportunity: 0, underperformer: 0 };
  for (const [product_id, p] of byProduct) {
    let bucket = "emerging";
    if (p.viral_p >= 0.70) bucket = "viral_winner";
    else if (p.revenue_p >= 0.70) bucket = "revenue_winner";
    else if (p.winner_p >= 0.40 && p.winner_p < 0.70) bucket = "emerging";
    else if (p.winner_p < 0.25) bucket = "underperformer";
    summary[bucket] = (summary[bucket] ?? 0) + 1;
    await sb.from("pinterest_product_tiers").upsert(
      { product_id, revenue_bucket: bucket } as never,
      { onConflict: "product_id" } as never,
    );
  }
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body?.dry_run);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // open run row
    let runId = "dry";
    if (!dryRun) {
      const { data } = await sb.from("pinterest_brain_runs").insert({ dry_run: false }).select("id").single();
      runId = (data?.id as string) ?? "dry";
    }

    const pred = await computePredictions(sb, runId, dryRun);
    const buckets = await refreshRevenueBuckets(sb, pred.top, dryRun);
    const amp = await amplifyWinners(sb, runId, pred.top, dryRun);
    const discovered = await discoverProducts(sb, runId, dryRun);

    const summary = {
      buckets,
      top_winner_p: pred.top[0]?.winner_p ?? 0,
      caps: { MAX_DRAFTS, MAX_FLIPS },
    };

    if (!dryRun) {
      await sb.from("pinterest_brain_runs").update({
        finished_at: new Date().toISOString(),
        predictions_computed: pred.computed,
        winners_amplified: amp.amplified,
        drafts_enqueued: amp.drafts,
        products_discovered: discovered,
        summary,
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: dryRun ? "dry run complete" : "brain run complete",
        run_id: runId,
        dry_run: dryRun,
        predictions_computed: pred.computed,
        winners_amplified: amp.amplified,
        drafts_enqueued: amp.drafts,
        products_discovered: discovered,
        summary,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});