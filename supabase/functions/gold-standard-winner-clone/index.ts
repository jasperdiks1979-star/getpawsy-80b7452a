// gold-standard-winner-clone
// Identifies top-performing Pinterest video pins (by composite of CTR / outbound / saves / purchases),
// extracts voice + pacing + camera + CTA DNA, persists to pinterest_winner_dna for reuse by the
// cinematic director when generating videos for similar-category products.
// Admin-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `gswc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json(401, { ok: false, traceId, message: "auth required" });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json(403, { ok: false, traceId, message: "admin only" });

    // Pull recent metrics (last 30d). Tolerant: table names match memory.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: metrics } = await admin
      .from("pinterest_video_metrics")
      .select("pin_id, impressions, outbound_clicks, saves, day")
      .gte("day", since.slice(0, 10))
      .limit(5000);

    // Aggregate per pin
    const byPin = new Map<string, { impressions: number; outbound: number; saves: number }>();
    for (const m of metrics ?? []) {
      const k = String((m as any).pin_id);
      const cur = byPin.get(k) ?? { impressions: 0, outbound: 0, saves: 0 };
      cur.impressions += Number((m as any).impressions ?? 0);
      cur.outbound += Number((m as any).outbound_clicks ?? 0);
      cur.saves += Number((m as any).saves ?? 0);
      byPin.set(k, cur);
    }

    // Composite: 50% outbound rate, 30% save rate, 20% raw impressions log
    const scored = [...byPin.entries()].map(([pin_id, v]) => {
      const imp = Math.max(1, v.impressions);
      const outRate = v.outbound / imp;
      const saveRate = v.saves / imp;
      const impLog = Math.log10(imp + 1) / 6; // ~0..1 for up to 1M imps
      const composite = (outRate * 100) * 0.5 + (saveRate * 100) * 0.3 + impLog * 100 * 0.2;
      return { pin_id, ...v, composite };
    }).sort((a, b) => b.composite - a.composite).slice(0, 25);

    let saved = 0;
    for (const w of scored) {
      // Look up the cinematic job + product for this pin (best effort).
      const { data: job } = await admin
        .from("cinematic_ad_jobs")
        .select("id, product_slug, product_id, meta, hook_text, cta_text, scene_count")
        .eq("pinterest_asset_id", w.pin_id)
        .maybeSingle();
      const slug = (job as any)?.product_slug ?? null;
      let category: string | null = null;
      if (slug) {
        const { data: p } = await admin.from("products").select("category").eq("slug", slug).maybeSingle();
        category = (p as any)?.category ?? null;
      }
      const meta: any = (job as any)?.meta ?? {};
      const voice = meta?.voice ?? {};
      await admin.from("pinterest_winner_dna").insert({
        source_job_id: (job as any)?.id ?? null,
        source_pin_id: w.pin_id,
        category,
        product_slug: slug,
        ctr: w.impressions ? w.outbound / w.impressions : 0,
        outbound_clicks: w.outbound,
        saves: w.saves,
        purchases: null,
        voice_name: voice?.voice_name ?? null,
        voice_type: voice?.voice_type ?? null,
        voice_style: voice?.voice_style ?? null,
        pacing_profile: { scene_count: (job as any)?.scene_count ?? null },
        camera_profile: meta?.camera ?? null,
        cta_structure: (job as any)?.cta_text ?? null,
        hook_text: (job as any)?.hook_text ?? null,
        composite_score: w.composite,
      });
      saved++;
    }

    return json(200, { ok: true, traceId, considered: byPin.size, top: scored.length, saved });
  } catch (e) {
    console.error("[gold-standard-winner-clone]", e);
    return json(200, { ok: false, traceId, message: (e as Error).message });
  }
});