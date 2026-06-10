// pinterest-live-pin-repair-execute
// Processes up to 25 highest-priority CRITICAL category-mismatch rows from
// pinterest_live_pin_repair_queue that already have replacement drafts.
// For each row:
//   1. POST /v5/pins (publish replacement draft, preserving board + destination)
//   2. GET  /v5/pins/{new_id}  (verify success)
//   3. DELETE /v5/pins/{old_id} (remove mismatched live pin)
//   4. Mark draft as posted, original as rejected
//   5. Stamp repair queue row details.execution with old/new ids + report
//
// Hard cap: 25 pins per invocation. Then pauses for approval.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getPinterestApiBase, markProductionForbidden } from "../_shared/pinterest-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const HARD_CAP = 25;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function pinterestFetch(base: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 400) }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

  const body: any = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || HARD_CAP, 1), HARD_CAP);
  const dryRun = !!body?.dryRun;

  // ── Pinterest connection ──
  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id, active_board_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);
  const token = conn.access_token as string;
  const apiBase = await getPinterestApiBase(sb);

  // ── Build board_name → board_id map (production boards only) ──
  const { data: boardRows } = await sb.from("pinterest_boards")
    .select("id, name, is_sandbox, is_blacklisted");
  const boardByName = new Map<string, string>();
  for (const b of boardRows ?? []) {
    if (!b?.name || !b?.id) continue;
    if (b.is_sandbox === true) continue;
    if (b.is_blacklisted === true) continue;
    boardByName.set(String(b.name).toLowerCase(), String(b.id));
  }
  const validBoardIds = new Set<string>(boardByName.values());

  // ── Select highest-priority queue rows ──
  // Priority: severity=critical, status=done, has draft id, not yet executed.
  // Order by number of violation_types DESC (more violations = higher priority), then updated_at ASC (oldest first).
  const { data: candidates, error: candErr } = await sb
    .from("pinterest_live_pin_repair_queue")
    .select("id, pin_queue_id, pinterest_pin_id, product_slug, category_key, board_name, overlay_text, pin_title, destination_link, severity, status, violation_types, details, updated_at")
    .eq("recommended_action", "replace")
    .eq("severity", "critical")
    .eq("status", "done")
    .not("pinterest_pin_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(200);
  if (candErr) return json({ ok: false, message: candErr.message }, 500);

  const pool = (candidates ?? [])
    .filter((r: any) => r.details?.replacement_draft_id && !r.details?.execution)
    .sort((a: any, b: any) => (b.violation_types?.length ?? 0) - (a.violation_types?.length ?? 0))
    .slice(0, limit);

  if (pool.length === 0) return json({ ok: true, processed: 0, message: "no eligible rows" });

  const draftIds = pool.map((r: any) => r.details.replacement_draft_id);
  const { data: drafts } = await sb.from("pinterest_pin_queue")
    .select("id, pin_title, pin_description, pin_image_url, destination_link, board_id, board_name, category_key, overlay_text, meta")
    .in("id", draftIds);
  const draftMap = new Map<string, any>();
  for (const d of drafts ?? []) draftMap.set(d.id, d);

  const { data: origs } = await sb.from("pinterest_pin_queue")
    .select("id, board_id, board_name, pin_title, overlay_text, pinterest_pin_id")
    .in("id", pool.map((r: any) => r.pin_queue_id).filter(Boolean));
  const origMap = new Map<string, any>();
  for (const o of origs ?? []) origMap.set(o.id, o);

  const report: any[] = [];
  let succeeded = 0, failed = 0, deleted = 0;

  for (const row of pool) {
    const draft = draftMap.get(row.details.replacement_draft_id);
    const orig = row.pin_queue_id ? origMap.get(row.pin_queue_id) : null;
    const oldPinId = String(row.pinterest_pin_id || orig?.pinterest_pin_id || "");
    // Prefer board_name → live production board id; fall back to stored ids only
    // if they are present in the production board set.
    const lookupByName =
      (row.board_name ? boardByName.get(String(row.board_name).toLowerCase()) : null) ||
      (draft?.board_name ? boardByName.get(String(draft.board_name).toLowerCase()) : null) ||
      null;
    const storedId = orig?.board_id || draft?.board_id || null;
    const boardId =
      lookupByName ||
      (storedId && validBoardIds.has(String(storedId)) ? storedId : null) ||
      (settings?.active_board_id && validBoardIds.has(String(settings.active_board_id)) ? settings.active_board_id : null) ||
      null;

    const entry: any = {
      repair_queue_id: row.id,
      old_pin_id: oldPinId,
      new_pin_id: null,
      category: draft?.category_key || row.category_key || row.details?.replacement_category || null,
      old_headline: row.pin_title,
      new_headline: draft?.pin_title || null,
      old_overlay: row.overlay_text,
      new_overlay: draft?.overlay_text || null,
      destination_url: draft?.destination_link || row.destination_link,
      board_id: boardId,
      status: "pending",
    };

    const stampSkip = async (reason: string) => {
      await sb.from("pinterest_live_pin_repair_queue").update({
        updated_at: new Date().toISOString(),
        details: { ...row.details, execution: { executed_at: new Date().toISOString(), skipped: true, reason } },
      }).eq("id", row.id);
    };
    if (!draft) { entry.status = "skipped"; entry.error = "draft_missing"; await stampSkip("draft_missing"); report.push(entry); failed++; continue; }
    if (!boardId) { entry.status = "skipped"; entry.error = "no_board_id"; await stampSkip("no_board_id"); report.push(entry); failed++; continue; }
    if (!draft.pin_image_url || !draft.pin_title) { entry.status = "skipped"; entry.error = "draft_incomplete"; await stampSkip("draft_incomplete"); report.push(entry); failed++; continue; }

    if (dryRun) { entry.status = "dry_run"; report.push(entry); continue; }

    // ── 1. Publish replacement ──
    const publishPayload = {
      title: String(draft.pin_title).slice(0, 100),
      description: draft.pin_description ? String(draft.pin_description).slice(0, 800) : "",
      board_id: boardId,
      media_source: { source_type: "image_url", url: draft.pin_image_url },
      link: entry.destination_url,
    };
    const pub = await pinterestFetch(apiBase, token, "/pins", {
      method: "POST",
      body: JSON.stringify(publishPayload),
    });
    if (pub.status === 403) await markProductionForbidden(sb, "live-pin-repair-execute hit 403");
    if (!pub.ok || !pub.body?.id) {
      entry.status = "publish_failed";
      entry.error = `HTTP ${pub.status}: ${pub.body?.message || pub.body?.error?.message || JSON.stringify(pub.body).slice(0, 200)}`;
      await sb.from("pinterest_publish_logs").insert({
        pin_queue_id: draft.id, attempt: 1, status: "failed", board_id: boardId,
        image_url: draft.pin_image_url, pin_title: draft.pin_title, destination_link: entry.destination_url,
        request_payload: publishPayload, response_payload: pub.body, error_message: entry.error,
      });
      const isSandboxErr = (pub.status === 400 || pub.status === 403) && /sandbox|board/i.test(JSON.stringify(pub.body || ""));
      await sb.from("pinterest_live_pin_repair_queue").update({
        updated_at: new Date().toISOString(),
        details: {
          ...row.details,
          execution: {
            executed_at: new Date().toISOString(),
            publish_failed: true,
            sandbox_board: isSandboxErr,
            error: entry.error,
            board_id: boardId,
          },
        },
      }).eq("id", row.id);
      report.push(entry); failed++; continue;
    }
    const newPinId = String(pub.body.id);
    entry.new_pin_id = newPinId;
    const externalUrl = `https://www.pinterest.com/pin/${newPinId}/`;

    // ── 2. Verify ──
    const verify = await pinterestFetch(apiBase, token, `/pins/${newPinId}`);
    entry.verified = !!verify.ok;

    // Mark draft posted
    await sb.from("pinterest_pin_queue").update({
      status: "posted",
      posted_at: new Date().toISOString(),
      pinterest_pin_id: newPinId,
      pin_external_id: newPinId,
      external_url: externalUrl,
      board_id: boardId,
      last_publish_error: null,
      publishing_started_at: null,
    }).eq("id", draft.id);
    await sb.from("pinterest_publish_logs").insert({
      pin_queue_id: draft.id, attempt: 1, status: "success", board_id: boardId,
      image_url: draft.pin_image_url, pin_title: draft.pin_title, destination_link: entry.destination_url,
      request_payload: publishPayload, response_payload: pub.body,
    });
    succeeded++;

    // ── 3. Delete old pin ──
    if (oldPinId && entry.verified) {
      const del = await pinterestFetch(apiBase, token, `/pins/${oldPinId}`, { method: "DELETE" });
      const delOk = del.status === 204 || del.status === 404;
      entry.deleted = delOk;
      if (delOk) {
        deleted++;
        if (orig?.id) {
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "live_pin_category_repair_replaced",
            updated_at: new Date().toISOString(),
          }).eq("id", orig.id);
        }
      } else {
        entry.delete_error = `HTTP ${del.status}: ${JSON.stringify(del.body).slice(0, 200)}`;
      }
    } else {
      entry.deleted = false;
      entry.delete_error = entry.verified ? "no_old_pin_id" : "verification_failed_skipped_delete";
    }

    entry.status = entry.deleted ? "complete" : "published_not_deleted";

    // ── 5. Stamp queue row ──
    await sb.from("pinterest_live_pin_repair_queue").update({
      updated_at: new Date().toISOString(),
      details: {
        ...row.details,
        execution: {
          executed_at: new Date().toISOString(),
          old_pin_id: oldPinId,
          new_pin_id: newPinId,
          external_url: externalUrl,
          verified: entry.verified,
          deleted: entry.deleted,
          board_id: boardId,
        },
      },
    }).eq("id", row.id);

    report.push(entry);
    // small pacing jitter to respect Pinterest rate limits
    await new Promise((r) => setTimeout(r, 600));
  }

  return json({
    ok: true,
    processed: report.length,
    succeeded,
    failed,
    deleted,
    cap: HARD_CAP,
    paused: true,
    message: `Processed ${report.length} pins. Paused for approval before continuing.`,
    report,
  });
});