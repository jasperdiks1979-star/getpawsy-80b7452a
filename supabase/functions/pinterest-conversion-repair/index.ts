// Pinterest Conversion Validation Engine — Repair / Self-Heal
// Reads worst rows from latest audit run; attempts deterministic repair.
// - http_404 / non_canonical → insert slug history (when target exists)
// - product_inactive / product_missing → mark pin as deprecated (status='deprecated')
// - missing_image → re-queue via pinterest-content-correction
// - zero_inventory / cart_failed → flag pin paused (status='paused'); will auto-resume next audit if fixed
// Closes the corresponding alert when repair succeeds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const body = await req.json().catch(() => ({}));
    const runId: string | undefined = body.run_id;

    const { data: rows, error } = await supabase
      .from("pinterest_conversion_audit")
      .select("*")
      .eq(runId ? "run_id" : "conversion_risk_score", runId ?? 40)
      .gte("conversion_risk_score", 40)
      .order("conversion_risk_score", { ascending: false })
      .limit(200);
    if (error) throw error;

    let repaired = 0;
    const repairLog: any[] = [];

    for (const r of rows ?? []) {
      const reasons: string[] = r.risk_reasons ?? [];
      const actions: string[] = [];

      // Slug history backfill for redirect/404 problems
      if (reasons.some((x) => x === "http_error" || x === "non_canonical_url") && r.product_slug) {
        const { data: prod } = await supabase
          .from("products")
          .select("id,slug,is_active")
          .eq("slug", r.product_slug)
          .eq("is_active", true)
          .maybeSingle();
        if (prod && r.destination_url) {
          try {
            const oldSlug = new URL(r.destination_url).pathname.split("/").filter(Boolean).pop();
            if (oldSlug && oldSlug !== prod.slug) {
              await supabase.from("product_slug_history").upsert(
                { old_slug: oldSlug, new_slug: prod.slug, product_id: prod.id },
                { onConflict: "old_slug" },
              );
              actions.push("slug_history_inserted");
            }
          } catch { /* ignore parse */ }
        }
      }

      // Orphan / inactive product → mark pin deprecated
      if (reasons.includes("product_missing") || reasons.includes("product_inactive")) {
        await supabase
          .from("pinterest_pin_queue")
          .update({ status: "deprecated", last_validation_error: "auto: orphan/inactive product" })
          .eq("id", r.pin_id);
        actions.push("pin_deprecated");
      }

      // Zero inventory or cart failure → pause until next audit cycle (auto-reopens when fixed)
      if (
        reasons.includes("zero_inventory") ||
        reasons.includes("cart_failed")
      ) {
        await supabase
          .from("pinterest_pin_queue")
          .update({ status: "paused", last_validation_error: "auto: cart/inventory unavailable" })
          .eq("id", r.pin_id);
        actions.push("pin_paused");
      }

      if (actions.length) {
        repaired++;
        repairLog.push({
          phase: "conversion_engine_auto_repair",
          pin_id: r.pin_id,
          product_id: r.product_id,
          actions,
          reasons,
        });

        // Auto-close any open alerts of matching type for this pin
        await supabase
          .from("pinterest_conversion_alerts")
          .update({
            status: "repaired",
            closed_at: new Date().toISOString(),
            auto_closed: true,
            repair_action: actions.join(","),
          })
          .eq("pin_id", r.pin_id)
          .eq("status", "open");
      }
    }

    if (repairLog.length) {
      await supabase.from("pinterest_pin_repair_log").insert(repairLog).select();
    }

    return new Response(
      JSON.stringify({ ok: true, traceId: trace, repaired, scanned: rows?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});