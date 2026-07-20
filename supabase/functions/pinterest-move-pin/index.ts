import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const PIN_ID = "1117103882602516960";
const TARGET_BOARD_ID = "1117103951261719222"; // Cat Furniture
const TARGET_BOARD_NAME = "Cat Furniture";
const QUEUE_ROW_ID = "03679b13-04ac-498b-88b1-2fb361a8312d";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b, null, 2), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Token
  const { data: conn } = await sb
    .from("pinterest_connection")
    .select("access_token,status")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = conn?.access_token;
  if (!token) return json({ ok: false, stage: "token", error: "no connected pinterest_connection" }, 412);

  const base = await getPinterestApiBase(sb);
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1. Verify target board owned + active
  const boardRes = await fetch(`${base}/boards/${TARGET_BOARD_ID}`, { headers: H });
  const boardBody = await boardRes.json().catch(() => ({}));
  if (!boardRes.ok) {
    return json({ ok: false, stage: "verify_target_board", status: boardRes.status, body: boardBody }, 500);
  }
  if (boardBody?.name !== TARGET_BOARD_NAME) {
    return json({ ok: false, stage: "target_board_name_mismatch", expected: TARGET_BOARD_NAME, got: boardBody?.name, board: boardBody }, 500);
  }

  // 2. Verify pin currently live + capture old board
  const pinRes = await fetch(`${base}/pins/${PIN_ID}`, { headers: H });
  const pinBody = await pinRes.json().catch(() => ({}));
  if (!pinRes.ok) {
    return json({ ok: false, stage: "verify_pin_live", status: pinRes.status, body: pinBody }, 500);
  }
  const oldBoardId = pinBody?.board_id;

  if (oldBoardId === TARGET_BOARD_ID) {
    // Already on target — still resync DB and return PASS
    await sb.from("pinterest_pin_queue")
      .update({ board_id: TARGET_BOARD_ID, board_name: TARGET_BOARD_NAME, pin_verified: true, pin_verification_reason: "board_match", last_verified_at: new Date().toISOString() })
      .eq("id", QUEUE_ROW_ID);
    return json({ ok: true, stage: "noop_already_on_target", pin: pinBody });
  }

  // 3. PATCH move via Pinterest API
  const patchRes = await fetch(`${base}/pins/${PIN_ID}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ board_id: TARGET_BOARD_ID }),
  });
  const patchBody = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    return json({
      ok: false,
      stage: "patch_pin",
      status: patchRes.status,
      body: patchBody,
      pinterest_pin_id: PIN_ID,
      old_board: oldBoardId,
      new_board: null,
      api_result: "FAIL",
      note: "Pinterest PATCH /v5/pins did not accept board_id change. No delete/recreate attempted.",
    }, 500);
  }

  // 4. Live re-verify
  const verifyRes = await fetch(`${base}/pins/${PIN_ID}`, { headers: H });
  const verifyBody = await verifyRes.json().catch(() => ({}));
  const liveBoardId = verifyBody?.board_id;
  const liveVerified = verifyRes.ok && liveBoardId === TARGET_BOARD_ID;

  // 5. Duplicate check (search for pins on target board with same URL)
  //    Cheap check: list recent pins on the target board and count PIN_ID occurrences.
  const listRes = await fetch(`${base}/boards/${TARGET_BOARD_ID}/pins?page_size=25`, { headers: H });
  const listBody = await listRes.json().catch(() => ({}));
  const items: any[] = Array.isArray(listBody?.items) ? listBody.items : [];
  const dupCount = items.filter((p) => p?.id === PIN_ID).length;

  // 6. DB sync
  let dbSync = "skipped";
  if (liveVerified) {
    const { error } = await sb.from("pinterest_pin_queue")
      .update({
        board_id: TARGET_BOARD_ID,
        board_name: TARGET_BOARD_NAME,
        pin_verified: true,
        pin_verification_reason: "board_match",
        last_verified_at: new Date().toISOString(),
        error_message: null,
        status: "published",
      })
      .eq("id", QUEUE_ROW_ID);
    dbSync = error ? `error: ${error.message}` : "ok";
  }

  return json({
    ok: liveVerified,
    pinterest_pin_id: PIN_ID,
    old_board: oldBoardId,
    new_board: liveBoardId,
    target_board: TARGET_BOARD_ID,
    api_result: patchRes.status,
    live_verification: liveVerified ? "PASS" : "FAIL",
    duplicate_count_on_target_recent25: dupCount,
    db_sync: dbSync,
    final_status: liveVerified ? "PASS" : "FAIL",
    patch_body: patchBody,
    verify_body: verifyBody,
  });
});