import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Decision = {
  id: string;
  product_id: string;
  payload: Record<string, any>;
  status: string;
};

async function genBrief(opts: {
  productName: string;
  category: string | null;
  angle: string | null;
  hook: string | null;
}) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;

  const system = `You write US-native Pinterest creative briefs for pet products.
STRICT compliance: no 'vet-approved', no 'eco-friendly', no medical claims, no fake reviews, no price anchoring.
Tone: premium, warm, real US pet parent. Output JSON only.`;

  const user = `Product: ${opts.productName}
Category: ${opts.category ?? "pet"}
Suggested angle: ${opts.angle ?? "lifestyle"}
Seed hook: ${opts.hook ?? ""}

Return JSON:
{
  "hook_variants": ["3 short scroll-stopping hooks (max 60 chars)"],
  "vo_script": "18s voiceover script, 38-45 words, conversational, ends with soft CTA",
  "captions": ["3-5 short on-screen caption lines"],
  "scene_beats": ["6 scene descriptions, one line each, cinematic, US home setting"],
  "cta": "short CTA (max 24 chars)"
}`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  try {
    return JSON.parse(j?.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await sb
      .from("growth_autopilot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (cfg?.emergency_stop) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Emergency stop is active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const autoMode = cfg?.mode === "auto";
    const statusFilter = autoMode ? ["approved", "pending"] : ["approved"];

    const { data: decisions, error } = await sb
      .from("growth_decisions")
      .select("id, product_id, payload, status")
      .eq("decision_type", "daily_pick")
      .eq("day", today)
      .in("status", statusFilter)
      .limit(20);
    if (error) throw error;

    const todo = (decisions ?? []).filter(
      (d: Decision) => d.product_id && !d.payload?.cinematic_job_id,
    );

    const results: Array<{ decision_id: string; ok: boolean; job_id?: string; message?: string }> = [];

    for (const d of todo as Decision[]) {
      try {
        const { data: product } = await sb
          .from("products")
          .select("id, name, slug, category, image_url, is_active, stock")
          .eq("id", d.product_id)
          .maybeSingle();

        if (!product || !product.is_active || !product.image_url) {
          results.push({ decision_id: d.id, ok: false, message: "Product invalid/inactive/no image" });
          continue;
        }

        // Avoid duplicate active job for the same slug (unique index)
        const { data: existing } = await sb
          .from("cinematic_ad_jobs")
          .select("id, status")
          .eq("product_slug", product.slug)
          .in("status", ["pending", "preparing", "prepared", "render_queued", "rendering"])
          .maybeSingle();
        if (existing) {
          await sb
            .from("growth_decisions")
            .update({ payload: { ...d.payload, cinematic_job_id: existing.id, reused: true } })
            .eq("id", d.id);
          results.push({ decision_id: d.id, ok: true, job_id: existing.id, message: "Reused active job" });
          continue;
        }

        const brief = await genBrief({
          productName: product.name,
          category: product.category,
          angle: d.payload?.recommended_angle ?? null,
          hook: d.payload?.recommended_hook ?? null,
        });

        const hookVariants: string[] = Array.isArray(brief?.hook_variants) && brief.hook_variants.length
          ? brief.hook_variants.slice(0, 3)
          : [d.payload?.recommended_hook ?? "The upgrade your pet deserves."];
        const captions: string[] = Array.isArray(brief?.captions) ? brief.captions.slice(0, 5) : [];
        const vo = typeof brief?.vo_script === "string" ? brief.vo_script : null;

        const { data: job, error: jErr } = await sb
          .from("cinematic_ad_jobs")
          .insert({
            product_slug: product.slug,
            product_id: product.id,
            hook_variant: hookVariants[0],
            status: "pending",
            vo_script: vo,
            caption_variants: captions,
            vo_script_variants: hookVariants,
            scene_specs: [],
          })
          .select("id")
          .single();
        if (jErr) throw jErr;

        await sb
          .from("growth_decisions")
          .update({
            payload: {
              ...d.payload,
              cinematic_job_id: job!.id,
              brief: brief ?? null,
              ai_brief_generated: !!brief,
            },
          })
          .eq("id", d.id);

        results.push({ decision_id: d.id, ok: true, job_id: job!.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ decision_id: d.id, ok: false, message: msg });
      }
    }

    await sb.from("growth_events").insert({
      event_type: "creative_produced",
      trace_id: traceId,
      payload: { day: today, total: results.length, ok: results.filter((r) => r.ok).length },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: `Produced ${results.filter((r) => r.ok).length}/${results.length} creatives`,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});