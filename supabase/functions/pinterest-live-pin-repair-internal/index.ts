// One-shot internal republish runner. No JWT verification — invoked manually by
// the build agent to drive the live pin repair workflow. Delete after use.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const API = "https://api.pinterest.com/v5";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function pin(token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const t = await r.text();
  let body: any = null;
  try { body = t ? JSON.parse(t) : null; } catch { body = { raw: t.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body: any = await req.json().catch(() => ({}));
  const batch = Math.min(Math.max(Number(body?.batch) || 10, 1), 25);
  const maxBatches = Math.min(Math.max(Number(body?.maxBatches) || 1, 1), 20);

  const { data: conn } = await sb.from("pinterest_connection").select("access_token")
    .eq("status", "connected").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "no pinterest connection" }, 412);
  const token = conn.access_token as string;

  const { data: boards } = await sb.from("pinterest_boards")
    .select("id, name, is_sandbox, is_blacklisted");
  const boardByName = new Map<string, string>();
  const validBoards = new Set<string>();
  for (const b of boards ?? []) {
    if (!b?.id || !b?.name) continue;
    if (b.is_sandbox === true) continue;
    if (b.is_blacklisted === true) continue;
    boardByName.set(String(b.name).toLowerCase(), String(b.id));
    validBoards.add(String(b.id));
  }

  const report: any[] = [];
  let processed = 0, succeeded = 0, failed = 0, deleted = 0;

  for (let bi = 0; bi < maxBatches; bi++) {
    const { data: pool } = await sb
      .from("pinterest_live_pin_repair_queue")
      .select("id, pin_queue_id, pinterest_pin_id, board_name, overlay_text, pin_title, destination_link, details, violation_types, updated_at")
      .eq("recommended_action", "replace")
      .eq("severity", "critical")
      .eq("status", "done")
      .not("pinterest_pin_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(200);
    const eligible = (pool ?? [])
      .filter((r: any) => r.details?.replacement_draft_id && !r.details?.execution)
      .sort((a: any, b: any) => (b.violation_types?.length ?? 0) - (a.violation_types?.length ?? 0))
      .slice(0, batch);
    if (eligible.length === 0) break;

    const draftIds = eligible.map((r: any) => r.details.replacement_draft_id);
    const { data: drafts } = await sb.from("pinterest_pin_queue")
      .select("id, pin_title, pin_description, pin_image_url, destination_link, board_id, board_name, category_key")
      .in("id", draftIds);
    const draftMap = new Map<string, any>((drafts ?? []).map((d: any) => [d.id, d]));

    const origIds = eligible.map((r: any) => r.pin_queue_id).filter(Boolean);
    const { data: origs } = await sb.from("pinterest_pin_queue")
      .select("id, board_id, board_name, pinterest_pin_id")
      .in("id", origIds);
    const origMap = new Map<string, any>((origs ?? []).map((o: any) => [o.id, o]));

    for (const row of eligible) {
      processed++;
      const draft = draftMap.get(row.details.replacement_draft_id);
      const orig = row.pin_queue_id ? origMap.get(row.pin_queue_id) : null;
      const oldPinId = String(row.pinterest_pin_id || orig?.pinterest_pin_id || "");
      const lookupByName =
        (row.board_name ? boardByName.get(String(row.board_name).toLowerCase()) : null) ||
        (draft?.board_name ? boardByName.get(String(draft.board_name).toLowerCase()) : null) ||
        null;
      const storedId = orig?.board_id || draft?.board_id || null;
      const boardId =
        lookupByName ||
        (storedId && validBoards.has(String(storedId)) ? String(storedId) : null);

      const entry: any = {
        repair_queue_id: row.id, old_pin_id: oldPinId, new_pin_id: null,
        board_name: row.board_name, board_id: boardId,
        destination_url: draft?.destination_link || row.destination_link,
        status: "pending",
      };
      const stamp = async (exec: any) => {
        await sb.from("pinterest_live_pin_repair_queue").update({
          updated_at: new Date().toISOString(),
          details: { ...row.details, execution: exec },
        }).eq("id", row.id);
      };
      if (!draft || !boardId || !draft.pin_image_url || !draft.pin_title) {
        const reason = !draft ? "draft_missing" : !boardId ? "no_board_id" : "draft_incomplete";
        entry.status = "skipped"; entry.error = reason;
        await stamp({ executed_at: new Date().toISOString(), skipped: true, reason });
        failed++; report.push(entry); continue;
      }
      const payload = {
        title: String(draft.pin_title).slice(0, 100),
        description: draft.pin_description ? String(draft.pin_description).slice(0, 800) : "",
        board_id: boardId,
        media_source: { source_type: "image_url", url: draft.pin_image_url },
        link: entry.destination_url,
      };
      const pub = await pin(token, "/pins", { method: "POST", body: JSON.stringify(payload) });
      if (!pub.ok || !pub.body?.id) {
        entry.status = "publish_failed";
        entry.error = `HTTP ${pub.status}: ${pub.body?.message || JSON.stringify(pub.body).slice(0, 200)}`;
        await stamp({ executed_at: new Date().toISOString(), publish_failed: true, error: entry.error, board_id: boardId });
        failed++; report.push(entry); continue;
      }
      const newPinId = String(pub.body.id);
      entry.new_pin_id = newPinId;
      const externalUrl = `https://www.pinterest.com/pin/${newPinId}/`;

      const verify = await pin(token, `/pins/${newPinId}`);
      entry.verified = verify.ok;

      await sb.from("pinterest_pin_queue").update({
        status: "posted", posted_at: new Date().toISOString(),
        pinterest_pin_id: newPinId, pin_external_id: newPinId,
        external_url: externalUrl, board_id: boardId,
        last_publish_error: null, publishing_started_at: null,
      }).eq("id", draft.id);

      if (oldPinId && entry.verified) {
        const del = await pin(token, `/pins/${oldPinId}`, { method: "DELETE" });
        entry.deleted = del.status === 204 || del.status === 404;
        if (entry.deleted) {
          deleted++;
          if (orig?.id) {
            await sb.from("pinterest_pin_queue").update({
              status: "rejected", rejection_reason: "live_pin_category_repair_replaced",
              updated_at: new Date().toISOString(),
            }).eq("id", orig.id);
          }
        } else { entry.delete_error = `HTTP ${del.status}`; }
      } else { entry.deleted = false; }

      entry.status = entry.deleted ? "complete" : "published_not_deleted";
      succeeded++;
      await stamp({
        executed_at: new Date().toISOString(),
        old_pin_id: oldPinId, new_pin_id: newPinId, external_url: externalUrl,
        verified: entry.verified, deleted: entry.deleted, board_id: boardId,
      });
      report.push(entry);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return json({
    ok: true, processed, succeeded, failed, deleted,
    pinterest_urls: report.filter(r => r.new_pin_id).map(r => `https://www.pinterest.com/pin/${r.new_pin_id}/`),
    failures: report.filter(r => r.status === "publish_failed" || r.status === "skipped"),
  });
});