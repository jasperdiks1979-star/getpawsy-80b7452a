// Server-side bootstrap for CJ webhook signing.
// Fetches the CJ account openId via the official token API (using the existing
// CJ_EMAIL/CJ_PASSWORD secrets) and stores it in the service-role-only
// cj_webhook_config table. The openId value is never logged or returned.
// Optionally (re)registers the webhook callback topics with CJ.
// Guarded by the shared internal secret; not callable by clients.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed. Use POST." }, 405);
  }

  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!internal || provided !== internal) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let register = false;
  try {
    const body = await req.json();
    register = body?.register === true;
  } catch (_e) {
    // empty body is fine: store-only mode
  }

  // 1. Get a CJ access token; the response also carries the account openId.
  //    Prefer the official apiKey mode (CJ recommends it over email/password).
  const apiKey = Deno.env.get("CJ_API_KEY");
  const email = Deno.env.get("CJ_EMAIL");
  const password = Deno.env.get("CJ_PASSWORD");
  const authBody = apiKey
    ? { apiKey }
    : (email && password ? { email, password } : null);
  if (!authBody) {
    return json({ success: false, error: "CJ credentials not configured" }, 500);
  }

  const tokenResp = await fetch(
    "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authBody),
    },
  );
  const tokenData = await tokenResp.json();
  const accessToken = tokenData?.data?.accessToken;
  const openId = tokenData?.data?.openId;
  if (!tokenData?.result || !accessToken || !openId) {
    return json({
      success: false,
      error: "CJ token response missing required fields",
      cjMessage: tokenData?.message ?? null,
    }, 502);
  }

  // 2. Store the openId server-side only. Never log or return the value.
  const { error: upsertError } = await supabase
    .from("cj_webhook_config")
    .upsert({ key: "open_id", value: openId, updated_at: new Date().toISOString() });
  if (upsertError) {
    return json({ success: false, error: "Failed to store openId" }, 500);
  }

  // 3. Optionally (re)register the webhook callback topics, preserving the
  //    existing topic set (product, stock, order, logistics) and callback URL.
  let registration: Record<string, unknown> = { skipped: true };
  if (register) {
    const webhookUrl = `${supabaseUrl}/functions/v1/cj-webhook`;
    const regResp = await fetch(
      "https://developers.cjdropshipping.com/api2.0/v1/webhook/set",
      {
        method: "POST",
        headers: { "CJ-Access-Token": accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          product: { type: "ENABLE", callbackUrls: [webhookUrl] },
          stock: { type: "ENABLE", callbackUrls: [webhookUrl] },
          order: { type: "ENABLE", callbackUrls: [webhookUrl] },
          logistics: { type: "ENABLE", callbackUrls: [webhookUrl] },
        }),
      },
    );
    const regData = await regResp.json();
    registration = {
      skipped: false,
      ok: regData?.result === true,
      cjMessage: regData?.message ?? null,
    };
  }

  return json({ success: true, openIdStored: true, registration });
});
