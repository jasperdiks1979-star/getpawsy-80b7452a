import { createClient } from "npm:@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const trigger = url.searchParams.get("trigger") || "manual";
  const windowDays = Number(url.searchParams.get("window") || 30);

  const { data: run, error: runErr } = await supabase
    .from("gv3_pin_growth_runs")
    .insert({ trigger_source: trigger, status: "running", window_days: windowDays, started_at: new Date().toISOString() })
    .select().single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message || "run create failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // 1. Load PI scores (single source of truth for product opportunity)
    const { data: piRows, error: piErr } = await supabase
      .from("gv3_pi_scores")
      .select("product_id, overall_score, pinterest_score, confidence_score, revenue_score, view_score, atc_score, purchase_score, cro_risk_score, sessions, product_views, add_to_carts, purchases, revenue_cents, classification");
    if (piErr) throw piErr;
    const piByProduct = new Map<string, any>((piRows ?? []).map((r: any) => [r.product_id, r]));

    // 2. Load product catalog
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, slug, price, cost_price, stock, is_active, image_url, category, shipping_time, created_at")
      .eq("is_active", true);
    if (pErr) throw pErr;

    // 3. Pinterest saturation: count published pins per product
    const pinCount: Record<string, number> = {};
    let from = 0; const PAGE = 1000;
    while (true) {
      const { data: pins, error: pinErr } = await supabase
        .from("pinterest_pins")
        .select("product_id, status")
        .eq("status", "published")
        .range(from, from + PAGE - 1);
      if (pinErr) break;
      if (!pins || pins.length === 0) break;
      for (const p of pins as any[]) {
        if (!p.product_id) continue;
        pinCount[p.product_id] = (pinCount[p.product_id] || 0) + 1;
      }
      if (pins.length < PAGE) break;
      from += PAGE;
    }

    const now = new Date().toISOString();
    const scoreRows: any[] = [];
    const recRows: any[] = [];

    for (const p of products ?? []) {
      const pi = piByProduct.get(p.id) || null;
      const saturation = pinCount[p.id] || 0;
      const inStock = Number(p.stock || 0) > 0;
      const hasImage = !!p.image_url;

      const freshnessDays = p.created_at ? Math.max(0, (Date.now() - new Date(p.created_at).getTime()) / 86400_000) : 9999;
      const freshness_score = freshnessDays < 30 ? 80 : freshnessDays < 90 ? 60 : freshnessDays < 365 ? 40 : 20;

      const visualCat = /toy|bed|tree|tower|harness|leash|costume|fashion|sweater|collar|carrier|fountain|feeder/i.test(`${p.category || ""} ${p.name || ""}`);
      const visual_score = (hasImage ? 60 : 0) + (visualCat ? 30 : 10);

      const margin = (p.price && p.cost_price) ? (Number(p.price) - Number(p.cost_price)) / Number(p.price) : null;
      const margin_score = margin !== null ? clamp(Math.round(margin * 120)) : 30;

      const piOverall = pi ? Number(pi.overall_score) : 0;
      const piPinterest = pi ? Number(pi.pinterest_score) : 0;
      const conf = pi ? Number(pi.confidence_score) : 0;
      const cro_risk = pi ? Number(pi.cro_risk_score) : 0;

      const saturation_penalty = saturation >= 20 ? 30 : saturation >= 10 ? 15 : 0;

      const pgs = clamp(Math.round(
        0.30 * piOverall +
        0.20 * piPinterest +
        0.15 * visual_score +
        0.10 * margin_score +
        0.10 * freshness_score +
        0.10 * (100 - cro_risk) +
        0.05 * (inStock ? 100 : 0) -
        saturation_penalty
      ));

      // Classification
      let classification = "Low Confidence";
      let reason = "Insufficient signal";
      let action = "Wait for more PI data";
      let priority = 3;
      let impact = "unknown";
      let strategy: any = {};

      if (!inStock) {
        classification = "Hold";
        reason = "Out of stock";
        action = "Pause Pinterest until restock";
        priority = 7;
      } else if (!hasImage) {
        classification = "Needs Better Images";
        reason = "No product image_url";
        action = "Add primary product image before publishing";
        priority = 6;
      } else if (pi?.classification === "Winner" || (pi && piOverall >= 70 && saturation < 10)) {
        classification = "Promote Immediately";
        reason = `PI overall ${Math.round(piOverall)} · pinterest ${Math.round(piPinterest)} · saturation ${saturation}`;
        action = "Generate 4-6 fresh pins across lifestyle, benefit and use-case angles";
        priority = 9; impact = "High revenue uplift expected";
        strategy = {
          image_pins: 4, video_pins: 0,
          lifestyle_concepts: ["use-case in real home", "before/after", "owner+pet bonding"],
          headlines: ["benefit-led", "curiosity gap", "social proof"],
          hooks: ["pain-point", "solution promise", "instant outcome"],
          ctas: ["See why owners love it", "Shop the must-have", "Bring it home today"],
          board_placement: ["Best Cat Products", visualCat ? "Pet Lifestyle" : "Pet Essentials"],
          cadence: "2 pins/day for 7 days",
        };
      } else if (pi && pi.classification === "Needs Better Creative") {
        classification = "Needs New Creative";
        reason = "Traffic without ATC — creative is the bottleneck";
        action = "Test 3 new headline angles and 2 new hero images";
        priority = 7; impact = "Lift ATC rate";
        strategy = { image_pins: 3, headlines: ["problem→solution", "stat-led", "transformation"], hooks: ["curiosity", "controversy", "demo"] };
      } else if (saturation >= 20 && pi && pi.purchases === 0) {
        classification = "Do Not Promote";
        reason = `Saturated (${saturation} pins) with 0 conversions`;
        action = "Stop allocating creative credits to this product";
        priority = 8; impact = "Save credits";
      } else if (visual_score >= 80 && pgs >= 55 && saturation < 5) {
        classification = "Seasonal Opportunity";
        reason = `Strong visual fit, low saturation (${saturation} pins)`;
        action = "Add to seasonal Pinterest queue";
        priority = 6; impact = "Open new traffic stream";
        strategy = { image_pins: 3, lifestyle_concepts: ["seasonal", "gift-ready"] };
      } else if (pi && pi.classification === "Needs CRO") {
        classification = "Hold";
        reason = "Fix CRO before driving more Pinterest traffic";
        action = "Resolve CRO issues, then revisit";
        priority = 5;
      } else if (conf < 25) {
        classification = "Low Confidence";
        reason = `Only ${pi?.sessions ?? 0} sessions, ${pi?.purchases ?? 0} purchases`;
        action = "Publish 1 test pin and observe 14d";
        priority = 3;
        strategy = { image_pins: 1, cadence: "1 pin, then wait 14d" };
      } else {
        classification = "Hold";
        reason = `PGS ${pgs} below promote threshold`;
        action = "Monitor; revisit next run";
        priority = 4;
      }

      const predicted_opportunity = clamp(Math.round((pgs * (pi?.revenue_score ?? 20)) / 100));

      scoreRows.push({
        product_id: p.id, run_id: run.id,
        pinterest_growth_score: pgs,
        classification, reason,
        evidence: {
          pi: pi ? { overall: piOverall, pinterest: piPinterest, classification: pi.classification, sessions: pi.sessions, purchases: pi.purchases, revenue_cents: pi.revenue_cents } : null,
          product: { stock: p.stock, image: hasImage, category: p.category, price: p.price, shipping_time: p.shipping_time, age_days: Math.round(freshnessDays) },
          saturation,
        },
        components: { visual_score, margin_score, freshness_score, piOverall, piPinterest, cro_risk, saturation_penalty },
        predicted_opportunity,
        confidence: conf,
        pinterest_saturation: saturation,
        last_scored_at: now, updated_at: now,
      });

      recRows.push({
        product_id: p.id, run_id: run.id,
        classification, recommended_action: action, reason,
        evidence: { pgs, pi_classification: pi?.classification, saturation },
        content_strategy: strategy,
        priority, expected_impact: impact,
        confidence: conf, status: "open",
      });
    }

    const CHUNK = 200;
    for (let i = 0; i < scoreRows.length; i += CHUNK) {
      const { error } = await supabase.from("gv3_pin_growth_scores").upsert(scoreRows.slice(i, i + CHUNK), { onConflict: "product_id" });
      if (error) throw error;
    }
    for (let i = 0; i < recRows.length; i += CHUNK) {
      const { error } = await supabase.from("gv3_pin_growth_recommendations").upsert(recRows.slice(i, i + CHUNK), { onConflict: "run_id,product_id" });
      if (error) throw error;
    }

    const classCounts: Record<string, number> = {};
    for (const r of recRows) classCounts[r.classification] = (classCounts[r.classification] || 0) + 1;
    const promoted = (classCounts["Promote Immediately"] || 0);

    await supabase.from("gv3_pin_growth_runs").update({
      status: "ok", finished_at: new Date().toISOString(),
      products_analyzed: scoreRows.length, products_promoted: promoted,
      recommendations_written: recRows.length,
      report: { classifications: classCounts, window_days: windowDays },
    }).eq("id", run.id);

    return new Response(JSON.stringify({ ok: true, run_id: run.id, analyzed: scoreRows.length, classifications: classCounts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await supabase.from("gv3_pin_growth_runs").update({
      status: "error", finished_at: new Date().toISOString(), error_message: String(e?.message || e),
    }).eq("id", run.id);
    return new Response(JSON.stringify({ error: String(e?.message || e), run_id: run.id }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});