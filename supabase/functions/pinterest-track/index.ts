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
      // Resolution priority for pin_id:
      //   1. Explicit `pin_id` URL param (canonical — set by publisher PATCH after POST).
      //   2. `utm_content` when it looks like a real Pinterest numeric id.
      //   3. Slug-shaped `utm_content` → most-recent posted pin for that slug
      //      (backward compatibility for pins published before the pin_id stamp
      //      was wired into the publisher).
      let pin_id: string | null = body.pin_id ?? null;
      if (!pin_id && typeof utm_content === "string" && /^\d{6,}$/.test(utm_content)) {
        pin_id = utm_content;
      }
      if (!pin_id && typeof utm_content === "string" && utm_content.length > 0 && /[a-z]/i.test(utm_content)) {
        const { data: slugPin } = await sb
          .from("pinterest_pin_queue")
          .select("pinterest_pin_id")
          .eq("product_slug", utm_content)
          .eq("status", "posted")
          .not("pinterest_pin_id", "is", null)
          .order("posted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (slugPin && (slugPin as { pinterest_pin_id?: string | null }).pinterest_pin_id) {
          pin_id = (slugPin as { pinterest_pin_id?: string | null }).pinterest_pin_id ?? null;
        }
      }
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
        .select("session_key,pin_id,click_counted,utm_content,landing_slug")
        .eq("session_key", sessionKey)
        .maybeSingle();
      if (!attr) {
        return new Response(JSON.stringify({ ok: true, traceId, skipped: "not_pinterest" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Backfill pin_id on the attribution session row when a later event
      // carries one that the original /session call didn't (e.g. legacy
      // sessions captured before the publisher started stamping pin_id).
      //
      // Canonical historical recovery path: if still no pin_id, resolve from
      // utm_content slug → most-recent posted pin in pinterest_pin_queue.
      // Pinterest has NOT granted pin_edit access, so this slug fallback is
      // the only way to reconnect legacy traffic to a pin/board/creative.
      const existingPinId = (attr as { pin_id?: string | null })?.pin_id ?? null;
      const incomingPinId: string | null = typeof body.pin_id === "string" && body.pin_id ? body.pin_id : null;
      if (!existingPinId && incomingPinId) {
        await sb
          .from("pinterest_attribution_sessions")
          .update({ pin_id: incomingPinId })
          .eq("session_key", sessionKey);
        (attr as { pin_id?: string | null }).pin_id = incomingPinId;
      }
      if (!(attr as { pin_id?: string | null }).pin_id) {
        const slugCandidate: string | null =
          (typeof body.product_slug === "string" && body.product_slug) ||
          (typeof (attr as { utm_content?: string | null }).utm_content === "string" &&
            /[a-z]/i.test((attr as { utm_content?: string }).utm_content ?? "")
            ? ((attr as { utm_content?: string | null }).utm_content ?? null)
            : null) ||
          (attr as { landing_slug?: string | null }).landing_slug ||
          null;
        if (slugCandidate) {
          const { data: slugPin } = await sb
            .from("pinterest_pin_queue")
            .select("pinterest_pin_id")
            .eq("product_slug", slugCandidate)
            .eq("status", "posted")
            .not("pinterest_pin_id", "is", null)
            .order("posted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const resolved = (slugPin as { pinterest_pin_id?: string | null })?.pinterest_pin_id ?? null;
          if (resolved) {
            await sb
              .from("pinterest_attribution_sessions")
              .update({ pin_id: resolved })
              .eq("session_key", sessionKey);
            (attr as { pin_id?: string | null }).pin_id = resolved;
          }
        }
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