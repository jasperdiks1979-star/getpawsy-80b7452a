import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Phase 22 — Visitor-level personalization resolver.
 *
 * Given a visitor's (utm_source, landing_page), returns the winning
 * (channel, hook_family) for that cohort using `mi_audience_clusters`.
 * The UI uses this to render cohort-aware CTA copy. Falls back to the
 * global top hook if no cohort match exists.
 *
 * Public endpoint (no auth) — read-only, anonymous-safe, US-only.
 */
function landingBucket(lp: string | null | undefined): string {
  if (!lp) return "root";
  const p = String(lp).split("?")[0];
  const seg = p.split("/").filter(Boolean)[0] ?? "root";
  return seg.toLowerCase().slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const url = new URL(req.url);
    let utmSource: string | null = null;
    let landingPage: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({} as any));
      utmSource = body?.utm_source ?? null;
      landingPage = body?.landing_page ?? null;
    } else {
      utmSource = url.searchParams.get("utm_source");
      landingPage = url.searchParams.get("landing_page");
    }

    const channel = (utmSource ?? "").toString().toLowerCase().trim();
    const bucket = landingBucket(landingPage);
    const cohortKey = channel ? `${channel}:${bucket}` : null;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let resolved: { channel: string; hook_family: string; share: number; conversions: number; source: string } | null = null;

    // 1. Exact cohort match.
    if (cohortKey) {
      const { data } = await sb
        .from("mi_audience_clusters")
        .select("channel,hook_family,share,conversions")
        .eq("cohort_key", cohortKey)
        .order("revenue", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        resolved = { ...data[0], source: "cohort_exact" } as any;
      }
    }

    // 2. Fallback by channel only (any landing).
    if (!resolved && channel) {
      const { data } = await sb
        .from("mi_audience_clusters")
        .select("channel,hook_family,share,conversions")
        .eq("cohort_source", channel)
        .order("revenue", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        resolved = { ...data[0], source: "channel_fallback" } as any;
      }
    }

    // 3. Global fallback — best arm overall.
    if (!resolved) {
      const { data } = await sb
        .from("mi_audience_clusters")
        .select("channel,hook_family,share,conversions")
        .order("revenue", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        resolved = { ...data[0], source: "global_fallback" } as any;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        cohort_key: cohortKey,
        channel,
        landing_bucket: bucket,
        hook: resolved,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});