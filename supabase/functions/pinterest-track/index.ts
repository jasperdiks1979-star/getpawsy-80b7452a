import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isPinterest(utmSource: string | null, referrer: string | null, pinId: string | null) {
  if (pinId) return true;
  if (utmSource && /pinterest/i.test(utmSource)) return true;
  if (referrer && /pinterest\.(com|[a-z.]+)/i.test(referrer)) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind ?? "");
    const sessionKey = String(body?.sessionKey ?? "");
    if (!sessionKey) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "sessionKey required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (kind === "session") {
      const utm_source = body.utm_source ?? null;
      const utm_medium = body.utm_medium ?? null;
      const utm_campaign = body.utm_campaign ?? null;
      const utm_term = body.utm_term ?? null;
      const utm_content = body.utm_content ?? null;
      const utm_id = body.utm_id ?? null;
      const referrer = body.referrer ?? null;
      const landing_page = body.landing_page ?? null;
      // pin_id falls back to utm_content per the canonical Pinterest URL contract
      // (utm_source=pinterest&utm_content=<pin_id>). Without this fallback, pins
      // tagged through the publisher never associated their click with a pin row.
      const pin_id = body.pin_id ?? (typeof utm_content === "string" && /^\d{6,}$/.test(utm_content) ? utm_content : null);
      const is_pinterest = isPinterest(utm_source, referrer, pin_id);
      const source_channel = is_pinterest
        ? "pinterest"
        : utm_source
          ? "utm"
          : referrer
            ? "referral"
            : "direct";

      const { error: utmErr } = await sb.from("utm_session_log").insert({
        session_id: sessionKey,
        visitor_id: body.visitor_id ?? null,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        utm_id,
        referrer,
        landing_page,
        source_channel,
        validation_status: "captured",
        is_internal: false,
      });

      let attrErr: unknown = null;
      if (is_pinterest) {
        const { error } = await sb
          .from("pinterest_attribution_sessions")
          .upsert(
            {
              session_key: sessionKey,
              pin_id: pin_id,
              pin_mode: body.pin_mode ?? null,
              landing_slug: body.landing_slug ?? null,
              niche_key: body.niche_key ?? null,
              hook_category: body.hook_category ?? null,
              utm_source,
              utm_campaign,
              utm_content,
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              events_seen: 1,
            },
            { onConflict: "session_key" }
          );
        attrErr = error;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          traceId,
          is_pinterest,
          utm_error: utmErr?.message ?? null,
          attr_error: (attrErr as { message?: string } | null)?.message ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (kind === "event") {
      const event_name = String(body.event_name ?? "");
      if (!event_name) {
        return new Response(JSON.stringify({ ok: false, traceId, message: "event_name required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only stamp event when session was Pinterest-attributed
      const { data: attr } = await sb
        .from("pinterest_attribution_sessions")
        .select("session_key,pin_id,click_counted")
        .eq("session_key", sessionKey)
        .maybeSingle();
      if (!attr) {
        return new Response(JSON.stringify({ ok: true, traceId, skipped: "not_pinterest" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await sb.from("pinterest_funnel_events").insert({
        session_key: sessionKey,
        pin_id: (attr as { pin_id?: string | null })?.pin_id ?? body.pin_id ?? null,
        event_name,
        product_slug: body.product_slug ?? null,
        value: body.value ?? null,
        currency: body.currency ?? null,
      });
      await sb
        .from("pinterest_attribution_sessions")
        .update({ last_seen: new Date().toISOString() })
        .eq("session_key", sessionKey);

      // ── Pin-level outbound click recording ──
      // The visitor landed from a Pinterest pin = an outbound click on that pin.
      // We only count it once per session (click_counted flag), and we wait for
      // the first real interaction event so prefetcher hits (flagged by the
      // client with is_prefetch=true) never inflate the click counter.
      const sessionPinId =
        (attr as { pin_id?: string | null })?.pin_id ?? body.pin_id ?? null;
      const alreadyCounted = (attr as { click_counted?: boolean })?.click_counted === true;
      const isPrefetch = body.is_prefetch === true;
      if (sessionPinId && !alreadyCounted && !isPrefetch) {
        // Resolve product_id from slug when not provided.
        let productIdForPin: string | null = body.product_id ?? null;
        if (!productIdForPin && body.product_slug) {
          const { data: prod } = await sb
            .from("products")
            .select("id")
            .eq("slug", body.product_slug)
            .maybeSingle();
          if (prod) productIdForPin = (prod as { id?: string | null }).id ?? null;
        }
        const productUrl = body.product_slug
          ? `https://getpawsy.pet/products/${body.product_slug}`
          : null;
        const { error: incErr } = await sb.rpc("increment_pinterest_pin_click", {
          p_pin_id: sessionPinId,
          p_product_id: productIdForPin ?? "unknown",
          p_product_url: productUrl,
        });
        if (!incErr) {
          await sb
            .from("pinterest_attribution_sessions")
            .update({ click_counted: true })
            .eq("session_key", sessionKey);
        }
      }

      // ── Mirror into gi_attribution_events (canonical attribution store) ──
      const eventTypeMap: Record<string, string> = {
        page_view: "view",
        product_view: "view",
        view_item: "view",
        add_to_cart: "add_to_cart",
        begin_checkout: "checkout",
        checkout: "checkout",
        purchase: "purchase",
      };
      const mapped = eventTypeMap[event_name];
      if (mapped) {
        const pinId = (attr as { pin_id?: string | null })?.pin_id ?? body.pin_id ?? null;
        let productId: string | null = body.product_id ?? null;
        let boardId: string | null = null;
        // Enrich pin → board_id (+ fallback product_id) via pinterest_pin_queue
        if (pinId) {
          const { data: pinRow } = await sb
            .from("pinterest_pin_queue")
            .select("board_id,product_id")
            .eq("pinterest_pin_id", pinId)
            .maybeSingle();
          if (pinRow) {
            boardId = (pinRow as { board_id?: string | null }).board_id ?? null;
            if (!productId) productId = (pinRow as { product_id?: string | null }).product_id ?? null;
          }
        }
        // Resolve product_id from slug if still missing
        if (!productId && body.product_slug) {
          const { data: prod } = await sb
            .from("products")
            .select("id")
            .eq("slug", body.product_slug)
            .maybeSingle();
          if (prod) productId = (prod as { id?: string | null }).id ?? null;
        }
        const revenueCents =
          typeof body.value === "number" && body.value > 0 ? Math.round(body.value * 100) : 0;
        await sb.from("gi_attribution_events").insert({
          session_id: sessionKey,
          event_type: mapped,
          occurred_at: new Date().toISOString(),
          product_id: productId,
          product_slug: body.product_slug ?? null,
          revenue_cents: revenueCents,
          meta: {
            source: "pinterest",
            event_name,
            pin_id: pinId,
            board_id: boardId,
            currency: body.currency ?? null,
          },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, traceId, recorded: !error, error: error?.message ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: false, traceId, message: "unknown kind" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});