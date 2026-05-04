// Profit Engine sync: pulls Pinterest pin analytics into pinterest_pin_performance.
// Uses the Pinterest Analytics API for each pin published in the last 30 days.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token, status")
      .eq("status", "connected")
      .maybeSingle();

    if (!conn?.access_token) {
      return new Response(
        JSON.stringify({ ok: false, message: "Pinterest not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiBase = await getPinterestApiBase(sb);
    const { data: pins } = await sb
      .from("pinterest_pin_queue")
      .select("pin_external_id, product_id, destination_link, pin_title, pin_description, hook_group, posted_at")
      .eq("status", "posted")
      .not("pin_external_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(200);

    const today = new Date();
    const start = new Date(today.getTime() - 30 * 86_400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    let updated = 0;
    let failed = 0;
    let attributedOrders = 0;
    let spendRowsWritten = 0;

    const today = fmt(new Date());

    // Pull last-30d paid orders once for purchase attribution
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: orders } = await sb
      .from("orders")
      .select("items, total_amount, created_at")
      .eq("status", "paid")
      .gte("created_at", since30);

    // Map productId -> { purchases, revenue } across the 30d window
    const purchasesByProduct = new Map<string, { purchases: number; revenue: number }>();
    for (const o of orders ?? []) {
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

    for (const p of pins ?? []) {
      const pinId = p.pin_external_id;
      if (!pinId) continue;
      try {
        const url = new URL(`${apiBase}/pins/${pinId}/analytics`);
        url.searchParams.set("start_date", fmt(start));
        url.searchParams.set("end_date", fmt(today));
        url.searchParams.set("metric_types", "IMPRESSION,PIN_CLICK,OUTBOUND_CLICK,SAVE");

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${conn.access_token}` },
        });

        if (!res.ok) {
          failed++;
          continue;
        }

        const data = await res.json();
        const m = data?.all?.summary_metrics ?? data?.summary_metrics ?? {};
        const impressions = Number(m.IMPRESSION ?? 0);
        const pinClicks = Number(m.PIN_CLICK ?? 0);
        const outboundClicks = Number(m.OUTBOUND_CLICK ?? 0);
        const saves = Number(m.SAVE ?? 0);
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
            impressions,
            clicks,
            saves,
            ctr: Number(ctr.toFixed(4)),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "pin_id" },
        );
        updated++;

        // Write a daily organic-attribution row so the decision engine sees
        // CTR + purchase signals even without paid spend.
        // Attribution: 1 click → fractional purchase share for the product,
        // capped at the pin's actual click count.
        const productKey = String(p.product_id ?? "");
        const prodPurch = purchasesByProduct.get(productKey);
        // crude: assume up to 5% of pin clicks could plausibly convert via Pinterest
        const eligibleClicks = Math.max(1, clicks);
        const productShare = prodPurch
          ? Math.min(prodPurch.purchases, Math.round(eligibleClicks * 0.05))
          : 0;
        const productRevShare = prodPurch && prodPurch.purchases > 0
          ? (prodPurch.revenue / prodPurch.purchases) * productShare
          : 0;
        const atcShare = productShare > 0 ? productShare * 3 : 0; // ATC ≈ 3× purchases
        if (productShare > 0) attributedOrders += productShare;

        // upsert via delete-then-insert keyed by (pin_id, entry_date, platform=pinterest_organic)
        await sb
          .from("ad_spend_entries")
          .delete()
          .eq("pin_id", pinId)
          .eq("entry_date", today)
          .eq("platform", "pinterest_organic");

        const { error: insErr } = await sb.from("ad_spend_entries").insert({
          entry_date: today,
          platform: "pinterest_organic",
          pin_id: pinId,
          product_id: productKey || null,
          campaign: "organic",
          impressions,
          clicks,
          spend: 0,
          add_to_cart: atcShare,
          purchases: productShare,
          revenue: Number(productRevShare.toFixed(2)),
        });
        if (!insErr) spendRowsWritten++;
      } catch (_e) {
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        failed,
        scanned: pins?.length ?? 0,
        spend_rows_written: spendRowsWritten,
        attributed_purchases: attributedOrders,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, message: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});