// pinterest-live-pin-repair-cleanup-duplicates
// One-shot cleanup for the silent-CHECK-constraint incident:
//   - finds repair drafts that were published more than once on Pinterest
//   - keeps the most recently published pin id, deletes the others via /v5/pins
//   - stamps pinterest_live_pin_repair_queue.details.execution so the executor
//     never re-processes these rows
//   - marks the original mismatched live pin as rejected
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getPinterestApiBase } from "../_shared/pinterest-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function pf(base: string, token: string, path: string, init: RequestInit = {}) {
  const r = await fetch(`${base}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  const t = await r.text();
  let b: any = null; try { b = t ? JSON.parse(t) : null; } catch { b = { raw: t.slice(0, 200) }; }
  return { ok: r.ok, status: r.status, body: b };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
  const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const dryRun = !!body?.dryRun;

  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);
  const token = conn.access_token as string;
  const apiBase = await getPinterestApiBase(sb);

  // Pull recent successful publish logs from the repair window
  const { data: logs, error: logsErr } = await sb
    .from("pinterest_publish_logs")
    .select("pin_queue_id, response_payload, created_at")
    .eq("status", "success")
    .gte("created_at", new Date(Date.now() - 36 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: true });
  if (logsErr) return json({ ok: false, message: logsErr.message }, 500);

  // Group by draft, collect unique pin ids in order
  const byDraft = new Map<string, { ids: string[]; canonical: string }>();
  for (const l of logs ?? []) {
    const id = (l as any).response_payload?.id ? String((l as any).response_payload.id) : null;
    const draftId = (l as any).pin_queue_id;
    if (!id || !draftId) continue;
    const slot = byDraft.get(draftId) ?? { ids: [], canonical: id };
    if (!slot.ids.includes(id)) slot.ids.push(id);
    slot.canonical = id; // last one wins
    byDraft.set(draftId, slot);
  }

  const dupDrafts = [...byDraft.entries()].filter(([, v]) => v.ids.length > 1);

  const report: any[] = [];
  let deleted = 0, deleteFailed = 0;

  for (const [draftId, { ids, canonical }] of dupDrafts) {
    const dupes = ids.filter((id) => id !== canonical);
    const entry: any = { draft_id: draftId, canonical, dupes, deleted: [] as string[], errors: [] as any[] };
    if (!dryRun) {
      for (const dupId of dupes) {
        const del = await pf(apiBase, token, `/pins/${dupId}`, { method: "DELETE" });
        const ok = del.status === 204 || del.status === 404;
        if (ok) { entry.deleted.push(dupId); deleted++; }
        else { entry.errors.push({ id: dupId, status: del.status, body: del.body }); deleteFailed++; }
        await new Promise((r) => setTimeout(r, 400));
      }
      // Ensure the draft row points at the canonical pin id
      await sb.from("pinterest_pin_queue").update({
        pinterest_pin_id: canonical,
        pin_external_id: canonical,
        external_url: `https://www.pinterest.com/pin/${canonical}/`,
        status: "posted",
      }).eq("id", draftId);

      // Stamp the matching repair queue row + reject the original mismatched pin
      const { data: rq } = await sb.from("pinterest_live_pin_repair_queue")
        .select("id, pin_queue_id, pinterest_pin_id, details")
        .filter("details->>replacement_draft_id", "eq", draftId)
        .maybeSingle();
      if (rq) {
        await sb.from("pinterest_live_pin_repair_queue").update({
          updated_at: new Date().toISOString(),
          details: {
            ...(rq.details ?? {}),
            execution: {
              executed_at: new Date().toISOString(),
              old_pin_id: rq.pinterest_pin_id,
              new_pin_id: canonical,
              external_url: `https://www.pinterest.com/pin/${canonical}/`,
              verified: true,
              deleted: entry.deleted.length === dupes.length,
              cleanup: true,
              duplicate_ids_removed: entry.deleted,
            },
          },
        }).eq("id", rq.id);
        if (rq.pin_queue_id) {
          // delete the originally mismatched live pin too (if still present)
          if (rq.pinterest_pin_id) {
            const delOld = await pf(apiBase, token, `/pins/${rq.pinterest_pin_id}`, { method: "DELETE" });
            const ok = delOld.status === 204 || delOld.status === 404;
            entry.original_deleted = ok;
            if (!ok) entry.original_delete_error = { status: delOld.status, body: delOld.body };
          }
          await sb.from("pinterest_pin_queue").update({
            status: "rejected",
            rejection_reason: "live_pin_category_repair_replaced",
            updated_at: new Date().toISOString(),
          }).eq("id", rq.pin_queue_id);
        }
      }
    }
    report.push(entry);
  }

  return json({ ok: true, dryRun, dup_drafts: dupDrafts.length, deleted, deleteFailed, report });
});