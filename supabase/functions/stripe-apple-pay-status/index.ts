/**
 * stripe-apple-pay-status
 *
 * Checks the current Apple Pay (and Google Pay / Link) registration status
 * for getpawsy.pet via Stripe's Payment Method Domains API.
 *
 * Also exposes:
 *  - `register`  — create a new payment method domain entry
 *  - `validate`  — re-trigger Stripe's domain validation (re-fetches the
 *                  /.well-known/apple-developer-merchantid-domain-association
 *                  file Stripe hosts on your behalf)
 *
 * Used by the admin Apple Pay Domain Verification panel.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TARGET_DOMAIN = "getpawsy.pet";

type Action = "status" | "register" | "validate";

interface RequestBody {
  action?: Action;
  domain?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let body: RequestBody = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    const action: Action = body.action ?? "status";
    const domain = (body.domain ?? TARGET_DOMAIN).toLowerCase().trim();

    // 1. Find existing payment method domain (if any) by listing
    const list = await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 });
    let pmd = list.data[0];

    if (action === "register") {
      if (!pmd) {
        pmd = await stripe.paymentMethodDomains.create({
          domain_name: domain,
          enabled: true,
        });
      } else if (!pmd.enabled) {
        pmd = await stripe.paymentMethodDomains.update(pmd.id, { enabled: true });
      }
    }

    if (action === "validate") {
      if (!pmd) {
        // Auto-create then validate so a single click works end-to-end
        pmd = await stripe.paymentMethodDomains.create({
          domain_name: domain,
          enabled: true,
        });
      }
      pmd = await stripe.paymentMethodDomains.validate(pmd.id);
    }

    const summary = pmd
      ? {
          id: pmd.id,
          domain: pmd.domain_name,
          enabled: pmd.enabled,
          livemode: pmd.livemode,
          apple_pay: pmd.apple_pay
            ? {
                status: pmd.apple_pay.status,
                status_details: pmd.apple_pay.status_details ?? null,
              }
            : null,
          google_pay: pmd.google_pay
            ? {
                status: pmd.google_pay.status,
                status_details: pmd.google_pay.status_details ?? null,
              }
            : null,
          link: pmd.link
            ? {
                status: pmd.link.status,
                status_details: pmd.link.status_details ?? null,
              }
            : null,
          paypal: pmd.paypal
            ? {
                status: pmd.paypal.status,
                status_details: pmd.paypal.status_details ?? null,
              }
            : null,
        }
      : null;

    return new Response(
      JSON.stringify({
        ok: true,
        domain,
        registered: Boolean(pmd),
        summary,
        well_known_url: `https://${domain}/.well-known/apple-developer-merchantid-domain-association`,
        action_executed: action,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[STRIPE-APPLE-PAY-STATUS] Error:", errorMessage);
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
