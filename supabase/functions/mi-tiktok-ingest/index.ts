import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull posted TikTok queue items that have a tiktok_post_id
    const { data: posts, error } = await supabase
      .from("tiktok_post_queue")
      .select("id, product_id, post_variant, tiktok_post_id, posted_at")
      .eq("status", "posted")
      .not("tiktok_post_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    // Try to fetch from TikTok Display API if token present, else synthesize from server_events log counts
    const token = Deno.env.get("TIKTOK_ACCESS_TOKEN");
    let updated = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const p of posts ?? []) {
      try {
        let impressions = 0, views = 0, clicks = 0, saves = 0;
        if (token) {
          // TikTok Business: video stats — best-effort
          const r = await fetch(
            `https://open.tiktokapis.com/v2/research/video/query/?fields=video_views,like_count,share_count,comment_count`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ query: { and: [{ operation: "EQ", field_name: "id", field_values: [p.tiktok_post_id] }] } }),
            },
          );
          if (r.ok) {
            const j = await r.json();
            const v = j?.data?.videos?.[0] ?? {};
            views = Number(v.video_views ?? 0);
            impressions = views;
            saves = Number(v.like_count ?? 0);
            clicks = Number(v.share_count ?? 0);
          }
        }
        // Fallback: server_events log
        if (!impressions && !views) {
          const { count: viewCount } = await supabase
            .from("tiktok_server_events")
            .select("id", { count: "exact", head: true })
            .eq("tiktok_post_id", p.tiktok_post_id)
            .eq("event_type", "view");
          views = viewCount ?? 0;
          impressions = views;
        }

        const view_rate = impressions ? views / impressions : 0;
        const ctr = views ? clicks / views : 0;
        const save_rate = views ? saves / views : 0;
        const composite = (ctr * 0.5) + (save_rate * 0.3) + (view_rate * 0.2);

        const { error: upErr } = await supabase.from("mi_channel_metrics").upsert({
          channel: "tiktok",
          queue_id: p.id,
          external_id: p.tiktok_post_id,
          product_id: p.product_id,
          hook_family: p.post_variant,
          impressions, views, clicks, saves,
          ctr, save_rate, view_rate,
          composite_score: composite,
          captured_at: new Date().toISOString(),
        }, { onConflict: "channel,queue_id" });
        if (upErr) throw upErr;
        updated++;
      } catch (e: any) {
        skipped++;
        errors.push({ id: p.id, error: e?.message ?? String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, traceId, updated, skipped, errors: errors.slice(0, 5), token_used: !!token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});