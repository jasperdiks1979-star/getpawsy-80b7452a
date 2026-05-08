// pinterest-pin-bulk-delete — admin-only bulk DELETE /v5/pins/{id}
// Body:
//   { mode: "pre_engine" }                  → all posted pins NOT in keep_batch
//   { mode: "ids", ids: ["uuid",...] }      → specific queue rows
//   { mode: "pinterest_ids", ids:[...] }    → specific Pinterest pin ids
// Optional: { limit: 100, dryRun: false, reason: "quality-cleanup-pre-engine" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";
const KEEP_BATCH_TAG = "batch_202605081420"; // post-engine premium batch

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function deleteOne(token: string, pinId: string): Promise<{ ok: boolean; status: number; body?: any }> {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // 204 = deleted, 404 = already gone (treat as success)
    if (r.status === 204 || r.status === 404) return { ok: true, status: r.status };
    const body = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Admin auth
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const mode = body?.mode || "pre_engine";
  const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 200);
  const dryRun = !!body?.dryRun;
  const reason = body?.reason || "quality-cleanup-pre-engine";

  // Resolve target rows
  let q = sb.from("pinterest_pin_queue").select("id, pinterest_pin_id, pin_variant").eq("status", "posted").not("pinterest_pin_id", "is", null);
  if (mode === "pre_engine") {
    // Exclude any pin variant containing the keep batch tag
    q = q.not("pin_variant", "ilike", `%${KEEP_BATCH_TAG}%`);
  } else if (mode === "ids") {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) return json({ ok: false, message: "ids required" }, 400);
    q = sb.from("pinterest_pin_queue").select("id, pinterest_pin_id, pin_variant").in("id", body.ids).not("pinterest_pin_id", "is", null);
  } else if (mode === "pinterest_ids") {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) return json({ ok: false, message: "ids required" }, 400);
    q = sb.from("pinterest_pin_queue").select("id, pinterest_pin_id, pin_variant").in("pinterest_pin_id", body.ids);
  } else {
    return json({ ok: false, message: "invalid mode" }, 400);
  }
  const { data: rows, error } = await q.limit(limit);
  if (error) return json({ ok: false, message: error.message }, 500);
  if (!rows || rows.length === 0) return json({ ok: true, deleted: 0, remaining: 0, message: "nothing to delete" });

  if (dryRun) return json({ ok: true, dryRun: true, candidates: rows.length, sample: rows.slice(0, 5) });

  // Connection
  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);

  const token = conn.access_token as string;
  const results: Array<{ id: string; pinterest_pin_id: string; ok: boolean; status: number; body?: any }> = [];

  // Process with concurrency 4 to respect Pinterest rate limits (~10 req/sec safe)
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      const r = rows[idx];
      const res = await deleteOne(token, r.pinterest_pin_id as string);
      results.push({ id: r.id, pinterest_pin_id: r.pinterest_pin_id, ...res });
      // small jitter
      await new Promise((rs) => setTimeout(rs, 80));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Mark successfully-deleted rows in DB
  const successIds = results.filter((r) => r.ok).map((r) => r.id);
  if (successIds.length > 0) {
    await sb.from("pinterest_pin_queue")
      .update({ status: "rejected", rejection_reason: reason, updated_at: new Date().toISOString() })
      .in("id", successIds);
  }

  // Count remaining for the same filter
  let countQ = sb.from("pinterest_pin_queue").select("*", { count: "exact", head: true })
    .eq("status", "posted").not("pinterest_pin_id", "is", null);
  if (mode === "pre_engine") countQ = countQ.not("pin_variant", "ilike", `%${KEEP_BATCH_TAG}%`);
  const { count: remaining } = await countQ;

  return json({
    ok: true,
    attempted: results.length,
    deleted: successIds.length,
    failed: results.length - successIds.length,
    remaining: remaining ?? null,
    failures: results.filter((r) => !r.ok).slice(0, 10),
  });
});