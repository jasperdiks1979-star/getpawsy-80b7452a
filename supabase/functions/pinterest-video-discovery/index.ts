// Pinterest Video Discovery — scans storage buckets for MP4s and registers them
// as pinterest_video_assets. Admin-only.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { classifyHook } from "../_shared/pinterest-video-hooks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TARGET_BUCKETS = ["pinterest-ads", "tiktok-media", "admin-resources"];
const PATTERN = /(getpawsy-tiktok-|getpawsy-litterbox-|timepain|smell|direct).*\.mp4$/i;

function ok(b: unknown) { return new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

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
    // Auth: require admin
    const authHeader = req.headers.get("Authorization") || "";
    const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser();
    if (!user) return ok({ ok: false, code: "UNAUTHENTICATED", traceId });
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return ok({ ok: false, code: "FORBIDDEN", traceId });

    let scanned = 0, matched = 0, inserted = 0;
    const errors: string[] = [];
    for (const bucket of TARGET_BUCKETS) {
      console.log(`[pvd ${traceId}] scanning bucket=${bucket}`);
      let files: Array<{ path: string; size: number; updated_at: string }> = [];
      try {
        files = await listBucketRecursive(sb, bucket);
      } catch (e) {
        errors.push(`${bucket}: ${(e as Error).message}`);
        continue;
      }
      scanned += files.length;
      for (const f of files) {
        const filename = f.path.split("/").pop() || f.path;
        if (!PATTERN.test(filename)) continue;
        if (f.size && f.size < 50_000) continue; // skip tiny/corrupt
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
        if (insErr) errors.push(`insert ${filename}: ${insErr.message}`);
        else inserted++;
      }
    }
    console.log(`[pvd ${traceId}] done scanned=${scanned} matched=${matched} inserted=${inserted} errors=${errors.length}`);
    return ok({ ok: true, traceId, scanned, matched, inserted, errors });
  } catch (e) {
    console.error(`[pvd ${traceId}] fatal`, e);
    return ok({ ok: false, code: "UNEXPECTED_ERROR", traceId, message: (e as Error)?.message });
  }
});