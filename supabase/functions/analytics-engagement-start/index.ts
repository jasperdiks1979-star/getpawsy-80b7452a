import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const BOT_RE =
  /(bot|crawler|spider|crawling|googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|pinterestbot|tiktokbot|ahrefsbot|semrushbot|mj12bot|petalbot|applebot|cloudflare-healthcheck|uptimerobot|prerender|headless|phantom|slurp|chrome-lighthouse)/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const session_id = String(body.session_id || "").slice(0, 128);
    if (!session_id) {
      return new Response(JSON.stringify({ ok: false, error: "missing session_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ua = String(body.user_agent || req.headers.get("user-agent") || "");
    const isBot = BOT_RE.test(ua);
    const secPurpose = req.headers.get("sec-purpose") || "";
    const purpose = req.headers.get("purpose") || req.headers.get("x-purpose") || req.headers.get("x-moz") || "";
    const isPrefetch = /prefetch/i.test(secPurpose) || /prefetch/i.test(purpose);
    const isPrerender = /prerender/i.test(secPurpose) || !!body.is_prerendering;

    let traffic_type: string = "human";
    let reason: string | null = null;
    if (isBot) { traffic_type = "crawler"; reason = "ua_match"; }
    else if (isPrerender) { traffic_type = "prerender"; reason = "sec_purpose"; }
    else if (isPrefetch) { traffic_type = "prefetch"; reason = "purpose_header"; }

    // Classification first (idempotent)
    await admin.from("analytics_traffic_classification").upsert({
      session_id,
      traffic_type,
      reason,
      user_agent: ua.slice(0, 500),
      sec_purpose: secPurpose.slice(0, 200),
      purpose_header: purpose.slice(0, 200),
      is_prerendering: !!body.is_prerendering,
      was_hidden: !!body.was_hidden,
    }, { onConflict: "session_id" });

    // Only humans get an engagement_start row
    if (traffic_type !== "human") {
      return new Response(JSON.stringify({ ok: true, traffic_type, recorded: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = {
      session_id,
      visitor_id: body.visitor_id ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      utm_term: body.utm_term ?? null,
      utm_content: body.utm_content ?? null,
      ttclid: body.ttclid ?? null,
      fbclid: body.fbclid ?? null,
      gclid: body.gclid ?? null,
      landing_page: body.landing_page ?? null,
      referrer: body.referrer ?? null,
      device: body.device ?? null,
      browser: body.browser ?? null,
      os: body.os ?? null,
      country: body.country ?? null,
      region: body.region ?? null,
      city: body.city ?? null,
      user_agent: ua.slice(0, 500),
    };
    await admin.from("analytics_engagement_starts").upsert(row, { onConflict: "session_id" });

    // Seed the waterfall row with engagement_start_at + landing
    const now = new Date().toISOString();
    await admin.from("analytics_funnel_waterfall").upsert({
      session_id,
      visitor_id: body.visitor_id ?? null,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      landing_page: body.landing_page ?? null,
      landing_at: now,
      engagement_start_at: now,
      furthest_step: "engagement_start",
      traffic_type,
      updated_at: now,
    }, { onConflict: "session_id" });

    return new Response(JSON.stringify({ ok: true, traffic_type, recorded: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});