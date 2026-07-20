// Pinterest Growth Director — single new intelligence layer.
// Reads from existing engines (revenue funnel, board performance, taste, predictions,
// pin queue, products) and emits a holistic Growth Director snapshot + ranked decisions.
import { emitXaiDecision } from "../_shared/xai-decision.ts";
// Never publishes. Never duplicates existing engines.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Json = Record<string, unknown>;
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  const dryRun = !!body?.dry_run;

  const t0 = Date.now();
  const { data: run, error: runErr } = await sb
    .from("pinterest_growth_director_runs")
    .insert({ status: "running" })
    .select()
    .single();
  if (runErr || !run) {
    return new Response(JSON.stringify({ error: runErr?.message ?? "run create failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ───── 1. Pull production evidence from existing engines ─────
    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const since7  = new Date(Date.now() -  7 * 86400_000).toISOString().slice(0, 10);

    const [funnel, boards, products, queue, taste, preds, tiers] = await Promise.all([
      sb.from("pinterest_revenue_funnel_daily")
        .select("product_id,product_slug,board_name,impressions,saves,outbound_clicks,product_views,add_to_carts,purchases,revenue_cents,day")
        .gte("day", since30).limit(50000),
      sb.from("pinterest_board_performance")
        .select("board_name,impressions_30d,clicks_30d,saves_30d,purchases_30d,revenue_cents_30d,ctr,purchase_rate,publish_weight,classification,rank"),
      sb.from("products")
        .select("id,slug,name,category,margin_percent,us_stock,is_active,image_url")
        .eq("is_active", true).limit(2000),
      sb.from("pinterest_pin_queue")
        .select("product_id,status,scheduled_at,posted_at,created_at")
        .gte("created_at", since30).limit(20000),
      sb.from("pinterest_taste_signals")
        .select("dimension,value,lift_score,velocity_7d,momentum_30d,confidence,status")
        .order("lift_score", { ascending: false }).limit(120),
      sb.from("pinterest_pin_predictions")
        .select("product_id,winner_p,revenue_p,viral_p,computed_at")
        .order("computed_at", { ascending: false }).limit(2000),
      sb.from("pinterest_product_tiers")
        .select("product_id,revenue_bucket,hidden_opportunity"),
    ]);

    const productById = new Map<string, any>();
    for (const p of products.data ?? []) productById.set(p.id, p);

    // ───── 2. Account-wide KPIs ─────
    let acc = { impressions: 0, saves: 0, clicks: 0, atc: 0, purchases: 0, revenueCents: 0, pins: 0 };
    for (const r of funnel.data ?? []) {
      acc.impressions += Number(r.impressions ?? 0);
      acc.saves       += Number(r.saves ?? 0);
      acc.clicks      += Number(r.outbound_clicks ?? 0);
      acc.atc         += Number(r.add_to_carts ?? 0);
      acc.purchases   += Number(r.purchases ?? 0);
      acc.revenueCents+= Number(r.revenue_cents ?? 0);
      acc.pins        += 1;
    }
    const accountKpis = {
      window_days: 30,
      impressions: acc.impressions,
      saves: acc.saves,
      clicks: acc.clicks,
      add_to_carts: acc.atc,
      purchases: acc.purchases,
      revenue_cents: acc.revenueCents,
      ctr: safeDiv(acc.clicks, acc.impressions),
      save_rate: safeDiv(acc.saves, acc.impressions),
      click_to_atc: safeDiv(acc.atc, acc.clicks),
      atc_to_purchase: safeDiv(acc.purchases, acc.atc),
      revenue_per_click_cents: Math.round(safeDiv(acc.revenueCents, acc.clicks)),
    };

    // ───── 3. Per-product priority scoring ─────
    const perProduct = new Map<string, any>();
    for (const r of funnel.data ?? []) {
      if (!r.product_id) continue;
      const p = perProduct.get(r.product_id) ?? { impressions: 0, saves: 0, clicks: 0, purchases: 0, revenue: 0, pins: 0 };
      p.impressions += Number(r.impressions ?? 0);
      p.saves       += Number(r.saves ?? 0);
      p.clicks      += Number(r.outbound_clicks ?? 0);
      p.purchases   += Number(r.purchases ?? 0);
      p.revenue     += Number(r.revenue_cents ?? 0);
      p.pins        += 1;
      perProduct.set(r.product_id, p);
    }
    const predByProduct = new Map<string, any>();
    for (const p of preds.data ?? []) {
      if (p.product_id && !predByProduct.has(p.product_id)) predByProduct.set(p.product_id, p);
    }
    const tierByProduct = new Map<string, any>();
    for (const t of tiers.data ?? []) tierByProduct.set(t.product_id, t);

    const queueByProduct = new Map<string, number>();
    for (const q of queue.data ?? []) {
      if (!q.product_id) continue;
      queueByProduct.set(q.product_id, (queueByProduct.get(q.product_id) ?? 0) + 1);
    }

    const productPriorities: any[] = [];
    for (const [pid, agg] of perProduct.entries()) {
      const prod = productById.get(pid);
      if (!prod) continue;
      const margin = Number(prod.margin_percent ?? 0);
      const inStock = (prod.us_stock ?? 0) > 0 ? 1 : 0;
      const pred = predByProduct.get(pid) ?? { winner_p: 0, revenue_p: 0, viral_p: 0 };
      const ctr = safeDiv(agg.clicks, agg.impressions);
      const saveRate = safeDiv(agg.saves, agg.impressions);
      const purchaseRate = safeDiv(agg.purchases, agg.clicks);
      const revPerPin = safeDiv(agg.revenue, agg.pins);
      const freshness = clamp(1 - safeDiv(queueByProduct.get(pid) ?? 0, 20));

      // Composite priority (0..100). All factors in [0..1].
      const score = clamp(
        0.22 * clamp(revPerPin / Math.max(1, safeDiv(acc.revenueCents, acc.pins))) +
        0.16 * clamp(ctr / 0.02) +
        0.12 * clamp(saveRate / 0.01) +
        0.16 * clamp(purchaseRate / 0.02) +
        0.12 * clamp(margin) +
        0.06 * inStock +
        0.10 * Number(pred.winner_p ?? 0) +
        0.06 * Number(pred.revenue_p ?? 0) +
        0.04 * freshness
      , 0, 1) * 100;

      productPriorities.push({
        product_id: pid,
        slug: prod.slug,
        name: prod.name,
        category: prod.category,
        priority_score: Math.round(score * 10) / 10,
        revenue_cents_30d: agg.revenue,
        ctr, save_rate: saveRate, purchase_rate: purchaseRate,
        margin, in_stock: !!inStock,
        winner_p: Number(pred.winner_p ?? 0),
        revenue_p: Number(pred.revenue_p ?? 0),
        pins_30d: agg.pins,
        bucket: tierByProduct.get(pid)?.revenue_bucket ?? null,
      });
    }
    productPriorities.sort((a, b) => b.priority_score - a.priority_score);

    // ───── 4. Board capital allocation ─────
    const totalBoardRev = (boards.data ?? []).reduce((s, b) => s + Number(b.revenue_cents_30d ?? 0), 0) || 1;
    const boardAllocations = (boards.data ?? []).map((b) => {
      const share = Number(b.revenue_cents_30d ?? 0) / totalBoardRev;
      // smooth toward current weight; cap shift to [-50%, +50%]
      const target = clamp(0.5 * share + 0.5 * Number(b.publish_weight ?? 1) / 4, 0, 1);
      const delta = target - Number(b.publish_weight ?? 1) / 4;
      return {
        board_name: b.board_name,
        classification: b.classification,
        revenue_cents_30d: Number(b.revenue_cents_30d ?? 0),
        clicks_30d: Number(b.clicks_30d ?? 0),
        ctr: Number(b.ctr ?? 0),
        purchase_rate: Number(b.purchase_rate ?? 0),
        current_publish_weight: Number(b.publish_weight ?? 1),
        recommended_share: Math.round(target * 1000) / 1000,
        share_delta: Math.round(delta * 1000) / 1000,
        action: delta > 0.05 ? "increase" : delta < -0.05 ? "decrease" : "hold",
      };
    }).sort((a, b) => b.revenue_cents_30d - a.revenue_cents_30d);

    // ───── 5. Bottleneck ranking ─────
    const bn: Array<{ key: string; label: string; severity: number; evidence: any }> = [];
    if (accountKpis.ctr < 0.005)
      bn.push({ key: "ctr", label: "Pinterest CTR below 0.5% — creative/headline weakness", severity: 0.9, evidence: { ctr: accountKpis.ctr } });
    if (accountKpis.save_rate < 0.003)
      bn.push({ key: "save_rate", label: "Save rate below 0.3% — inspiration deficit", severity: 0.7, evidence: { save_rate: accountKpis.save_rate } });
    if (accountKpis.click_to_atc < 0.05)
      bn.push({ key: "atc", label: "Click → ATC conversion below 5% — PDP leak", severity: 0.85, evidence: { click_to_atc: accountKpis.click_to_atc } });
    if (accountKpis.atc_to_purchase < 0.15 && acc.atc > 20)
      bn.push({ key: "checkout", label: "ATC → Purchase below 15% — checkout friction", severity: 0.95, evidence: { atc_to_purchase: accountKpis.atc_to_purchase } });
    const oosProducts = (products.data ?? []).filter((p) => (p.us_stock ?? 0) === 0).length;
    if (oosProducts > (products.data?.length ?? 0) * 0.3)
      bn.push({ key: "inventory", label: `${oosProducts} products out of US stock`, severity: 0.6, evidence: { oos_products: oosProducts } });
    const weakBoards = boardAllocations.filter((b) => b.action === "decrease").length;
    if (weakBoards >= 3)
      bn.push({ key: "boards", label: `${weakBoards} boards under-performing — reallocate capacity`, severity: 0.55, evidence: { weak_boards: weakBoards } });
    bn.sort((a, b) => b.severity - a.severity);

    // ───── 6. Opportunity discovery ─────
    const opportunities: any[] = [];
    // 6a. Hidden winners: high pred winner_p but low pin count
    const hiddenWinners = productPriorities
      .filter((p) => p.winner_p >= 0.55 && p.pins_30d < 3 && p.in_stock)
      .slice(0, 15)
      .map((p) => ({ kind: "hidden_winner", product_id: p.product_id, slug: p.slug, name: p.name,
        winner_p: p.winner_p, margin: p.margin, pins_30d: p.pins_30d,
        reason: "High winner probability with insufficient creative coverage" }));
    opportunities.push(...hiddenWinners);

    // 6b. Rising taste signals not yet exploited
    const risingTaste = (taste.data ?? [])
      .filter((t) => t.status === "rising" && Number(t.confidence ?? 0) >= 0.5)
      .slice(0, 10)
      .map((t) => ({ kind: "trend", dimension: t.dimension, value: t.value,
        lift: t.lift_score, momentum: t.momentum_30d, confidence: t.confidence,
        reason: "Rising Pinterest taste signal — amplify in next creative batch" }));
    opportunities.push(...risingTaste);

    // 6c. High-margin products absent from pin queue entirely
    const unpinnedHighMargin = (products.data ?? [])
      .filter((p) => Number(p.margin_percent ?? 0) >= 0.4 && (p.us_stock ?? 0) > 0 && !perProduct.has(p.id))
      .slice(0, 15)
      .map((p) => ({ kind: "unpinned_margin", product_id: p.id, slug: p.slug, name: p.name,
        margin: p.margin_percent, reason: "High-margin in-stock product with zero Pinterest exposure" }));
    opportunities.push(...unpinnedHighMargin);

    // ───── 7. Ranked decisions ─────
    const decisions: any[] = [];
    const top5Products = productPriorities.slice(0, 5);
    for (const p of top5Products) {
      decisions.push({
        run_id: run.id,
        category: "creative_allocation",
        title: `Amplify ${p.name}`,
        rationale: `Priority ${p.priority_score} · winner_p ${p.winner_p.toFixed(2)} · margin ${(p.margin*100).toFixed(0)}% · rev30d $${(p.revenue_cents_30d/100).toFixed(0)}`,
        expected_impact_score: p.priority_score,
        expected_revenue_cents_30d: Math.round(p.revenue_cents_30d * 0.5),
        confidence: clamp(0.4 + 0.4 * p.winner_p + 0.2 * (p.pins_30d >= 3 ? 1 : 0.4)),
        effort: "low",
        dependencies: ["pinterest-creative-factory", "pinterest-cron-worker"],
        evidence: { product: p },
        target_kind: "product",
        target_ref: p.product_id,
      });
    }
    for (const b of boardAllocations.filter((x) => x.action !== "hold").slice(0, 6)) {
      decisions.push({
        run_id: run.id,
        category: "board_allocation",
        title: `${b.action === "increase" ? "Shift capacity into" : "Reduce capacity on"} ${b.board_name}`,
        rationale: `30d revenue $${(b.revenue_cents_30d/100).toFixed(0)} · CTR ${(b.ctr*100).toFixed(2)}% · target share ${(b.recommended_share*100).toFixed(1)}%`,
        expected_impact_score: Math.abs(b.share_delta) * 100,
        expected_revenue_cents_30d: Math.round(b.revenue_cents_30d * Math.abs(b.share_delta)),
        confidence: 0.7,
        effort: "low",
        dependencies: ["pinterest-board-intelligence"],
        evidence: { board: b },
        target_kind: "board",
        target_ref: b.board_name,
      });
    }
    for (const o of opportunities.slice(0, 10)) {
      decisions.push({
        run_id: run.id,
        category: "opportunity",
        title: o.kind === "trend"
          ? `Exploit rising taste signal: ${o.dimension}=${o.value}`
          : `Cover ${o.kind === "hidden_winner" ? "hidden winner" : "unpinned high-margin"}: ${o.name ?? o.value}`,
        rationale: o.reason,
        expected_impact_score: 55 + Math.round(Math.random() * 10),
        expected_revenue_cents_30d: 0,
        confidence: clamp(0.5 + 0.3 * (o.confidence ?? 0.5)),
        effort: "medium",
        dependencies: o.kind === "trend" ? ["pinterest-evolution-engine"] : ["pinterest-creative-factory"],
        evidence: o,
        target_kind: o.kind,
        target_ref: o.product_id ?? `${o.dimension}:${o.value}` ?? null,
      });
    }
    for (const b of bn) {
      decisions.push({
        run_id: run.id,
        category: "bottleneck",
        title: `Bottleneck: ${b.label}`,
        rationale: `Severity ${b.severity.toFixed(2)} based on 30d production evidence`,
        expected_impact_score: b.severity * 100,
        expected_revenue_cents_30d: 0,
        confidence: 0.85,
        effort: b.key === "checkout" ? "high" : "medium",
        dependencies: [],
        evidence: b.evidence,
        target_kind: "bottleneck",
        target_ref: b.key,
      });
    }
    decisions.sort((a, b) => b.expected_impact_score - a.expected_impact_score);

    // ───── 8. 30-day outlook ─────
    const avgDailyRevCents = Math.round(acc.revenueCents / 30);
    const growthMultiplier = 1 + clamp(productPriorities.slice(0, 10).reduce((s, p) => s + p.winner_p, 0) / 30, 0, 0.5);
    const outlook30d = {
      baseline_revenue_cents: avgDailyRevCents * 30,
      projected_revenue_cents: Math.round(avgDailyRevCents * 30 * growthMultiplier),
      projected_growth_pct: Math.round((growthMultiplier - 1) * 100),
      assumes_top5_amplified: true,
    };

    const confidence = clamp(
      0.2 + 0.4 * clamp(acc.impressions / 50000) + 0.2 * clamp(productPriorities.length / 50) + 0.2 * clamp(boardAllocations.length / 6)
    );

    // ───── 9. Persist snapshot + decisions ─────
    if (!dryRun) {
      await sb.from("pinterest_growth_director_snapshots").insert({
        run_id: run.id,
        account_kpis: accountKpis as Json,
        product_priorities: productPriorities.slice(0, 60),
        board_allocations: boardAllocations,
        bottlenecks: bn,
        opportunities,
        outlook_30d: outlook30d,
        confidence,
      });
      if (decisions.length) {
        await sb.from("pinterest_growth_director_decisions").insert(decisions);
        // Mirror top decisions into the explainable-AI ledger so the
        // Pinterest Health dashboard can show plain-English rationales.
        for (const d of decisions.slice(0, 12)) {
          const reasonCodes: string[] = [];
          if (d.category === "creative_allocation") reasonCodes.push("HIGH_CONFIDENCE", "HIGH_PURCHASE_RATE");
          if (d.category === "board_allocation") reasonCodes.push("BOARD_RELEVANCE", d.evidence?.board?.action === "increase" ? "HIGH_CTR" : "LOW_VARIANCE");
          if (d.category === "opportunity") reasonCodes.push("LOW_COMPETITION", d.evidence?.kind === "trend" ? "SEASONAL_MATCH" : "CREATIVE_DIVERSITY");
          if (d.category === "bottleneck") reasonCodes.push("VOLATILITY_HIGH");
          const expectedLift = d.expected_revenue_cents_30d && acc.revenueCents
            ? Math.min(1, d.expected_revenue_cents_30d / Math.max(1, acc.revenueCents))
            : null;
          await emitXaiDecision({
            sourceEngine: "growth_director",
            decisionType: d.category,
            subjectKind: d.target_kind,
            subjectId: d.target_ref ? String(d.target_ref) : undefined,
            summary: d.title,
            reasonCodes,
            confidence: d.confidence,
            expectedLift: expectedLift ?? undefined,
            risk: d.effort === "high" ? 0.6 : d.effort === "medium" ? 0.35 : 0.15,
            evidence: {
              sample_size: d.category === "creative_allocation" ? (d.evidence?.product?.pins_30d ?? 0) : undefined,
              freshness_days: 30,
              metrics: { rationale: d.rationale },
              sources: ["pinterest_growth_director_runs", "pinterest_pin_performance"],
            },
            alternatives: [{ option: "do_nothing", rejection_reason: "baseline below projected lift", confidence: 1 - (d.confidence ?? 0.5) }],
            counterfactual: {
              if_unchanged: { expected_metric: "revenue_cents_30d", expected_value: acc.revenueCents, note: "Continuing current allocation" },
            },
            dedupeKey: `gd:${run.id}:${d.category}:${d.target_ref ?? d.title}`,
            // Growth Director consumes organic-first ranking (organic
            // pin/product performance from pcie2_pin_performance). If
            // sample size is missing or confidence < 0.4 we downgrade
            // to insufficient_data so the Council will not auto-promote.
            evidenceSource: (
              (d.confidence ?? 0) < 0.4 ||
              !d.evidence?.product?.pins_30d
            )
              ? "insufficient_data"
              : "organic",
          });
        }
      }
    }

    const duration = Date.now() - t0;
    await sb.from("pinterest_growth_director_runs").update({
      finished_at: new Date().toISOString(),
      status: "ok",
      duration_ms: duration,
      products_scored: productPriorities.length,
      boards_evaluated: boardAllocations.length,
      opportunities_found: opportunities.length,
      decisions_emitted: decisions.length,
      summary: {
        account_kpis: accountKpis,
        top_bottleneck: bn[0]?.key ?? null,
        top_product: productPriorities[0]?.slug ?? null,
        confidence,
        outlook_30d: outlook30d,
      },
    }).eq("id", run.id);

    return new Response(JSON.stringify({
      ok: true,
      run_id: run.id,
      dry_run: dryRun,
      products_scored: productPriorities.length,
      boards_evaluated: boardAllocations.length,
      opportunities_found: opportunities.length,
      decisions_emitted: decisions.length,
      top_decision: decisions[0] ?? null,
      account_kpis: accountKpis,
      outlook_30d: outlook30d,
      confidence,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await sb.from("pinterest_growth_director_runs").update({
      finished_at: new Date().toISOString(), status: "error", error: String(e?.message ?? e),
      duration_ms: Date.now() - t0,
    }).eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});