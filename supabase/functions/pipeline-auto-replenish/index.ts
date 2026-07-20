import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { kind = "video", deficit = 10 } = await req.json().catch(() => ({}));
    const target = Math.max(1, Math.min(50, Number(deficit) || 10));

    const { data: products, error } = await sb
      .from("products")
      .select("id, slug, name, effective_stock, inventory_priority, media_score")
      .gt("effective_stock", 0)
      .eq("is_active", true)
      .order("inventory_priority", { ascending: false, nullsFirst: false })
      .order("media_score", { ascending: false, nullsFirst: false })
      .limit(target * 3);
    if (error) throw error;

    const queueTable = kind === "pin" ? "pinterest_pin_queue" : "cinematic_ad_jobs";
    const ids = (products ?? []).map((p: any) => p.id);
    let busy = new Set<string>();
    if (ids.length) {
      const { data: existing } = await sb.from(queueTable).select("product_id").in("product_id", ids).in("status", ["pending", "queued", "render_queued", "rendering", "processing"]);
      busy = new Set(((existing ?? []) as any[]).map((r: any) => r.product_id).filter(Boolean));
    }
    const picks = (products ?? []).filter((p: any) => !busy.has(p.id)).slice(0, target);

    let enqueued = 0;
    for (const p of picks) {
      try {
        if (kind === "video") {
          await sb.from("cinematic_ad_jobs").insert({ product_id: p.id, status: "queued", source: "self_healing_replenish" });
        } else {
          await sb.from("pinterest_pin_queue").insert({ product_id: p.id, status: "pending", source: "self_healing_replenish" });
        }
        enqueued++;
      } catch (_) {}
    }

    return new Response(JSON.stringify({ ok: true, traceId, kind, enqueued, requested: target }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});