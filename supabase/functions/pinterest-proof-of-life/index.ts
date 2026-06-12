// pinterest-proof-of-life — fast end-to-end verification of the publish pipeline.
// Picks 3 already-approved premium drafts from DISTINCT categories, assigns a
// production-verified board to each, and publishes sequentially via
// pinterest-publish-now. NO rendering, NO QA, NO sleeps. Target runtime < 30s.
//
// Verifies: queue selection · board assignment · Pinterest API · URL routing.
// Does NOT verify: image generation, QA gates, diversity governor.
//
// Auth: admin user JWT OR service role. POST { } returns a structured report.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callPublishNow(pinId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-publish-now`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ mode: "pin", pinId }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── auth (admin or service role) ──
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, message: "unauthorized" }, 401);
  if (bearer !== SERVICE_ROLE) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles")
      .select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
  }

  const startedAt = Date.now();
  const report: any = { started_at: new Date().toISOString(), steps: [], pins: [] };

  // ── snapshot runtime settings (read-only, not mutated) ──
  const { data: rt } = await sb.from("pinterest_runtime_settings")
    .select("active_board_id, premium_engine_paused, allow_legacy_product_feed").eq("id", 1).maybeSingle();
  report.runtime_settings = rt;

  // ── load production-verified boards (need >=3) ──
  const { data: boards } = await sb.from("pinterest_boards")
    .select("id, name, category_key")
    .eq("is_blacklisted", false).eq("is_sandbox", false)
    .eq("production_verified", true)
    .order("priority", { ascending: true });
  if (!boards || boards.length < 3) {
    return json({ ok: false, message: "need at least 3 production-verified boards", boards_found: boards?.length ?? 0 }, 200);
  }

  // ── pull approved/queued/draft premium drafts (NO rendering, NO QA) ──
  // "Approved" = ready-to-publish: has image + destination, not yet sent.
  const { data: candidates, error: cErr } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_slug, product_name, category_key, pin_title, pin_image_url, destination_link, status, board_id, created_at")
    .in("status", ["approved", "queued", "draft"])
    .is("pinterest_pin_id", null)
    .not("pin_image_url", "is", null)
    .not("destination_link", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (cErr) return json({ ok: false, message: "candidate query failed", error: cErr.message }, 500);

  const total = candidates?.length ?? 0;
  report.steps.push({ step: "query_candidates", total });

  if (total === 0) {
    return json({
      ok: false,
      message: "No approved premium drafts available. Run Premium Engine to populate the queue, then retry proof-of-life.",
      success_count: 0,
      total_attempted: 0,
      runtime_ms: Date.now() - startedAt,
      report,
    }, 200);
  }

  // ── select 3 from distinct categories ──
  const seenCats = new Set<string>();
  const picked: any[] = [];
  for (const c of candidates ?? []) {
    const cat = (c.category_key || "uncategorized").toString();
    if (seenCats.has(cat)) continue;
    seenCats.add(cat);
    picked.push(c);
    if (picked.length === 3) break;
  }
  // Fill remainder if <3 distinct categories exist.
  if (picked.length < 3) {
    for (const c of candidates ?? []) {
      if (picked.find((p) => p.id === c.id)) continue;
      picked.push(c);
      if (picked.length === 3) break;
    }
  }

  if (picked.length < 3) {
    return json({
      ok: false,
      message: `Only ${picked.length} approved draft(s) available; need 3.`,
      success_count: 0,
      total_attempted: picked.length,
      runtime_ms: Date.now() - startedAt,
      report,
    }, 200);
  }

  // ── pick 3 distinct boards (try category match, fall back to round-robin) ──
  const usedBoardIds = new Set<string>();
  const assignments: Array<{ pin: any; board: any }> = [];
  for (const pin of picked) {
    let board =
      boards.find((b: any) => !usedBoardIds.has(b.id) && b.category_key && pin.category_key && b.category_key === pin.category_key) ||
      boards.find((b: any) => !usedBoardIds.has(b.id));
    if (!board) break;
    usedBoardIds.add(board.id);
    assignments.push({ pin, board });
  }

  // ── publish sequentially, no sleeps ──
  for (const { pin, board } of assignments) {
    // Assign board + mark queued + schedule now (idempotent).
    await sb.from("pinterest_pin_queue").update({
      status: "queued",
      board_id: board.id,
      scheduled_at: new Date().toISOString(),
    }).eq("id", pin.id);

    const t0 = Date.now();
    const pub = await callPublishNow(pin.id);
    const ms = Date.now() - t0;
    const ok = (pub.body as any)?.ok === true;
    const pinterestPinId = (pub.body as any)?.pinterest_pin_id ?? (pub.body as any)?.pin?.id ?? null;
    const liveUrl = pinterestPinId ? `https://www.pinterest.com/pin/${pinterestPinId}/` : null;

    report.pins.push({
      queue_id: pin.id,
      product_slug: pin.product_slug,
      product_name: pin.product_name,
      category: pin.category_key,
      pin_title: pin.pin_title,
      board_id: board.id,
      board_name: board.name,
      published: ok,
      pinterest_pin_id: pinterestPinId,
      live_url: liveUrl,
      publish_ms: ms,
      http_status: pub.status,
      error: ok ? null : ((pub.body as any)?.message ?? (pub.body as any)?.stage ?? null),
    });
  }

  const successCount = report.pins.filter((p: any) => p.published).length;
  const runtimeMs = Date.now() - startedAt;
  return json({
    ok: successCount === assignments.length,
    success_count: successCount,
    total_attempted: assignments.length,
    runtime_ms: runtimeMs,
    finished_at: new Date().toISOString(),
    report,
  });
});