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
      } catch (_e) {
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, updated, failed, scanned: pins?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, message: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});