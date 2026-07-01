import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const STRIPE_KEY =
  Deno.env.get("STRIPE_SECRET_KEY") ??
  Deno.env.get("STRIPE_SECRET_KEY_LIVE") ??
  "";

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;

function traceId() {
  return crypto.randomUUID();
}

async function pingWebhook(): Promise<{
  reachable: boolean;
  status: number;
  signature_validation_active: boolean;
  ms: number;
  classification: "healthcheck_ok" | "signature_protection_active" | "unreachable" | "unexpected";
}> {
  const t0 = Date.now();
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
    // The webhook now returns 200 for the recognized healthcheck ping, and
    // 400 for any other unsigned request. Both prove signature protection.
    let classification: "healthcheck_ok" | "signature_protection_active" | "unreachable" | "unexpected" = "unexpected";
    if (res.status === 200 && parsed?.mode === "healthcheck") classification = "healthcheck_ok";
    else if (res.status === 400) classification = "signature_protection_active";
    return {
      reachable: true,
      status: res.status,
      signature_validation_active: res.status === 200 ? !!parsed?.signature_validation_active : res.status === 400,
      ms: Date.now() - t0,
      classification,
    };
  } catch {
    return {
      reachable: false,
      status: 0,
      signature_validation_active: false,
      ms: Date.now() - t0,
      classification: "unreachable",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tid = traceId();

  try {
    // Admin gate via anon client + user JWT
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(
        JSON.stringify({ ok: false, traceId: tid, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: role } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(
        JSON.stringify({ ok: false, traceId: tid, message: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Last 30 days of orders
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await admin
      .from("orders")
      .select("id,status,total_amount,currency,created_at,stripe_session_id,stripe_payment_intent_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    const list = orders ?? [];
    const paid = list.filter((o) => o.status === "paid");
    const pending = list.filter((o) => o.status === "pending");
    const lastPaid = paid[0] ?? null;

    // Stripe-side: recent checkout.session.completed + failed events
    let stripeEvents: Array<{
      id: string;
      type: string;
      created: number;
      pending_webhooks: number;
    }> = [];
    let stripeError: string | null = null;
    if (STRIPE_KEY) {
      try {
        const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-08-27.basil" });
        const evs = await stripe.events.list({
          limit: 20,
          types: [
            "checkout.session.completed",
            "checkout.session.expired",
            "payment_intent.succeeded",
            "payment_intent.payment_failed",
          ],
        });
        stripeEvents = evs.data.map((e) => ({
          id: e.id,
          type: e.type,
          created: e.created,
          pending_webhooks: e.pending_webhooks ?? 0,
        }));
      } catch (e) {
        stripeError = (e as Error).message;
      }
    }

    const ping = await pingWebhook();

    const healthy =
      ping.reachable &&
      ping.signature_validation_active &&
      (ping.classification === "healthcheck_ok" || ping.classification === "signature_protection_active") &&
      stripeEvents.every((e) => e.pending_webhooks === 0);

    return new Response(
      JSON.stringify({
        ok: true,
        traceId: tid,
        message: healthy ? "Webhook healthy" : "Webhook needs attention",
        healthy,
        endpoint: WEBHOOK_URL,
        ping,
        orders_30d: {
          total: list.length,
          paid: paid.length,
          pending: pending.length,
          last_paid_at: lastPaid?.created_at ?? null,
          last_paid_id: lastPaid?.id ?? null,
          last_paid_amount: lastPaid?.total_amount ?? null,
          last_paid_currency: lastPaid?.currency ?? null,
        },
        stripe_events: stripeEvents,
        stripe_error: stripeError,
        recent_orders: list.slice(0, 25),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        traceId: tid,
        message: (e as Error).message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});