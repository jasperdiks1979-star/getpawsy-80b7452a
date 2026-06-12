import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseParams(link: string) {
  const u = new URL(link);
  return {
    url: u,
    pin_id: u.searchParams.get("pin_id"),
    utm_source: u.searchParams.get("utm_source"),
    utm_medium: u.searchParams.get("utm_medium"),
    utm_campaign: u.searchParams.get("utm_campaign"),
    utm_content: u.searchParams.get("utm_content"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const sourceId = body?.sourceQueueId || "53f4b622-9412-4d85-9c86-ffc338cb91ea";

    const { data: source, error: sourceErr } = await sb
      .from("pinterest_pin_queue")
      .select("*")
      .eq("id", sourceId)
      .maybeSingle();
    if (sourceErr || !source) throw new Error(sourceErr?.message || "source queue row not found");

    const { data: clone, error: cloneErr } = await sb
      .from("pinterest_pin_queue")
      .insert({
        product_id: source.product_id,
        product_slug: source.product_slug,
        product_name: source.product_name,
        pin_variant: source.pin_variant,
        pin_title: source.pin_title,
        pin_description: source.pin_description,
        pin_image_url: source.pin_image_url,
        destination_link: source.destination_link,
        board_name: source.board_name,
        board_id: source.board_id,
        hashtags: source.hashtags,
        priority: "high",
        status: "queued",
        scheduled_at: new Date().toISOString(),
        hook_group: source.hook_group,
        category_key: source.category_key,
        retries: 0,
        profit_state: source.profit_state,
        qa_reasons: source.qa_reasons,
        approved_at: new Date().toISOString(),
        overlay_text: source.overlay_text,
        us_audience_score: source.us_audience_score,
        meta: { ...(source.meta ?? {}), validation_run: "pin_id_attribution_20260612", traceId },
      })
      .select("id,product_slug,product_id")
      .single();
    if (cloneErr || !clone) throw new Error(cloneErr?.message || "clone insert failed");

    const publishRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-publish-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ mode: "pin", pinId: clone.id }),
    });
    const publish = await publishRes.json().catch(() => ({}));
    if (!publish?.ok) throw new Error(`publish failed: ${JSON.stringify(publish)}`);

    const { data: posted } = await sb
      .from("pinterest_pin_queue")
      .select("id,pinterest_pin_id,destination_link,external_url,product_slug,product_id")
      .eq("id", clone.id)
      .maybeSingle();
    const finalUrl = publish.final_destination_url || posted?.destination_link;
    if (!finalUrl) throw new Error("missing final destination URL");
    const p = parseParams(finalUrl);
    for (const key of ["pin_id", "utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
      if (!p[key]) throw new Error(`missing ${key} in final URL`);
    }

    const sessionKey = `validation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sessionBody = {
      kind: "session",
      sessionKey,
      utm_source: p.utm_source,
      utm_medium: p.utm_medium,
      utm_campaign: p.utm_campaign,
      utm_content: p.utm_content,
      pin_id: p.pin_id,
      landing_slug: posted?.product_slug,
      landing_page: `${p.url.pathname}${p.url.search}`,
      referrer: "https://www.pinterest.com/",
    };
    const trackSessionRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      body: JSON.stringify(sessionBody),
    });
    const trackSession = await trackSessionRes.json().catch(() => ({}));

    const eventBody = {
      kind: "event",
      sessionKey,
      event_name: "product_view",
      product_slug: posted?.product_slug,
      product_id: posted?.product_id,
      pin_id: p.pin_id,
      value: null,
      currency: "USD",
      is_prefetch: false,
    };
    const trackEventRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-track`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
      body: JSON.stringify(eventBody),
    });
    const trackEvent = await trackEventRes.json().catch(() => ({}));

    await fetch(`${SUPABASE_URL}/functions/v1/pinterest-revenue-attribution-v3`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ action: "rebuild" }),
    }).then((r) => r.text()).catch(() => "");

    const { data: attributionSession } = await sb
      .from("pinterest_attribution_sessions")
      .select("id,session_key,pin_id,utm_source,utm_campaign,utm_content,click_counted")
      .eq("session_key", sessionKey)
      .maybeSingle();
    const { data: funnelEvent } = await sb
      .from("pinterest_funnel_events")
      .select("id,session_key,pin_id,event_name,product_slug,occurred_at")
      .eq("session_key", sessionKey)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: revenueRow } = await sb
      .from("pinterest_revenue_attribution_v3")
      .select("id,pin_id,window_days,product_slug,clicks,product_views,orders,revenue_cents,computed_at")
      .eq("pin_id", posted?.pinterest_pin_id)
      .eq("window_days", 30)
      .maybeSingle();

    return json({
      ok: true,
      traceId,
      queue_id: clone.id,
      test_pin_id: posted?.pinterest_pin_id,
      live_pin_url: posted?.external_url,
      final_live_destination_url: finalUrl,
      url_params: { pin_id: p.pin_id, utm_source: p.utm_source, utm_medium: p.utm_medium, utm_campaign: p.utm_campaign, utm_content: p.utm_content },
      attribution_session_id: attributionSession?.id ?? null,
      attribution_session: attributionSession,
      funnel_event: funnelEvent,
      revenue_attribution_v3_row: revenueRow,
      profit_center_click_count: revenueRow?.clicks ?? 0,
      track: { session: trackSession, event: trackEvent },
    });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});