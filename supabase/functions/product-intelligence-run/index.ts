import { createClient } from "npm:@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type FunnelRow = {
  product_id: string;
  views: number;
  atc: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
  sessions: number;
};

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function logScore(v: number, scale: number) {
  if (!v || v <= 0) return 0;
  return clamp(Math.round((Math.log10(v + 1) / Math.log10(scale + 1)) * 100));
}
function rate(num: number, den: number) { return den > 0 ? num / den : 0; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const triggerSource = url.searchParams.get("trigger") || "manual";
  const windowDays = Number(url.searchParams.get("window") || 30);

  // 1. create run
  const { data: run, error: runErr } = await supabase
    .from("gv3_pi_runs")
    .insert({ trigger_source: triggerSource, status: "running", window_days: windowDays, started_at: new Date().toISOString() })
    .select()
    .single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message || "run create failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // 2. load active products
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, slug, price, cost_price, stock, is_active, image_url, seo_title, seo_meta_description, optimized_description, shipping_time, category")
      .eq("is_active", true);
    if (pErr) throw pErr;
    const productList = products ?? [];

    // 3. aggregate canonical events using RPC-style raw SQL via PostgREST is not allowed; use bulk SELECT with grouping client-side
    const sinceIso = new Date(Date.now() - windowDays * 86400_000).toISOString();
    const funnel: Record<string, FunnelRow> = {};
    const sessionsByProduct: Record<string, Set<string>> = {};

    // page through canonical_events
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: rows, error: eErr } = await supabase
        .from("canonical_events")
        .select("canonical_name, product_id, session_id, value_cents")
        .gte("occurred_at", sinceIso)
        .not("product_id", "is", null)
        .range(from, from + PAGE - 1);
      if (eErr) throw eErr;
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const pid = r.product_id as string;
        if (!funnel[pid]) funnel[pid] = { product_id: pid, views: 0, atc: 0, checkouts: 0, purchases: 0, revenue_cents: 0, sessions: 0 };
        if (!sessionsByProduct[pid]) sessionsByProduct[pid] = new Set();
        if (r.session_id) sessionsByProduct[pid].add(r.session_id);
        const name = r.canonical_name as string;
        if (name === "CANONICAL_PRODUCT_VIEW") funnel[pid].views++;
        else if (name === "CANONICAL_ADD_TO_CART") funnel[pid].atc++;
        else if (name === "CANONICAL_CHECKOUT") funnel[pid].checkouts++;
        else if (name === "CANONICAL_PURCHASE") {
          funnel[pid].purchases++;
          funnel[pid].revenue_cents += Number(r.value_cents || 0);
        }
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    for (const pid of Object.keys(funnel)) {
      funnel[pid].sessions = sessionsByProduct[pid]?.size || 0;
    }

    // 4. score each product
    const now = new Date().toISOString();
    const scoreRows: any[] = [];
    const recRows: any[] = [];

    for (const p of productList) {
      const f = funnel[p.id] || { views: 0, atc: 0, checkouts: 0, purchases: 0, revenue_cents: 0, sessions: 0 };
      const aov = f.purchases > 0 ? Math.round(f.revenue_cents / f.purchases) : 0;

      const traffic_score = logScore(f.sessions, 500);
      const view_score = logScore(f.views, 500);
      const atc_score = logScore(f.atc, 50);
      const checkout_score = logScore(f.checkouts, 25);
      const purchase_score = logScore(f.purchases, 10);
      const revenue_score = logScore(f.revenue_cents / 100, 5000);
      const aov_score = aov > 0 ? clamp(Math.round((aov / 10000) * 60)) : 0; // ~$100 -> 60

      const margin = (p.price && p.cost_price) ? (Number(p.price) - Number(p.cost_price)) / Number(p.price) : null;
      const profit_score = margin !== null ? clamp(Math.round(margin * 120)) : 0;

      // CRO risk: high views but low ATC, or high ATC low purchase
      const viewToAtc = rate(f.atc, f.views);
      const atcToPurchase = rate(f.purchases, f.atc);
      let cro_risk = 0;
      if (f.views >= 25 && viewToAtc < 0.02) cro_risk += 50;
      if (f.atc >= 5 && atcToPurchase < 0.05) cro_risk += 50;
      cro_risk = clamp(cro_risk);

      // SEO score from content readiness
      const hasSeo = !!p.seo_title && !!p.seo_meta_description;
      const hasDesc = !!p.optimized_description && (p.optimized_description as string).length > 200;
      const seo_score = clamp((hasSeo ? 50 : 0) + (hasDesc ? 30 : 0) + (p.slug ? 20 : 0));

      // Pinterest/TikTok potential heuristics from product fit (visual category + margin + AOV potential)
      const visualCat = /toy|bed|tree|tower|harness|leash|costume|fashion|sweater/i.test(`${p.category || ""} ${p.name || ""}`);
      const pinterest_score = clamp(Math.round(((visualCat ? 60 : 30) + profit_score * 0.2 + view_score * 0.2)));
      const tiktok_score = clamp(Math.round(((/toy|interactive|funny|trick|trend/i.test(`${p.category || ""} ${p.name || ""}`) ? 60 : 30) + profit_score * 0.2 + atc_score * 0.2)));

      // Confidence: based on sample size
      const sampleSignal = f.sessions + f.views * 0.5 + f.purchases * 20;
      const confidence_score = clamp(Math.round(Math.min(100, sampleSignal * 2)));

      // Overall: weighted blend (only weight what we have confidence in)
      const lowConf = confidence_score < 25;
      const overall = lowConf
        ? clamp(Math.round(0.4 * seo_score + 0.3 * pinterest_score + 0.2 * profit_score + 0.1 * view_score))
        : clamp(Math.round(
            0.25 * revenue_score +
            0.15 * purchase_score +
            0.12 * atc_score +
            0.10 * view_score +
            0.08 * traffic_score +
            0.08 * profit_score +
            0.07 * seo_score +
            0.05 * pinterest_score +
            0.05 * aov_score +
            0.05 * (100 - cro_risk)
          ));

      // Classification
      let classification = "Low Confidence";
      let reason = `Only ${f.sessions} sessions and ${f.purchases} purchases in last ${windowDays}d`;
      let action = "Collect more traffic before deciding";
      let priority = 3;
      let expectedImpact = "unknown";

      const inStock = Number(p.stock || 0) > 0;

      if (!inStock) {
        classification = "Candidate to Pause";
        reason = "Out of stock";
        action = "Hide from storefront until restock";
        priority = 7;
        expectedImpact = "prevents lost sessions";
      } else if (f.purchases >= 3 && revenue_score >= 50) {
        classification = "Winner";
        reason = `${f.purchases} purchases, $${(f.revenue_cents / 100).toFixed(0)} revenue`;
        action = "Promote: increase Pinterest+TikTok exposure and protect inventory";
        priority = 9;
        expectedImpact = "scale revenue 1.5-3x";
      } else if (f.atc >= 3 && f.purchases === 0) {
        classification = "Needs CRO";
        reason = `${f.atc} add-to-carts but 0 purchases`;
        action = "Audit PDP, pricing, shipping cost, checkout friction";
        priority = 8;
        expectedImpact = "unlock pent-up demand";
      } else if (f.views >= 30 && f.atc === 0) {
        classification = "Needs Better Creative";
        reason = `${f.views} views, 0 add-to-carts (CTR-to-ATC = 0%)`;
        action = "Improve hero image, title, hook, benefit copy";
        priority = 7;
        expectedImpact = "lift ATC rate";
      } else if (f.purchases >= 1 && f.purchases < 3 && confidence_score < 60) {
        classification = "Promising";
        reason = `Early signal: ${f.purchases} purchase(s)`;
        action = "Add to promotion shortlist and watch next 14d";
        priority = 6;
        expectedImpact = "validate winner";
      } else if (f.sessions < 10) {
        if (seo_score >= 70 && pinterest_score >= 60) {
          classification = "Needs Traffic";
          reason = "Strong content & visual fit but no audience yet";
          action = "Add to Pinterest/SEO promotion queue";
          priority = 6;
          expectedImpact = "open new traffic stream";
        } else if (seo_score < 50) {
          classification = "Needs SEO";
          reason = "Missing seo_title/description/long copy";
          action = "Run SEO optimizer on this product";
          priority = 5;
          expectedImpact = "index & organic traffic";
        }
      }

      if (cro_risk >= 50 && classification !== "Winner") {
        classification = "Needs CRO";
        reason = `CRO risk ${cro_risk}: view→atc ${(viewToAtc*100).toFixed(1)}%, atc→purchase ${(atcToPurchase*100).toFixed(1)}%`;
        priority = Math.max(priority, 7);
      }

      if (p.price && Number(p.price) > 80 && f.views >= 20 && f.atc / Math.max(f.views, 1) < 0.01) {
        classification = "Price Resistance";
        reason = `Price $${p.price}, ${f.views} views, ${(viewToAtc*100).toFixed(1)}% ATC rate`;
        action = "Test lower price or bundle";
        priority = 6;
      }

      if (/ship|delay|backorder/i.test(p.shipping_time || "") || (p.shipping_time && /(1[5-9]|[2-9]\d)/.test(p.shipping_time))) {
        if (classification === "Winner") {
          classification = "Shipping Risk";
          reason = `Winner with slow shipping (${p.shipping_time})`;
          action = "Switch to US warehouse SKU";
          priority = 8;
        }
      }

      const evidence = {
        funnel: f,
        rates: { view_to_atc: viewToAtc, atc_to_purchase: atcToPurchase },
        product: { price: p.price, cost_price: p.cost_price, stock: p.stock, shipping_time: p.shipping_time },
        margin,
      };
      const components = {
        traffic_score, view_score, atc_score, checkout_score, purchase_score, revenue_score,
        aov_score, profit_score, pinterest_score, tiktok_score, seo_score, cro_risk_score: cro_risk,
        confidence_score, overall_score: overall,
      };

      scoreRows.push({
        product_id: p.id,
        run_id: run.id,
        window_days: windowDays,
        sessions: f.sessions,
        product_views: f.views,
        add_to_carts: f.atc,
        checkouts: f.checkouts,
        purchases: f.purchases,
        revenue_cents: f.revenue_cents,
        aov_cents: aov,
        traffic_score, view_score, atc_score, checkout_score, purchase_score, revenue_score,
        aov_score, profit_score, pinterest_score, tiktok_score, seo_score,
        cro_risk_score: cro_risk, confidence_score, overall_score: overall,
        classification, reason, evidence, components,
        last_scored_at: now, updated_at: now,
      });

      recRows.push({
        product_id: p.id,
        run_id: run.id,
        classification,
        recommended_action: action,
        reason,
        evidence,
        priority,
        expected_impact: expectedImpact,
        confidence: confidence_score,
        status: "open",
      });
    }

    // 5. upsert scores (in batches)
    const CHUNK = 200;
    for (let i = 0; i < scoreRows.length; i += CHUNK) {
      const chunk = scoreRows.slice(i, i + CHUNK);
      const { error } = await supabase.from("gv3_pi_scores").upsert(chunk, { onConflict: "product_id" });
      if (error) throw error;
    }
    for (let i = 0; i < recRows.length; i += CHUNK) {
      const chunk = recRows.slice(i, i + CHUNK);
      const { error } = await supabase.from("gv3_pi_recommendations").upsert(chunk, { onConflict: "run_id,product_id,classification" });
      if (error) throw error;
    }

    const classCounts: Record<string, number> = {};
    for (const r of recRows) classCounts[r.classification] = (classCounts[r.classification] || 0) + 1;

    await supabase.from("gv3_pi_runs").update({
      status: "ok",
      finished_at: new Date().toISOString(),
      products_targeted: productList.length,
      products_scored: scoreRows.length,
      recommendations_written: recRows.length,
      report: { classifications: classCounts, window_days: windowDays },
    }).eq("id", run.id);

    return new Response(JSON.stringify({
      ok: true, run_id: run.id, products_scored: scoreRows.length, classifications: classCounts,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await supabase.from("gv3_pi_runs").update({
      status: "error", finished_at: new Date().toISOString(), error_message: String(e?.message || e),
    }).eq("id", run.id);
    return new Response(JSON.stringify({ error: String(e?.message || e), run_id: run.id }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});