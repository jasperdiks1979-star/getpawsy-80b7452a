// pinterest-video-cleanup — admin-only bulk DELETE of cinematic video pins.
//
// Modes:
//   { mode: "all_pre_v3" }         → delete every pin pushed by the cinematic pipeline
//                                    (pinterest_video_queue with status='published' and a pin_id)
//   { mode: "ids", queue_ids:[…] } → delete specific pinterest_video_queue rows
//   { mode: "asset_ids", ids:[…] } → delete every published pin tied to those assets
//
// Optional flags: { dryRun?: boolean, reason?: string, limit?: number }
//
// For every successful Pinterest DELETE we mark the queue row status='deleted'
// and the linked asset is_active=false so the autopublisher never resurfaces it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PINTEREST_API = "https://api.pinterest.com/v5";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function deleteOne(token: string, pinId: string): Promise<{ ok: boolean; status: number; body?: any }> {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 204 || r.status === 404) return { ok: true, status: r.status };
    const body = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).message } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  // Admin auth
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, message: "unauthorized" }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
  if (!role) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const mode = String(body.mode ?? "all_pre_v3");
  const dryRun = Boolean(body.dryRun);
  const reason = String(body.reason ?? "pinterest_recovery_v3_cleanup");
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);

  // Resolve target queue rows
  let q = admin.from("pinterest_video_queue")
    .select("id, asset_id, pin_id, status, title")
    .eq("status", "published")
    .not("pin_id", "is", null);
  if (mode === "ids") {
    if (!Array.isArray(body.queue_ids) || !body.queue_ids.length) return json({ ok: false, message: "queue_ids required" }, 400);
    q = q.in("id", body.queue_ids);
  } else if (mode === "asset_ids") {
    if (!Array.isArray(body.ids) || !body.ids.length) return json({ ok: false, message: "ids required" }, 400);
    q = q.in("asset_id", body.ids);
  } else if (mode !== "all_pre_v3") {
    return json({ ok: false, message: "invalid mode" }, 400);
  }
  const { data: rows, error } = await q.limit(limit);
  if (error) return json({ ok: false, message: error.message }, 500);
  if (!rows || !rows.length) return json({ ok: true, deleted: 0, message: "nothing to delete" });

  if (dryRun) return json({ ok: true, dryRun: true, candidates: rows.length, sample: rows.slice(0, 10) });

  // Pinterest token
  const { data: settings } = await admin.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let connQ = admin.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);
  const token = conn.access_token as string;

  // Concurrency = 4, gentle on Pinterest rate limits
  type Res = { id: string; pin_id: string; asset_id: string | null; ok: boolean; status: number; body?: any };
  const results: Res[] = [];
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      const r = rows[idx];
      const res = await deleteOne(token, r.pin_id as string);
      results.push({ id: r.id, pin_id: r.pin_id, asset_id: r.asset_id, ...res });
      await new Promise((rs) => setTimeout(rs, 100));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Persist outcomes
  const successIds = results.filter((r) => r.ok).map((r) => r.id);
  const successAssets = Array.from(new Set(results.filter((r) => r.ok && r.asset_id).map((r) => r.asset_id as string)));
  if (successIds.length) {
    await admin.from("pinterest_video_queue")
      .update({ status: "deleted", error_message: reason, updated_at: new Date().toISOString() })
      .in("id", successIds);
  }
  if (successAssets.length) {
    await admin.from("pinterest_video_assets")
      .update({ is_active: false, last_skip_reason: reason, updated_at: new Date().toISOString() })
      .in("id", successAssets);
  }

  return json({
    ok: true,
    attempted: results.length,
    deleted: successIds.length,
    failed: results.length - successIds.length,
    deactivated_assets: successAssets.length,
    failures: results.filter((r) => !r.ok).slice(0, 10),
  });
});