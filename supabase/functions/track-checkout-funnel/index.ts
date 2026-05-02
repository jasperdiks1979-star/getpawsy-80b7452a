// Lightweight server-side ingest for checkout-funnel events.
// Frontend calls this with one event at a time (begin_checkout,
// klarna_message_shown, klarna_proceed, etc). The function persists it
// in checkout_funnel_events so the admin can compute funnel drop-off.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_STEPS = new Set([
  "begin_checkout",
  "klarna_message_shown",
  "klarna_proceed",
  "stripe_redirect",
  "complete_payment",
  "klarna_purchase",
  "checkout_abandoned",
]);

interface Body {
  step?: string;
  sessionId?: string;
  stripeSessionId?: string;
  value?: number;
  currency?: string;
  paymentMethod?: string;
  isKlarna?: boolean;
  metadata?: Record<string, unknown>;
}

function trace(): string {
  return `cfe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = trace();

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body: Body = await req.json().catch(() => ({}));
    const step = (body.step || "").trim();
    if (!step || !ALLOWED_STEPS.has(step)) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: `Invalid step '${step}'` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Try to resolve user from auth header (optional).
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const anon = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      );
      const { data } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data.user?.id ?? null;
    }

    const { error } = await admin.from("checkout_funnel_events").insert({
      step,
      session_id: body.sessionId ?? null,
      stripe_session_id: body.stripeSessionId ?? null,
      user_id: userId,
      value: typeof body.value === "number" ? body.value : null,
      currency: (body.currency || "usd").toLowerCase(),
      payment_method: body.paymentMethod ?? null,
      is_klarna: !!body.isKlarna,
      metadata: body.metadata ?? {},
      source: "client",
    });

    if (error) {
      console.error("[track-checkout-funnel]", traceId, error);
      return new Response(
        JSON.stringify({ ok: false, traceId, message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, traceId, message: "ok" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
