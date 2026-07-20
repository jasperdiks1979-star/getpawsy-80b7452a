/**
 * pinterest-redirect — public 308 redirect engine for legacy Pinterest URLs.
 *
 * Mounted at /functions/v1/pinterest-redirect and proxied from
 *   /go/*  /legacy/*  /old-product/*  /redirect/*
 * via public/_redirects.
 *
 * Strategy: always run the shared resolver, redirect to its target with all
 * UTM / tracking query params preserved. Falls back to /collections/all only
 * if every resolver step fails (404 is the absolute last resort).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveDestination } from "../_shared/pinterest-url-resolver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // Accept either a `url` query param OR derive from the inbound path itself.
  const inbound = url.searchParams.get("url") || `${url.pathname}${url.search}`;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const result = await resolveDestination(sb, inbound);

  if (result.ok && result.target) {
    return new Response(null, {
      status: 308,
      headers: {
        ...corsHeaders,
        Location: result.target,
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "X-Recovery-Step": result.step,
      },
    });
  }

  // Soft fallback to /collections/all (still a live page) instead of 404.
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: "https://getpawsy.pet/collections/all",
      "X-Recovery-Step": "fallback_all",
    },
  });
});