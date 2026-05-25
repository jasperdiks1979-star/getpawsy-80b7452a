// cinematic-ads-archive-stale — admin-only batch archive of stale/duplicate
// cinematic_ad_jobs. Never deletes remote Pinterest pins.
//
// POST body: { dryRun?: boolean = true, limit?: number = 200 }
// Returns: { ok, archived, candidates, byReason, sample }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
  const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return json({ ok: false, message: "admin only" }, 403);

  const body: any = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), 1000);

  // Pull active (non-archived) jobs.
  const { data: jobs, error } = await sb
    .from("cinematic_ad_jobs")
    .select("id, product_slug, status, engine_version, thumbnail_phash, output_mp4_url, pinterest_pin_id, pinterest_pin_url, pin_publish_attempts, remote_exists, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return json({ ok: false, message: error.message }, 500);

  const seenPhashBySlug = new Map<string, string>(); // slug -> first phash kept
  const candidates: Array<{ id: string; reason: string; slug: string }> = [];

  for (const j of jobs ?? []) {
    const slug = j.product_slug || "";
    let reason: string | null = null;

    // Rule A: pre-V3/V4 engine
    if (j.engine_version && /^v[12]/i.test(j.engine_version)) reason = "pre_v3_engine";

    // Rule B: same slug + same phash dupe (keep newest, archive older)
    if (!reason && j.thumbnail_phash && slug) {
      const key = `${slug}::${j.thumbnail_phash}`;
      if (seenPhashBySlug.has(key)) reason = "duplicate_slug_phash";
      else seenPhashBySlug.set(key, j.id);
    }

    // Rule C: failed publish ≥3 attempts and no pin id
    if (!reason && (j.pin_publish_attempts ?? 0) >= 3 && !j.pinterest_pin_id) reason = "publish_failed_3x";

    // Rule D: claims uploaded but no valid pin url/id, or remote verification said gone
    if (!reason && j.status === "pinterest_uploaded") {
      const noPin = !j.pinterest_pin_id || !j.pinterest_pin_url;
      const remoteGone = j.remote_exists === false;
      if (noPin || remoteGone) reason = "fake_pinterest_uploaded";
    }

    // Rule E: enclosed-cat-litter-box static repeats
    if (!reason && /enclosed-cat-litter-box/i.test(slug) && j.thumbnail_phash) {
      const key = `static::${slug}::${j.thumbnail_phash}`;
      if (seenPhashBySlug.has(key)) reason = "static_litterbox_repeat";
      else seenPhashBySlug.set(key, j.id);
    }

    if (reason) candidates.push({ id: j.id, reason, slug });
    if (candidates.length >= limit) break;
  }

  const byReason: Record<string, number> = {};
  for (const c of candidates) byReason[c.reason] = (byReason[c.reason] ?? 0) + 1;

  if (dryRun) {
    return json({ ok: true, dryRun: true, candidates: candidates.length, byReason, sample: candidates.slice(0, 25) });
  }

  // Archive
  const ids = candidates.map((c) => c.id);
  const reasonById = new Map(candidates.map((c) => [c.id, c.reason]));
  const nowIso = new Date().toISOString();
  let archived = 0;
  // Update in chunks of 50
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { error: uErr } = await sb
      .from("cinematic_ad_jobs")
      .update({ archived_at: nowIso, archive_reason: "stale_duplicate_batch", status: "archived" })
      .in("id", chunk);
    if (uErr) continue;
    archived += chunk.length;
    // Audit
    await sb.from("cinematic_ad_audit_events").insert(
      chunk.map((id) => ({
        job_id: id,
        action: "archive",
        actor: uid,
        reason: reasonById.get(id) ?? "stale_duplicate_batch",
        before_json: null,
        after_json: { archived_at: nowIso, status: "archived" },
      })),
    );
  }

  return json({ ok: true, dryRun: false, archived, candidates: candidates.length, byReason, sample: candidates.slice(0, 25) });
});