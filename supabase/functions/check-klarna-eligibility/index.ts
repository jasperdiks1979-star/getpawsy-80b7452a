import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Klarna-supported buyer countries (ISO-3166-1 alpha-2).
// Source: https://docs.stripe.com/payments/klarna
const KLARNA_COUNTRIES = new Set([
  "US", "GB", "AU", "NZ", "CA",
  "AT", "BE", "CH", "CZ", "DE", "DK", "ES", "FI", "FR", "GR",
  "IE", "IT", "NL", "NO", "PL", "PT", "SE",
]);

// Cache the account-level Klarna capability for the lifetime of the worker.
let cachedAccountEnabled: boolean | null = null;

async function isKlarnaEnabledOnAccount(stripe: Stripe): Promise<boolean> {
  if (cachedAccountEnabled !== null) return cachedAccountEnabled;
  try {
    // Try the default payment-method configuration first.
    const list = await stripe.paymentMethodConfigurations.list({ limit: 5 });
    const cfg = list.data.find((c: any) => c.is_default) || list.data[0];
    const klarna = (cfg as any)?.klarna;
    if (klarna && klarna.display_preference?.value !== "off" && klarna.available !== false) {
      cachedAccountEnabled = true;
      return true;
    }
    // Fallback: account capabilities.
    const account = await stripe.accounts.retrieve();
    cachedAccountEnabled = (account as any)?.capabilities?.klarna_payments === "active";
    return cachedAccountEnabled;
  } catch (_e) {
    cachedAccountEnabled = false;
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const { amount, currency = "usd", country } = await req.json().catch(() => ({}));
    const amountNum = Number(amount);
    const cur = String(currency).toLowerCase();
    const ctry = country ? String(country).toUpperCase() : null;

    // Hard eligibility rules — fast path before hitting Stripe.
    // Klarna US: min ~$1, max ~$10,000.
    if (!Number.isFinite(amountNum) || amountNum < 35 || amountNum > 10000) {
      return new Response(
        JSON.stringify({ ok: true, eligible: false, reason: "amount_out_of_range", traceId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (ctry && !KLARNA_COUNTRIES.has(ctry)) {
      return new Response(
        JSON.stringify({ ok: true, eligible: false, reason: "country_unsupported", traceId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (cur !== "usd" && cur !== "eur" && cur !== "gbp" && cur !== "aud" && cur !== "cad" && cur !== "nzd" && cur !== "dkk" && cur !== "nok" && cur !== "sek" && cur !== "chf" && cur !== "czk" && cur !== "pln") {
      return new Response(
        JSON.stringify({ ok: true, eligible: false, reason: "currency_unsupported", traceId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ ok: false, eligible: false, message: "stripe_not_configured", traceId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const accountEnabled = await isKlarnaEnabledOnAccount(stripe);

    return new Response(
      JSON.stringify({
        ok: true,
        eligible: accountEnabled,
        reason: accountEnabled ? "ok" : "klarna_not_enabled",
        traceId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, eligible: false, message: (err as Error).message, traceId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});