import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assessProductEligibility } from "../_shared/pinterest-eligibility.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const removed = { pin_queue: 0, video_queue: 0, cinematic_publish: 0 };
  const enqueued: string[] = [];
  const blocked: Array<{ product_id: string; reason: string }> = [];

  try {
    // 1. Audit pinterest_pin_queue
    const { data: pinRows } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_id, status")
      .in("status", ["pending", "ready", "scheduled"])
      .limit(500);

    for (const row of pinRows ?? []) {
      if (!row.product_id) continue;
      const res = await assessProductEligibility(row.product_id, { sourceLabel: "v4_bootstrap_pin_queue" });
      if (!res.eligible) {
        await sb.from("pinterest_pin_queue").update({ status: "ineligible", error_message: `v4:${res.reason}` }).eq("id", row.id);
        removed.pin_queue++;
        blocked.push({ product_id: row.product_id, reason: res.reason });
      }
    }

    // 2. Audit pinterest_video_queue
    const { data: vidRows } = await sb
      .from("pinterest_video_queue")
      .select("id, product_id, status")
      .in("status", ["pending", "ready", "scheduled"])
      .limit(500);

    for (const row of vidRows ?? []) {
      if (!row.product_id) continue;
      const res = await assessProductEligibility(row.product_id, { sourceLabel: "v4_bootstrap_video_queue" });
      if (!res.eligible) {
        await sb.from("pinterest_video_queue").update({ status: "ineligible", error_message: `v4:${res.reason}` }).eq("id", row.id);
        removed.video_queue++;
      }
    }

    // 3. Audit cinematic_ad_publish_queue
    const { data: cinRows } = await sb
      .from("cinematic_ad_publish_queue")
      .select("id, product_id, status")
      .in("status", ["pending", "ready", "scheduled"])
      .limit(500);

    for (const row of cinRows ?? []) {
      if (!row.product_id) continue;
      const res = await assessProductEligibility(row.product_id, { sourceLabel: "v4_bootstrap_cinematic" });
      if (!res.eligible) {
        await sb.from("cinematic_ad_publish_queue").update({ status: "ineligible" }).eq("id", row.id);
        removed.cinematic_publish++;
      }
    }

    // 4. Top eligible products for new renders
    const { data: topProducts } = await sb
      .from("products")
      .select("id, slug")
      .eq("is_active", true)
      .gt("stock", 0)
      .order("created_at", { ascending: false })
      .limit(50);

    const candidates: string[] = [];
    for (const p of topProducts ?? []) {
      const res = await assessProductEligibility(p.id, { sourceLabel: "v4_bootstrap_seed" });
      if (res.eligible && res.mediaScore >= 80) {
        candidates.push(p.id);
        enqueued.push(p.slug);
        if (candidates.length >= 25) break;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        removed,
        candidates_for_render: enqueued.length,
        candidate_slugs: enqueued,
        sample_blocks: blocked.slice(0, 25),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});