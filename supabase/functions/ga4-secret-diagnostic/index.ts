// Read-only diagnostic: reports which GA4 IDs are bound to runtime secrets.
// Admin-gated. Never echoes secret values — only the public Measurement ID
// (G-...) and numeric Property ID, plus presence flags for API secret and
// service-account JSON, so we can prove the canonical property is wired.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function maskSecretShape(v: string | undefined): { present: boolean; length: number } {
  return { present: !!v, length: v ? v.length : 0 };
}

async function probeDataApi(propertyId: string): Promise<Record<string, unknown>> {
  try {
    const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!raw || !propertyId) return { ok: false, reason: "missing_credentials" };
    const sa = JSON.parse(raw);
    // Mint a JWT for the Data API
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claim = {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };
    const enc = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const unsigned = `${enc(header)}.${enc(claim)}`;
    const pem = (sa.private_key as string).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
    const sigB64 = btoa(String.fromCharCode(...sig)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const tokRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${sigB64}`,
      }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) return { ok: false, reason: "token_failed", status: tokRes.status };
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}/metadata`, {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const j = await r.json();
    return {
      ok: r.ok,
      status: r.status,
      property_name: j?.name ?? null,
      service_account_email: sa.client_email ?? null,
    };
  } catch (e) {
    return { ok: false, reason: "exception", error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Admin auth gate
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const measurementId = Deno.env.get("GA4_MEASUREMENT_ID") ?? "";
  const propertyId = Deno.env.get("GA4_PROPERTY_ID") ?? "";
  const apiSecret = Deno.env.get("GA4_API_SECRET");
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

  const canonical = "G-5WYL8RJDZF";
  const measurementMatchesCanonical = measurementId === canonical;

  const dataApiProbe = propertyId ? await probeDataApi(propertyId) : { ok: false, reason: "no_property_id" };

  const body = {
    ok: true,
    canonical_measurement_id: canonical,
    runtime: {
      GA4_MEASUREMENT_ID: measurementId || null,
      GA4_PROPERTY_ID: propertyId || null,
      GA4_API_SECRET: maskSecretShape(apiSecret),
      GOOGLE_SERVICE_ACCOUNT_JSON: maskSecretShape(saJson),
    },
    verdict: {
      measurement_matches_canonical: measurementMatchesCanonical,
      property_id_present: !!propertyId,
      data_api_probe: dataApiProbe,
    },
    note: "Read-only. Secret values are never echoed; only the public Measurement ID, numeric Property ID, and presence/length of API secret / service-account JSON are returned.",
    generated_at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});