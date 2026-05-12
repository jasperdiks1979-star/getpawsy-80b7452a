import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pulls Pinterest analytics (impressions + outbound clicks) for active experiment variants
// linked to a published pinterest_pin_id and updates mi_experiment_variants.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const token = conn?.access_token;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "Pinterest not connected" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Active variants on running experiments
    const { data: variants, error: varErr } = await sb
      .from("mi_experiment_variants")
      .select("id, pin_queue_id, status, mi_experiments!inner(status)")
      .eq("status", "active")
      .not("pin_queue_id", "is", null)
      .eq("mi_experiments.status", "running")
      .limit(200);
    if (varErr) throw varErr;

    const pinIds = (variants ?? []).map((v: any) => v.pin_queue_id);
    const { data: pins } = await sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id")
      .in("id", pinIds.length ? pinIds : ["00000000-0000-0000-0000-000000000000"])
      .not("pinterest_pin_id", "is", null);
    const pinMap = new Map<string, string>();
    (pins ?? []).forEach((p: any) => pinMap.set(p.id, p.pinterest_pin_id));

    const apiBase = "https://api.pinterest.com/v5";
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const v of variants ?? []) {
      const pinId = pinMap.get((v as any).pin_queue_id);
      if (!pinId) { skipped++; continue; }
      try {
        const res = await fetch(
          `${apiBase}/pins/${pinId}/analytics?start_date=${startDate}&end_date=${today}&metric_types=IMPRESSION,OUTBOUND_CLICK`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) { errors.push({ pin_id: pinId, status: res.status }); continue; }
        const j = await res.json().catch(() => ({}));
        const m = j?.all?.summary_metrics || {};
        const impressions = Number(m.IMPRESSION || 0);
        const clicks = Number(m.OUTBOUND_CLICK || 0);

        if (!dryRun) {
          await sb.from("mi_experiment_variants")
            .update({ impressions, clicks })
            .eq("id", (v as any).id);
        }
        updated++;
      } catch (e: any) {
        errors.push({ variant_id: (v as any).id, message: e?.message });
      }
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Ingested analytics for ${updated} variants`,
      variants_scanned: (variants ?? []).length,
      updated, skipped, errors_count: errors.length,
      dry_run: dryRun,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[mi-experiment-ingest]", e);
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});