// Pinterest Video — AI scoring job.
// Picks unscored assets and uses the Lovable AI Gateway to assign three
// 0-100 scores: pinterest viral potential (ai_content_score), US market fit
// (us_market_score), pet relevance (pet_relevance_score). Writes back into
// pinterest_video_assets. Scheduled via pg_cron and also callable manually
// from the admin UI. No JWT — invoked by cron with service-role and by the
// admin page through the service-role-fronted invoke wrapper.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { createPvLogger } from "../_shared/pinterest-video-fn-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function ok(b: unknown) { return new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
const MODEL = "google/gemini-2.5-flash-lite";
const BATCH_LIMIT = 20;

type AssetRow = {
  id: string;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  hook_type: string | null;
  detected_platform: string | null;
  product_slug: string | null;
  duration_seconds: number | null;
  aspect_ratio: string | null;
};

type ScoreResult = {
  ai_content_score: number;
  us_market_score: number;
  pet_relevance_score: number;
  rationale?: string;
};

function clamp(n: unknown): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}

async function scoreAsset(asset: AssetRow): Promise<ScoreResult | null> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
  const system = "You score short pet-product video assets for Pinterest Video Pins targeted at US shoppers. Return strict JSON only.";
  const user = `Score this asset on three axes (0-100 integers):
- ai_content_score: Pinterest viral potential (visual hook + watch-through likelihood)
- us_market_score: fit for US pet shoppers (language, aesthetic, product norms)
- pet_relevance_score: how clearly the asset reads as a pet product video

Asset metadata:
filename: ${asset.filename}
bucket/path: ${asset.storage_bucket}/${asset.storage_path}
hook_type: ${asset.hook_type || "unknown"}
detected_platform: ${asset.detected_platform || "generic"}
product_slug: ${asset.product_slug || "unknown"}
duration_seconds: ${asset.duration_seconds ?? "unknown"}
aspect_ratio: ${asset.aspect_ratio ?? "unknown"}

Return JSON: {"ai_content_score":N,"us_market_score":N,"pet_relevance_score":N,"rationale":"<= 140 chars"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return null;
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { return null; }
  const ai = clamp(parsed.ai_content_score);
  const us = clamp(parsed.us_market_score);
  const pet = clamp(parsed.pet_relevance_score);
  if (ai == null || us == null || pet == null) return null;
  return {
    ai_content_score: ai,
    us_market_score: us,
    pet_relevance_score: pet,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 200) : undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = createPvLogger(sb, "pinterest-video-score-assets", traceId);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "__health_check__") {
      return ok({ ok: true, traceId, function: "pinterest-video-score-assets", model: MODEL });
    }
    const limit = Math.max(1, Math.min(50, Number(body?.limit ?? BATCH_LIMIT)));
    const force = body?.force === true;
    await log.info("entered handler", { limit, force });

    let q = sb.from("pinterest_video_assets")
      .select("id, filename, storage_bucket, storage_path, hook_type, detected_platform, product_slug, duration_seconds, aspect_ratio")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (!force) q = q.or("ai_content_score.is.null,us_market_score.is.null,pet_relevance_score.is.null");
    const { data: assets, error: selErr } = await q;
    if (selErr) { await log.error("select failed", { message: selErr.message }); return ok({ ok: false, code: "DB_SELECT", traceId, message: selErr.message }); }

    let scored = 0, failed = 0, rate_limited = 0, payment_required = 0;
    const errors: Array<{ id: string; message: string }> = [];
    for (const a of (assets || []) as AssetRow[]) {
      try {
        const result = await scoreAsset(a);
        if (!result) { failed++; errors.push({ id: a.id, message: "no_parse" }); continue; }
        const { error: upErr } = await sb.from("pinterest_video_assets").update({
          ai_content_score: result.ai_content_score,
          us_market_score: result.us_market_score,
          pet_relevance_score: result.pet_relevance_score,
        }).eq("id", a.id);
        if (upErr) { failed++; errors.push({ id: a.id, message: upErr.message }); continue; }
        scored++;
        await log.info("scored asset", { id: a.id, scores: result }, { asset_id: a.id });
      } catch (e) {
        failed++;
        const msg = (e as Error)?.message || "score_failed";
        if (msg.includes("429")) { rate_limited++; await log.warn("rate limited — stopping batch", { id: a.id }); break; }
        if (msg.includes("402")) { payment_required++; await log.error("ai credits exhausted — stopping batch", { id: a.id }); break; }
        errors.push({ id: a.id, message: msg });
        await log.error("score failed", { id: a.id, message: msg }, { asset_id: a.id });
      }
    }
    await log.info("done", { picked: assets?.length ?? 0, scored, failed, rate_limited, payment_required });
    return ok({ ok: true, traceId, picked: assets?.length ?? 0, scored, failed, rate_limited, payment_required, errors });
  } catch (e) {
    console.error(`[pvsa ${traceId}] fatal`, e);
    return ok({ ok: false, code: "UNEXPECTED_ERROR", traceId, message: (e as Error)?.message });
  }
});