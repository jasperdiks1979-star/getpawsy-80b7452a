// Pinterest Video Queue Drainer — processes pending pinterest_video_queue rows
// by invoking pinterest-video-publisher (action=publish) using the
// RENDER_WORKER_SECRET internal bypass. Runs every 5 min via pg_cron.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_SECRET = Deno.env.get("RENDER_WORKER_SECRET") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const body = await req.json().catch(() => ({} as any));
    const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 3)));

    // Select eligible pending rows: not archived, attempts below cap, not test slugs.
    const { data: rows, error } = await sb
      .from("pinterest_video_queue")
      .select("id, asset_id, attempt_count, max_retries, priority, created_at")
      .eq("status", "pending")
      .eq("archived", false)
      .order("priority", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const results: any[] = [];
    let uploaded = 0, published = 0, failed = 0;
    const urls: string[] = [];

    for (const row of rows ?? []) {
      const cap = row.max_retries ?? 3;
      if ((row.attempt_count ?? 0) >= cap) {
        // safety: mark exhausted as failed if somehow still pending
        await sb.from("pinterest_video_queue").update({
          status: "failed",
          error_message: "max_retries_exceeded_at_drain",
        }).eq("id", row.id);
        failed++;
        results.push({ queue_id: row.id, ok: false, code: "MAX_RETRIES_EXCEEDED" });
        continue;
      }
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-video-publisher`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-render-secret": RENDER_SECRET,
            "Authorization": `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({ action: "publish", queue_id: row.id }),
        });
        const out = await res.json().catch(() => ({}));
        if (out?.ok && out?.pin_id) {
          published++;
          uploaded++;
          if (out.external_url) urls.push(out.external_url);
          results.push({ queue_id: row.id, ok: true, pin_id: out.pin_id, url: out.external_url });
        } else {
          failed++;
          results.push({ queue_id: row.id, ok: false, code: out?.code, message: out?.message });
        }
      } catch (e) {
        failed++;
        const msg = (e as Error)?.message || "fetch_failed";
        await sb.from("pinterest_video_queue").update({
          status: "failed",
          error_message: `drain_invoke_failed: ${msg}`,
          attempt_count: (row.attempt_count ?? 0) + 1,
        }).eq("id", row.id);
        results.push({ queue_id: row.id, ok: false, code: "DRAIN_INVOKE_FAILED", message: msg });
      }
    }

    return json({
      ok: true,
      traceId: trace_id,
      picked: rows?.length ?? 0,
      uploaded,
      published,
      failed,
      urls,
      results,
    });
  } catch (e) {
    return json({ ok: false, traceId: trace_id, message: (e as Error)?.message }, 200);
  }
});