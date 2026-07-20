// Evolution Engine — Learning Ingest (Phase 1)
// Reads from existing analytics/order tables; writes only to ee_* tables.
// Read-only on production tables. Safe to invoke ad-hoc or nightly.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t0 = Date.now();
  const { data: runRow } = await sb
    .from("ee_runs")
    .insert({ kind: "learning_ingest", status: "running", triggered_by: "edge" })
    .select()
    .single();
  const runId = runRow?.id as string | undefined;

  async function step(name: string, fn: () => Promise<unknown>) {
    const s0 = Date.now();
    try {
      const payload = await fn();
      await sb.from("ee_run_steps").insert({ run_id: runId, step: name, status: "ok", duration_ms: Date.now() - s0, payload: (payload ?? {}) as object });
      return payload;
    } catch (e) {
      await sb.from("ee_run_steps").insert({ run_id: runId, step: name, status: "error", duration_ms: Date.now() - s0, error: String((e as Error)?.message ?? e) });
      throw e;
    }
  }

  const stats: Record<string, number> = { history: 0, events: 0, vectors: 0, products: 0, boards: 0 };

  try {
    // 1. Ingest pinterest pin performance into ee_learning_history
    await step("ingest_history", async () => {
      const { data: rows } = await sb
        .from("pinterest_pin_performance")
        .select("pin_id, product_id, board_id, impressions, saves, outbound_clicks, ctr, engagement, revenue, purchases, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!rows || rows.length === 0) return { rows: 0 };
      const today = new Date().toISOString().slice(0, 10);
      const upserts = rows.map((r: any) => ({
        pin_id: String(r.pin_id ?? ""),
        product_id: r.product_id ?? null,
        board_id: r.board_id ?? null,
        snapshot_date: today,
        impressions: Number(r.impressions ?? 0),
        saves: Number(r.saves ?? 0),
        outbound_clicks: Number(r.outbound_clicks ?? 0),
        ctr: r.ctr ?? null,
        engagement: r.engagement ?? null,
        purchases: Number(r.purchases ?? 0),
        revenue: Number(r.revenue ?? 0),
        raw: r,
      })).filter((u: any) => u.pin_id);
      if (upserts.length === 0) return { rows: 0 };
      const { error } = await sb.from("ee_learning_history").upsert(upserts, { onConflict: "pin_id,snapshot_date" });
      if (error) throw error;
      stats.history = upserts.length;
      return { rows: upserts.length };
    });

    // 2. Product rollups
    await step("product_rollups", async () => {
      const { data } = await sb
        .from("ee_learning_history")
        .select("product_id, impressions, saves, outbound_clicks, purchases, revenue, ctr")
        .not("product_id", "is", null);
      const agg = new Map<string, any>();
      for (const r of (data ?? []) as any[]) {
        const k = r.product_id as string;
        const v = agg.get(k) ?? { pins_count: 0, impressions_total: 0, saves_total: 0, outbound_total: 0, purchases_total: 0, revenue_total: 0, ctrs: [] };
        v.pins_count += 1;
        v.impressions_total += Number(r.impressions ?? 0);
        v.saves_total += Number(r.saves ?? 0);
        v.outbound_total += Number(r.outbound_clicks ?? 0);
        v.purchases_total += Number(r.purchases ?? 0);
        v.revenue_total += Number(r.revenue ?? 0);
        if (r.ctr != null) v.ctrs.push(Number(r.ctr));
        agg.set(k, v);
      }
      const rows = Array.from(agg.entries()).map(([product_id, v]: any) => {
        const avg_ctr = v.ctrs.length ? v.ctrs.reduce((a: number, b: number) => a + b, 0) / v.ctrs.length : null;
        const popularity_score = Math.min(1, (v.impressions_total + v.saves_total * 5 + v.outbound_total * 10) / 10000);
        const pinterest_fit_score = Math.min(1, (v.saves_total + v.outbound_total) / Math.max(v.impressions_total, 1) * 50);
        const composite_score = 0.4 * popularity_score + 0.3 * pinterest_fit_score + 0.3 * Math.min(1, v.revenue_total / 500);
        return { product_id, pins_count: v.pins_count, impressions_total: v.impressions_total, saves_total: v.saves_total, outbound_total: v.outbound_total, purchases_total: v.purchases_total, revenue_total: v.revenue_total, avg_ctr, popularity_score, pinterest_fit_score, composite_score };
      });
      if (rows.length === 0) return { rows: 0 };
      const { error } = await sb.from("ee_learning_products").upsert(rows, { onConflict: "product_id" });
      if (error) throw error;
      stats.products = rows.length;
      return { rows: rows.length };
    });

    // 3. Board rollups
    await step("board_rollups", async () => {
      const { data } = await sb
        .from("ee_learning_history")
        .select("board_id, impressions, saves, outbound_clicks, purchases, revenue, ctr")
        .not("board_id", "is", null);
      const agg = new Map<string, any>();
      for (const r of (data ?? []) as any[]) {
        const k = r.board_id as string;
        const v = agg.get(k) ?? { pins_count: 0, impressions_total: 0, saves_total: 0, outbound_total: 0, purchases_total: 0, revenue_total: 0, ctrs: [] };
        v.pins_count += 1;
        v.impressions_total += Number(r.impressions ?? 0);
        v.saves_total += Number(r.saves ?? 0);
        v.outbound_total += Number(r.outbound_clicks ?? 0);
        v.purchases_total += Number(r.purchases ?? 0);
        v.revenue_total += Number(r.revenue ?? 0);
        if (r.ctr != null) v.ctrs.push(Number(r.ctr));
        agg.set(k, v);
      }
      const rows = Array.from(agg.entries()).map(([board_id, v]: any) => {
        const avg_ctr = v.ctrs.length ? v.ctrs.reduce((a: number, b: number) => a + b, 0) / v.ctrs.length : null;
        const composite_score = Math.min(1, (v.outbound_total * 5 + v.saves_total) / Math.max(v.impressions_total, 1) * 25);
        return { board_id, pins_count: v.pins_count, impressions_total: v.impressions_total, saves_total: v.saves_total, outbound_total: v.outbound_total, purchases_total: v.purchases_total, revenue_total: v.revenue_total, avg_ctr, composite_score };
      });
      if (rows.length === 0) return { rows: 0 };
      const { error } = await sb.from("ee_learning_boards").upsert(rows, { onConflict: "board_id" });
      if (error) throw error;
      stats.boards = rows.length;
      return { rows: rows.length };
    });

    // 4. Per-pin feature vectors
    await step("feature_vectors", async () => {
      const { data } = await sb
        .from("ee_learning_history")
        .select("pin_id, product_id, board_id, impressions, saves, outbound_clicks, ctr, revenue, purchases, snapshot_date");
      const rows = (data ?? []).map((r: any) => {
        const impr = Math.max(1, Number(r.impressions ?? 0));
        const ctr_score = Math.min(1, Number(r.ctr ?? (r.outbound_clicks / impr)) * 50);
        const save_score = Math.min(1, (Number(r.saves ?? 0) / impr) * 100);
        const purchase_score = Math.min(1, Number(r.purchases ?? 0) / 5);
        const novelty_score = 0.5;
        const trust_score = 0.7;
        const spam_score = 0.0;
        const freshness_score = 1.0;
        const composite_score = 0.35 * ctr_score + 0.2 * save_score + 0.25 * purchase_score + 0.1 * novelty_score + 0.1 * trust_score - 0.2 * spam_score;
        const d = r.snapshot_date ? new Date(r.snapshot_date) : new Date();
        return {
          pin_id: r.pin_id,
          product_id: r.product_id ?? null,
          board_id: r.board_id ?? null,
          hour_bucket: d.getUTCHours(),
          weekday: d.getUTCDay(),
          ctr_score, save_score, purchase_score, trust_score, novelty_score, spam_score, freshness_score, composite_score,
          features: { impressions: impr, saves: r.saves, outbound: r.outbound_clicks, purchases: r.purchases, revenue: r.revenue },
        };
      }).filter((r: any) => r.pin_id);
      if (rows.length === 0) return { rows: 0 };
      const { error } = await sb.from("ee_learning_vectors").upsert(rows, { onConflict: "pin_id" });
      if (error) throw error;
      stats.vectors = rows.length;
      return { rows: rows.length };
    });

    await sb.from("ee_runs").update({ status: "ok", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: true, runId, stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = (e as Error)?.message ?? String(e);
    await sb.from("ee_runs").update({ status: "error", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, error: err, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: err, stats }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});