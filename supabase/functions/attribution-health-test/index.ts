import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fires a synthetic Pinterest-attributed funnel into gi_attribution_events so
// the Attribution Health widget can verify the pipeline end-to-end without
// requiring real Pinterest traffic. Each event is tagged meta.test=true so it
// is trivially filterable / removable.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mode = String((body as { mode?: string }).mode ?? "run");

    if (mode === "cleanup") {
      const { error, count } = await sb
        .from("gi_attribution_events")
        .delete({ count: "exact" })
        .contains("meta", { test: true });
      if (error) throw error;
      return new Response(
        JSON.stringify({ ok: true, traceId, deleted: count ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sessionId = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const steps: Array<{ type: string; revenue?: number }> = [
      { type: "view" },
      { type: "add_to_cart" },
      { type: "checkout" },
      { type: "purchase", revenue: 4999 },
    ];

    const rows = steps.map((s, i) => ({
      session_id: sessionId,
      event_type: s.type,
      occurred_at: new Date(now + i * 1000).toISOString(),
      product_slug: "test-product",
      revenue_cents: s.revenue ?? 0,
      meta: {
        source: "pinterest",
        test: true,
        pin_id: "test-pin",
        board_id: "test-board",
        traceId,
      },
    }));

    const { error } = await sb.from("gi_attribution_events").insert(rows);
    if (error) throw error;

    // Re-read what we just inserted so the caller sees authoritative state.
    const { data: verify } = await sb
      .from("gi_attribution_events")
      .select("event_type,occurred_at,revenue_cents")
      .eq("session_id", sessionId)
      .order("occurred_at", { ascending: true });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        sessionId,
        inserted: rows.length,
        verified: verify ?? [],
        message: "Synthetic Pinterest funnel inserted into gi_attribution_events",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});