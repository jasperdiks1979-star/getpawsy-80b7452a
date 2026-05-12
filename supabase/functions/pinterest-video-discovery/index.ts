// Pinterest Video Discovery — scans storage buckets for MP4s and registers them
// as pinterest_video_assets. Admin-only.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { classifyHook } from "../_shared/pinterest-video-hooks.ts";
import { MIN_VIDEO_BYTES, MAX_VIDEO_BYTES, formatBytes } from "../_shared/pinterest-video-limits.ts";
import { createPvLogger } from "../_shared/pinterest-video-fn-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_BUCKETS = ["pinterest-ads", "tiktok-media", "admin-resources"];
const PATTERN = /(getpawsy-tiktok-|getpawsy-litterbox-|timepain|smell|direct).*\.mp4$/i;

function ok(b: unknown) { return new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function json(b: unknown, status = 200) { return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

async function listBucketRecursive(sb: any, bucket: string, prefix = ""): Promise<Array<{ path: string; size: number; updated_at: string }>> {
  const out: Array<{ path: string; size: number; updated_at: string }> = [];
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return out;
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id == null && item.name) {
      // folder
      const sub = await listBucketRecursive(sb, bucket, fullPath);
      out.push(...sub);
    } else {
      out.push({
        path: fullPath,
        size: Number(item.metadata?.size || 0),
        updated_at: item.updated_at || item.created_at || new Date().toISOString(),
      });
    }
  }
  return out;
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const log = createPvLogger(sb, "pinterest-video-discovery", traceId);
    await log.info("entered handler");
    // Auth: require admin
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      await log.warn("missing bearer token");
      return json({ ok: false, code: "UNAUTHENTICATED", traceId, message: "Missing authenticated admin JWT" }, 401);
    }
    const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await sbUser.auth.getUser();
    if (userError || !user) { await log.warn("unauthenticated", { message: userError?.message }); return json({ ok: false, code: "UNAUTHENTICATED", traceId, message: userError?.message || "Invalid user token" }, 401); }
    const { data: roleRow, error: roleError } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) { await log.warn("forbidden", { user_id: user.id, email: user.email, message: roleError?.message }); return json({ ok: false, code: "FORBIDDEN", traceId, message: "Admin authorization required", user_id: user.id, email: user.email }, 403); }
    const body = await req.json().catch(() => ({}));
    if (body?.action === "__health_check__") {
      await log.info("health check ok", { buckets: TARGET_BUCKETS, pattern: String(PATTERN) });
      return ok({ ok: true, traceId, function: "pinterest-video-discovery", admin: true, buckets: TARGET_BUCKETS, pattern: String(PATTERN) });
    }

    let scanned = 0, matched = 0, inserted = 0, skipped_oversized = 0, skipped_undersized = 0;
    const errors: string[] = [];
    const skipped: Array<{ filename: string; reason: string }> = [];
    for (const bucket of TARGET_BUCKETS) {
      await log.info("scanning bucket", { bucket });
      let files: Array<{ path: string; size: number; updated_at: string }> = [];
      try {
        files = await listBucketRecursive(sb, bucket);
      } catch (e) {
        const msg = `${bucket}: ${(e as Error).message}`;
        errors.push(msg);
        await log.error("bucket scan failed", { bucket, message: (e as Error).message });
        continue;
      }
      scanned += files.length;
      for (const f of files) {
        const filename = f.path.split("/").pop() || f.path;
        if (!PATTERN.test(filename)) continue;
        if (f.size && f.size < MIN_VIDEO_BYTES) {
          skipped_undersized++;
          skipped.push({ filename, reason: `too small (${formatBytes(f.size)})` });
          await log.warn("skip undersized", { filename, size: f.size });
          continue;
        }
        if (f.size && f.size > MAX_VIDEO_BYTES) {
          skipped_oversized++;
          skipped.push({ filename, reason: `too large (${formatBytes(f.size)} > ${formatBytes(MAX_VIDEO_BYTES)})` });
          await log.warn("skip oversized", { bucket, path: f.path, size: f.size, max: MAX_VIDEO_BYTES });
          continue;
        }
        matched++;
        const content_hash = await sha256(`${bucket}|${f.path}|${f.size}|${f.updated_at}`);
        const { data: pub } = sb.storage.from(bucket).getPublicUrl(f.path);
        const hook_type = classifyHook(filename);
        const { error: insErr } = await sb.from("pinterest_video_assets").upsert({
          filename,
          storage_bucket: bucket,
          storage_path: f.path,
          public_url: pub?.publicUrl || "",
          filesize_bytes: f.size || null,
          hook_type,
          content_hash,
        }, { onConflict: "content_hash", ignoreDuplicates: true });
        if (insErr) {
          errors.push(`insert ${filename}: ${insErr.message}`);
          await log.error("insert failed", { filename, message: insErr.message });
        } else inserted++;
      }
    }
    await log.info("done", { scanned, matched, inserted, skipped_oversized, skipped_undersized, errors: errors.length });
    return ok({ ok: true, traceId, scanned, matched, inserted, skipped_oversized, skipped_undersized, skipped, errors });
  } catch (e) {
    console.error(`[pvd ${traceId}] fatal`, e);
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb.from("pinterest_video_function_logs").insert({
        function_name: "pinterest-video-discovery", trace_id: traceId, level: "error",
        message: "fatal", payload: { message: (e as Error)?.message, stack: (e as Error)?.stack?.slice(0, 800) },
      });
    } catch (_) { /* ignore */ }
    return ok({ ok: false, code: "UNEXPECTED_ERROR", traceId, message: (e as Error)?.message });
  }
});