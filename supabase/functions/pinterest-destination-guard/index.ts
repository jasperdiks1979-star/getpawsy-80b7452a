import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Pinterest Destination Guard
 *
 * mode=sweep  → run pinterest_guard_sweep() (retire banned products + cancel ineligible queue)
 * mode=audit  → run pinterest_guard_audit() (read-only counts)
 * default     → sweep then audit, return both
 *
 * Invokes the SECURITY DEFINER DB functions using the service role, so RLS is bypassed safely.
 * Stripe / payments / orders / GA4 / Pinterest publisher cron are NOT touched.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "both";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let sweep: unknown = null;
    let audit: unknown = null;

    if (mode === "sweep" || mode === "both") {
      const { data, error } = await supabase.rpc("pinterest_guard_sweep");
      if (error) throw new Error(`sweep_failed: ${error.message}`);
      sweep = data;
    }
    if (mode === "audit" || mode === "both") {
      const { data, error } = await supabase.rpc("pinterest_guard_audit");
      if (error) throw new Error(`audit_failed: ${error.message}`);
      audit = data;
    }

    return new Response(
      JSON.stringify({ ok: true, traceId, message: "guard_complete", sweep, audit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});