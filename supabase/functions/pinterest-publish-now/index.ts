// pinterest-publish-now — admin-only force publish for one queue row.
// Modes:
//   { mode: "next" }            → claim oldest eligible queued pin, publish, return API response
//   { mode: "pin", pinId: ... } → publish that specific row (bypasses eligibility filters,
//                                  still respects already-published guard)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Admin auth ──
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles")
    .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  // ── Parse body ──
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const mode = body?.mode === "pin" ? "pin" : "next";
  const pinId = body?.pinId as string | undefined;

  // ── Resolve target row ──
  let row: any | null = null;
  if (mode === "pin") {
    if (!pinId) return json({ ok: false, message: "pinId required" }, 400);
    const { data } = await sb.from("pinterest_pin_queue").select("*").eq("id", pinId).maybeSingle();
    row = data;
  } else {
    const { data } = await sb.from("pinterest_pin_queue")
      .select("*")
      .eq("status", "queued")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    row = data;
  }
  if (!row) return json({ ok: false, message: "no eligible pin found" }, 404);
  if (row.pinterest_pin_id) {
    return json({ ok: true, message: "already posted", pinterest_pin_id: row.pinterest_pin_id });
  }

  // ── Connection ──
  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id, active_board_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);

  // ── Resolve board ──
  let boardId: string | null = settings?.active_board_id || row.board_id || null;
  if (!boardId) {
    // Pick first non-blacklisted board the account owns
    const boardsRes = await fetch(`${PINTEREST_API}/boards?page_size=25&privacy=ALL`, {
      headers: { Authorization: `Bearer ${conn.access_token}` },
    });
    const boardsBody = await boardsRes.json().catch(() => ({}));
    boardId = boardsBody?.items?.[0]?.id || null;
  }
  if (!boardId) return json({ ok: false, message: "no board available" }, 412);

  // ── Atomic claim ──
  const { data: claimed } = await sb
    .from("pinterest_pin_queue")
    .update({
      status: "publishing",
      publishing_started_at: new Date().toISOString(),
      publish_attempts: (row.publish_attempts || 0) + 1,
    })
    .eq("id", row.id)
    .in("status", mode === "pin" ? ["queued", "draft", "failed", "scheduled"] : ["queued"])
    .select("id")
    .maybeSingle();
  if (!claimed) return json({ ok: false, message: "row already claimed or wrong status" }, 409);

  // ── Publish ──
  const requestPayload = {
    title: row.pin_title,
    description: row.pin_description,
    board_id: boardId,
    media_source: { source_type: "image_url", url: row.pin_image_url },
    link: row.destination_link,
  };
  const t0 = Date.now();
  let pinRes: Response;
  let bodyText = "";
  let parsed: any = null;
  try {
    pinRes = await fetch(`${PINTEREST_API}/pins`, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    bodyText = await pinRes.text();
    try { parsed = JSON.parse(bodyText); } catch { parsed = { raw: bodyText }; }
  } catch (e: any) {
    await sb.from("pinterest_pin_queue").update({
      status: "failed",
      publishing_started_at: null,
      last_publish_error: `network: ${e?.message || e}`,
    }).eq("id", row.id);
    return json({ ok: false, message: e?.message || "network error" }, 502);
  }

  const dur = Date.now() - t0;

  if (pinRes.ok && parsed?.id) {
    const externalUrl = `https://www.pinterest.com/pin/${parsed.id}/`;
    await sb.from("pinterest_pin_queue").update({
      status: "posted",
      posted_at: new Date().toISOString(),
      pinterest_pin_id: parsed.id,
      pin_external_id: parsed.id,
      external_url: externalUrl,
      board_id: boardId,
      last_publish_error: null,
      publishing_started_at: null,
    }).eq("id", row.id);
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: row.id,
      attempt: (row.publish_attempts || 0) + 1,
      status: "success",
      board_id: boardId,
      image_url: row.pin_image_url,
      pin_title: row.pin_title,
      destination_link: row.destination_link,
      request_payload: requestPayload,
      response_payload: parsed,
      duration_ms: dur,
    });
    return json({ ok: true, mode, pin_id: row.id, pinterest_pin_id: parsed.id, external_url: externalUrl, duration_ms: dur, response: parsed });
  }

  // failure
  const errMsg = `Pinterest API ${pinRes.status}: ${bodyText.slice(0, 500)}`;
  await sb.from("pinterest_pin_queue").update({
    status: "failed",
    publishing_started_at: null,
    last_publish_error: errMsg,
    error_message: errMsg,
  }).eq("id", row.id);
  await sb.from("pinterest_publish_logs").insert({
    pin_queue_id: row.id,
    attempt: (row.publish_attempts || 0) + 1,
    status: "failed",
    board_id: boardId,
    image_url: row.pin_image_url,
    pin_title: row.pin_title,
    destination_link: row.destination_link,
    request_payload: requestPayload,
    response_payload: parsed,
    error_message: errMsg,
    duration_ms: dur,
  });
  return json({ ok: false, mode, pin_id: row.id, status_code: pinRes.status, message: errMsg, response: parsed, duration_ms: dur }, 502);
});
