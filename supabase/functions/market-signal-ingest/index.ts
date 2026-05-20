import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * market-signal-ingest
 * Pulls lightweight signals from enabled sources and stores snapshots.
 * Phase 8a: scaffolds internal-source ingest + placeholder marketplace/social
 * collectors. Real scrapers come in 8b.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: sources } = await sb
      .from("market_signal_sources")
      .select("id,name,kind,enabled")
      .eq("enabled", true);

    let captured = 0;
    const failures: Array<{ source: string; error: string }> = [];

    for (const src of sources ?? []) {
      try {
        let payload: Record<string, unknown> = {};

        if (src.name === "internal") {
          // Aggregate GetPawsy internal performance signals (last 24h)
          const since = new Date(Date.now() - 24 * 3600_000).toISOString();
          const [{ count: visits }, { count: outbound }, { data: topPins }] = await Promise.all([
            sb.from("visitor_events").select("id", { count: "exact", head: true }).gte("created_at", since),
            sb.from("visitor_events").select("id", { count: "exact", head: true })
              .eq("event_type", "outbound_click").gte("created_at", since),
            sb.from("pinterest_pin_performance").select("product_id,saves,clicks,impressions")
              .gte("created_at", since).limit(50),
          ]);
          payload = { visits: visits ?? 0, outbound: outbound ?? 0, top_pins: topPins ?? [] };
        } else {
          // Marketplace/social placeholder — real collectors land in 8b.
          payload = { placeholder: true, source: src.name, note: "Collector pending (Phase 8b)" };
        }

        const hash = await sha256(JSON.stringify(payload));
        await sb.from("market_signal_snapshots").insert({
          source_id: src.id, payload, hash,
        });
        await sb.from("market_signal_sources").update({
          last_run_at: new Date().toISOString(),
          last_status: "ok",
        }).eq("id", src.id);
        captured++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ source: src.name, error: msg });
        await sb.from("market_signal_failures").insert({
          source_id: src.id, error: msg, retry_count: 0,
          next_retry_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        });
        await sb.from("market_signal_sources").update({
          last_run_at: new Date().toISOString(),
          last_status: "error",
        }).eq("id", src.id);
      }
    }

    await sb.from("market_signal_logs").insert({
      trace_id: traceId, level: failures.length ? "warn" : "info",
      message: `Ingest run: ${captured} captured, ${failures.length} failed`,
      payload: { captured, failures },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, captured, failures: failures.length, message: `Captured ${captured} sources` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}