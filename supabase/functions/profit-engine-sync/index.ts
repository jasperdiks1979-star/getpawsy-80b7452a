// Profit Engine sync — pulls Pinterest analytics for posted pins, attributes
// US-only organic conversions, and writes daily signal rows. Always returns
// JSON (HTTP 200) so the client never sees a transport error.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const FN = "profit-engine-sync";
const VERSION = "2.0.0";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logPhase(sb: any, trace_id: string, phase: string, level: string, message: string, payload: unknown = null, extra: Record<string, unknown> = {}) {
  try {
    await sb.from("profit_engine_function_logs").insert({
      trace_id, function_name: FN, phase, level, message,
      payload: payload as any, ...extra,
    });
  } catch (e) {
    console.error(`[${FN} ${trace_id}] log insert failed`, e);
  }
}

serve(async (req) => {
  const trace_id = crypto.randomUUID();
  const t0 = Date.now();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Always create the admin client first; we need it to log diagnostics.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return jsonResp({ ok: false, code: "ENV_MISSING", phase: "boot", traceId: trace_id, message: "SUPABASE env vars missing" });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // ── Phase: auth ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      await logPhase(sb, trace_id, "auth", "warn", "missing bearer");
      return jsonResp({ ok: false, code: "UNAUTHENTICATED", phase: "auth", traceId: trace_id, message: "Missing Authorization: Bearer <jwt>" });
    }
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user) {
      await logPhase(sb, trace_id, "auth", "warn", "invalid token", { error: userErr?.message });
      return jsonResp({ ok: false, code: "UNAUTHENTICATED", phase: "auth", traceId: trace_id, message: userErr?.message || "Invalid JWT" });
    }
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      await logPhase(sb, trace_id, "auth", "warn", "not admin", { user_id: user.id });
      return jsonResp({ ok: false, code: "FORBIDDEN", phase: "auth", traceId: trace_id, message: "Admin role required" });
    }
    await logPhase(sb, trace_id, "auth", "info", "admin verified", { user_id: user.id });

    // ── Phase: fetch_analytics ─────────────────────────────────────
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token, status")
      .eq("status", "connected")
      .maybeSingle();

    let scoringSource: "pinterest+orders" | "orders_only" = "pinterest+orders";
    if (!conn?.access_token) {
      scoringSource = "orders_only";
      await logPhase(sb, trace_id, "fetch_analytics", "warn", "Pinterest not connected — using orders-only fallback");
    }

    const apiBase = await getPinterestApiBase(sb);
    const { data: pins } = await sb
      .from("pinterest_pin_queue")
      .select("pin_external_id, product_id, destination_link, pin_title, pin_description, hook_group, posted_at")
      .eq("status", "posted")
      .not("pin_external_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(200);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const todayStr = fmt(new Date());
    const startStr = fmt(new Date(Date.now() - 30 * 86_400_000));
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    // ── Phase: normalize (US-only paid orders for attribution) ─────
    const { data: orders } = await sb
      .from("orders")
      .select("items, total_amount, created_at, shipping_address, billing_address, country")
      .eq("status", "paid")
      .gte("created_at", since30);

    const isUsOrder = (o: any): boolean => {
      const c1 = (o?.country || "").toString().toUpperCase();
      const c2 = (o?.shipping_address?.country || o?.billing_address?.country || "").toString().toUpperCase();
      const country = c1 || c2;
      if (!country) return false;
      return country === "US" || country === "USA" || country === "UNITED STATES";
    };

    const purchasesByProduct = new Map<string, { purchases: number; revenue: number }>();
    for (const o of orders ?? []) {
      if (!isUsOrder(o)) continue;
      const items = Array.isArray((o as any).items) ? (o as any).items : [];
      const orderTotal = Number((o as any).total_amount ?? 0);
      const lineCount = items.length || 1;
      const perLine = orderTotal / lineCount;
      for (const it of items) {
        const pid = String(it?.product_id ?? it?.id ?? "");
        if (!pid) continue;
        const cur = purchasesByProduct.get(pid) ?? { purchases: 0, revenue: 0 };
        cur.purchases += Number(it?.quantity ?? 1);
        cur.revenue += perLine;
        purchasesByProduct.set(pid, cur);
      }
    }
    await logPhase(sb, trace_id, "normalize", "info", "us-only orders normalized",
      { us_products: purchasesByProduct.size, total_orders: orders?.length ?? 0 });

    // ── Phase: compute_scores + write ──────────────────────────────
    let updated = 0, failed = 0, attributedOrders = 0, spendRowsWritten = 0;
    const FETCH_TIMEOUT_MS = 10_000;

    for (const p of pins ?? []) {
      const pinId = p.pin_external_id;
      if (!pinId) continue;

      let impressions = 0, pinClicks = 0, outboundClicks = 0, saves = 0;
      if (conn?.access_token) {
        try {
          const url = new URL(`${apiBase}/pins/${pinId}/analytics`);
          url.searchParams.set("start_date", startStr);
          url.searchParams.set("end_date", todayStr);
          url.searchParams.set("metric_types", "IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE");
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${conn.access_token}` },
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!res.ok) { failed++; continue; }
          const data = await res.json();
          const m = data?.all?.summary_metrics ?? data?.summary_metrics ?? {};
          impressions = Number(m.IMPRESSION ?? 0);
          pinClicks = Number(m.PIN_CLICK ?? 0);
          outboundClicks = Number(m.OUTBOUND_CLICK ?? 0);
          saves = Number(m.SAVE ?? 0);
        } catch (_e) { failed++; continue; }
      }

      const clicks = outboundClicks || pinClicks;
      const ctr = impressions > 0 ? Math.min(1, clicks / impressions) : 0;

      await sb.from("pinterest_pin_performance").upsert(
        {
          pin_id: pinId,
          product_id: String(p.product_id ?? ""),
          product_url: p.destination_link ?? null,
          pin_title: p.pin_title ?? null,
          pin_description: p.pin_description ?? null,
          hook_angle: p.hook_group ?? null,
          impressions, clicks, saves,
          ctr: Number(ctr.toFixed(4)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "pin_id" },
      );
      updated++;

      const productKey = String(p.product_id ?? "");
      const prodPurch = purchasesByProduct.get(productKey);
      const eligibleClicks = Math.max(1, clicks);
      const productShare = prodPurch
        ? Math.min(prodPurch.purchases, Math.round(eligibleClicks * 0.05))
        : 0;
      const productRevShare = prodPurch && prodPurch.purchases > 0
        ? (prodPurch.revenue / prodPurch.purchases) * productShare
        : 0;
      const atcShare = productShare > 0 ? productShare * 3 : 0;
      if (productShare > 0) attributedOrders += productShare;

      await sb.from("ad_spend_entries")
        .delete()
        .eq("pin_id", pinId)
        .eq("entry_date", todayStr)
        .eq("platform", "pinterest_organic");

      const { error: insErr } = await sb.from("ad_spend_entries").insert({
        entry_date: todayStr,
        platform: "pinterest_organic",
        pin_id: pinId,
        product_id: productKey || null,
        campaign: "organic",
        impressions, clicks, spend: 0,
        add_to_cart: atcShare,
        purchases: productShare,
        revenue: Number(productRevShare.toFixed(2)),
      });
      if (!insErr) spendRowsWritten++;
    }

    const duration = Date.now() - t0;
    await logPhase(sb, trace_id, "done", "info", "sync completed",
      { updated, failed, scanned: pins?.length ?? 0, spend_rows_written: spendRowsWritten, attributed_purchases: attributedOrders },
      { duration_ms: duration, rows_processed: updated, scoring_source: scoringSource });

    return jsonResp({
      ok: true,
      traceId: trace_id,
      duration_ms: duration,
      scoring_source: scoringSource,
      updated, failed,
      scanned: pins?.length ?? 0,
      spend_rows_written: spendRowsWritten,
      attributed_purchases: attributedOrders,
    });
  } catch (e) {
    const err = e as Error;
    console.error(`[${FN} ${trace_id}] fatal`, err);
    try {
      await logPhase(sb, trace_id, "fatal", "error", err?.message || "fatal",
        { stack: err?.stack?.slice(0, 800) }, { duration_ms: Date.now() - t0 });
    } catch (_) {}
    return jsonResp({
      ok: false,
      code: "INTERNAL_ERROR",
      phase: "fatal",
      traceId: trace_id,
      message: err?.message || String(e),
      stack: err?.stack?.slice(0, 400),
    });
  }
});
