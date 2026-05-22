// pinterest-pin-deletion-verify — admin-only verification that previously
// "deleted" pins (status=rejected with pinterest_pin_id) are actually gone
// from Pinterest. Issues GET /v5/pins/{id} and classifies each response.
//
// Body (all optional):
//   { limit?: number = 200, onlyStale?: boolean = false }
//
// Response:
//   {
//     ok, verified_at,
//     counts: { deleted, still_exists, inaccessible, cached_only,
//               active_live, archived, remotely_deleted, orphaned },
//     sample: [...]
//   }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";

type RemoteStatus = "deleted" | "still_exists" | "inaccessible" | "cached_only";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function checkOne(
  token: string,
  pinId: string,
): Promise<{ status: RemoteStatus; http: number; error?: string }> {
  try {
    const r = await fetch(`${PINTEREST_API}/pins/${pinId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 404 || r.status === 410) {
      return { status: "deleted", http: r.status };
    }
    if (r.status === 200) {
      const body = await r.json().catch(() => ({} as any));
      // Pinterest sometimes returns a tombstone/cached payload without a
      // valid board_id when the pin has been removed but is still indexed.
      if (!body?.id || !body?.board_id) {
        return { status: "cached_only", http: r.status };
      }
      return { status: "still_exists", http: r.status };
    }
    if (r.status === 401 || r.status === 403) {
      return { status: "inaccessible", http: r.status, error: "auth_forbidden" };
    }
    const body = await r.text().catch(() => "");
    return { status: "inaccessible", http: r.status, error: body.slice(0, 200) };
  } catch (e) {
    return { status: "inaccessible", http: 0, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Admin auth
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
  const { data: roleRow } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  // GET = summary only (no API calls); POST = run verification
  if (req.method === "GET") {
    const [{ data: verifs }, { count: archivedCount }, { count: liveCount }] = await Promise.all([
      sb
        .from("pinterest_pin_deletion_verifications")
        .select("status, verified_at")
        .order("verified_at", { ascending: false }),
      sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "rejected")
        .not("pinterest_pin_id", "is", null),
      sb
        .from("pinterest_pin_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "posted")
        .not("pinterest_pin_id", "is", null),
    ]);
    const counts = summarize(verifs ?? [], archivedCount ?? 0, liveCount ?? 0);
    const lastVerifiedAt = (verifs ?? [])[0]?.verified_at ?? null;
    return json({ ok: true, verified_at: lastVerifiedAt, counts });
  }

  if (req.method !== "POST") return json({ ok: false, message: "method not allowed" }, 405);

  const body: any = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), 500);
  const onlyStale = !!body?.onlyStale;

  // Resolve "deleted" candidates: queue rows that were rejected after a remote DELETE.
  const { data: rows, error: qErr } = await sb
    .from("pinterest_pin_queue")
    .select("id, pinterest_pin_id")
    .eq("status", "rejected")
    .not("pinterest_pin_id", "is", null)
    .limit(limit);
  if (qErr) return json({ ok: false, message: qErr.message }, 500);

  // Optionally skip pins that already have a recent verification (<24h)
  let candidates = rows ?? [];
  if (onlyStale && candidates.length > 0) {
    const ids = candidates.map((r) => r.pinterest_pin_id as string);
    const { data: existing } = await sb
      .from("pinterest_pin_deletion_verifications")
      .select("pinterest_pin_id, verified_at")
      .in("pinterest_pin_id", ids);
    const fresh = new Set(
      (existing ?? [])
        .filter((e) => Date.now() - new Date(e.verified_at).getTime() < 86400_000)
        .map((e) => e.pinterest_pin_id),
    );
    candidates = candidates.filter((r) => !fresh.has(r.pinterest_pin_id as string));
  }

  if (candidates.length === 0) {
    const { data: verifs } = await sb
      .from("pinterest_pin_deletion_verifications")
      .select("status, verified_at")
      .order("verified_at", { ascending: false });
    const { count: archivedCount } = await sb
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected")
      .not("pinterest_pin_id", "is", null);
    const { count: liveCount } = await sb
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .not("pinterest_pin_id", "is", null);
    return json({
      ok: true,
      verified_at: (verifs ?? [])[0]?.verified_at ?? null,
      counts: summarize(verifs ?? [], archivedCount ?? 0, liveCount ?? 0),
      checked: 0,
    });
  }

  // Resolve active Pinterest connection
  const { data: settings } = await sb
    .from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id")
    .eq("id", 1)
    .maybeSingle();
  let connQ = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) {
    connQ = connQ.eq("id", settings.active_pinterest_connection_id);
  }
  const { data: conn } = await connQ.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!conn?.access_token) return json({ ok: false, message: "Pinterest not connected" }, 412);
  const token = conn.access_token as string;

  const results: Array<{
    queue_id: string;
    pinterest_pin_id: string;
    status: RemoteStatus;
    http: number;
    error?: string;
  }> = [];

  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const r = candidates[idx];
      const res = await checkOne(token, r.pinterest_pin_id as string);
      results.push({
        queue_id: r.id as string,
        pinterest_pin_id: r.pinterest_pin_id as string,
        ...res,
      });
      await new Promise((rs) => setTimeout(rs, 60));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Upsert verification rows
  const verifiedAt = new Date().toISOString();
  const upsertRows = results.map((r) => ({
    pinterest_pin_id: r.pinterest_pin_id,
    queue_id: r.queue_id,
    status: r.status,
    http_status: r.http,
    error: r.error ?? null,
    verified_at: verifiedAt,
  }));
  if (upsertRows.length > 0) {
    await sb
      .from("pinterest_pin_deletion_verifications")
      .upsert(upsertRows, { onConflict: "pinterest_pin_id" });
  }

  const { data: verifs } = await sb
    .from("pinterest_pin_deletion_verifications")
    .select("status, verified_at")
    .order("verified_at", { ascending: false });
  const { count: archivedCount } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "rejected")
    .not("pinterest_pin_id", "is", null);
  const { count: liveCount } = await sb
    .from("pinterest_pin_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "posted")
    .not("pinterest_pin_id", "is", null);

  return json({
    ok: true,
    verified_at: verifiedAt,
    checked: results.length,
    counts: summarize(verifs ?? [], archivedCount ?? 0, liveCount ?? 0),
    sample: results.slice(0, 10),
  });
});

function summarize(
  verifs: Array<{ status: string }>,
  archivedCount: number,
  liveCount: number,
) {
  const tally = { deleted: 0, still_exists: 0, inaccessible: 0, cached_only: 0 };
  for (const v of verifs) {
    if (v.status in tally) (tally as any)[v.status]++;
  }
  // "orphaned" = archived in DB but Pinterest says still_exists (drift)
  const orphaned = tally.still_exists;
  return {
    ...tally,
    active_live: liveCount,
    archived: archivedCount,
    remotely_deleted: tally.deleted,
    orphaned,
  };
}