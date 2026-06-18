// Cinematic V4: Render worker fetch endpoint.
// Returns the storyboard + scene_assets + a signed upload URL for the MP4.
// Auth: Bearer RUNWAY_MERGE_TOKEN (matches V3 worker auth).
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RUNWAY_MERGE_TOKEN = Deno.env.get("RUNWAY_MERGE_TOKEN")!;
const BUCKET = "cinematic-ads";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  try {
    const auth = req.headers.get("authorization") || "";
    if (!RUNWAY_MERGE_TOKEN || auth !== `Bearer ${RUNWAY_MERGE_TOKEN}`) {
      return new Response(JSON.stringify({ ok: false, code: "UNAUTHORIZED", traceId: trace_id }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const url = new URL(req.url);
    const storyboard_id = url.searchParams.get("storyboard_id");
    if (!storyboard_id) return new Response(JSON.stringify({ ok: false, code: "MISSING_STORYBOARD_ID", traceId: trace_id }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await sb.from("cinematic_v4_storyboards").select("*").eq("id", storyboard_id).maybeSingle();
    if (!row) return new Response(JSON.stringify({ ok: false, code: "NOT_FOUND", traceId: trace_id }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (row.status === "rejected") return new Response(JSON.stringify({ ok: false, code: "REJECTED", traceId: trace_id }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (row.status !== "validated" || (row.unique_image_count ?? 0) < 5 || (row.cv4_reject_reasons || []).length > 0) {
      return new Response(JSON.stringify({ ok: false, code: "V4_PREFLIGHT_BLOCKED", traceId: trace_id, status: row.status, unique_image_count: row.unique_image_count, reasons: row.cv4_reject_reasons || [] }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark as rendering so dashboards reflect work in progress.
    await sb.from("cinematic_v4_storyboards").update({ status: "rendering" }).eq("id", storyboard_id);

    const path = `cv4/${storyboard_id}.mp4`;
    const { data: signed, error: signErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signErr || !signed) throw signErr || new Error("signed_upload_failed");

    return new Response(JSON.stringify({
      ok: true, traceId: trace_id,
      storyboard: row,
      upload: {
        signed_url: signed.signedUrl,
        public_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`,
        bucket: BUCKET, path,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[cv4-fetch-job]", e);
    return new Response(JSON.stringify({ ok: false, code: "INTERNAL", message: String(e), traceId: trace_id }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});