// First Sale Sprint — Diversity Governor V2.
// Pure-TS pre-render gate. Given a candidate creative (12 attributes) it
// computes per-axis similarity against the last 90 published creatives and
// returns { decision: 'pass' | 'regenerate' | 'reject', max_axis, overall,
// suggested_world }.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { z } from "https://esm.sh/zod@3.23.8";
import { getFirstSaleStatus } from "../_shared/first-sale-mode.ts";

const Candidate = z.object({
  product_id: z.string().uuid().optional(),
  scene: z.string().optional().default(""),
  lighting: z.string().optional().default(""),
  composition: z.string().optional().default(""),
  interior: z.string().optional().default(""),
  human: z.string().optional().default(""),
  animal: z.string().optional().default(""),
  headline: z.string().optional().default(""),
  hook: z.string().optional().default(""),
  cta: z.string().optional().default(""),
  emotion: z.string().optional().default(""),
  product: z.string().optional().default(""),
  camera: z.string().optional().default(""),
  attempt: z.number().int().min(0).max(10).default(0),
});

const Body = z.object({ candidate: Candidate });

// 60-world catalog (First Sale Accelerator). Used to suggest a regen direction
// and to keep the Pinterest profile feeling like hundreds of distinct creators.
const WORLDS = [
  "luxury_home","minimal_interior","farmhouse","modern_apartment","tiny_apartment",
  "camping","rv_life","beach","outdoor_adventure","dog_park","cat_cafe","backyard",
  "kitchen","bedroom","living_room","hallway","travel","airport","vacation",
  "pet_hotel","groomer","veterinarian","dog_trainer","senior_dog","senior_cat",
  "puppy","kitten","golden_retriever","french_bulldog","german_shepherd",
  "labrador","cat_mom","dog_mom","family","busy_pro","minimal_lifestyle",
  "luxury_lifestyle","funny_pet","emotional_story","problem_solution","educational",
  "infographic","top5_tips","checklist","buying_guide","comparison","amazon_review",
  "ugc_iphone","pov","closeup_product","studio_photography","macro_detail",
  "before_after","holiday","summer","fourth_of_july","weekend_cleaning",
  "back_to_school","christmas","halloween",
];

const TEXT_KEYS = new Set(["headline","hook","cta"]);

function tokenize(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function axisSimilarity(key: string, candidate: string, history: string[]): number {
  if (!candidate) return 0;
  if (TEXT_KEYS.has(key)) {
    const c = tokenize(candidate);
    let max = 0;
    for (const h of history) {
      const s = jaccard(c, tokenize(h));
      if (s > max) max = s;
    }
    return max;
  }
  // categorical: exact-match ratio over history.
  const norm = candidate.toLowerCase().trim();
  if (!norm) return 0;
  const matches = history.filter((h) => (h || "").toLowerCase().trim() === norm).length;
  return history.length ? matches / history.length : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const c = parsed.data.candidate;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: recent } = await supabase
      .from("pcie2_creatives")
      .select("headline,hook,cta,visual_style,lighting,composition,background,primary_emotion,animal_breed,camera_angle,layout,concept,persona_id,product_id")
      .order("created_at", { ascending: false })
      .limit(90);

    const hist = recent ?? [];
    const histBy = (k: string) => hist.map((r: Record<string, unknown>) => String(r[k] ?? ""));

    const axes: Record<string, number> = {
      scene:       axisSimilarity("scene",       c.scene,       histBy("concept")),
      lighting:    axisSimilarity("lighting",    c.lighting,    histBy("lighting")),
      composition: axisSimilarity("composition", c.composition, histBy("composition")),
      interior:    axisSimilarity("interior",    c.interior,    histBy("background")),
      human:       axisSimilarity("human",       c.human,       histBy("layout")),
      animal:      axisSimilarity("animal",      c.animal,      histBy("animal_breed")),
      headline:    axisSimilarity("headline",    c.headline,    histBy("headline")),
      hook:        axisSimilarity("hook",        c.hook,        histBy("hook")),
      cta:         axisSimilarity("cta",         c.cta,         histBy("cta")),
      emotion:     axisSimilarity("emotion",     c.emotion,     histBy("primary_emotion")),
      product:     axisSimilarity("product",     c.product_id ?? c.product, histBy("product_id")),
      camera:      axisSimilarity("camera",      c.camera,      histBy("camera_angle")),
    };

    const max_axis = Object.values(axes).reduce((a, b) => Math.max(a, b), 0);
    const overall = Object.values(axes).reduce((a, b) => a + b, 0) / 12;

    // Adaptive First Sale Mode: keep the 12-axis governor. Default cap stays
    // 0.65 per axis. When First Sale Mode is active, axes that are already
    // saturated in history (> saturation_threshold) get a temporary 0.70 cap
    // so we can collect learning data; all other axes keep 0.65.
    const fs = await getFirstSaleStatus(supabase).catch(() => null);
    const baseCap = fs?.diversity.per_axis_default ?? 0.65;
    const satCap  = fs?.diversity.per_axis_saturated_cap ?? 0.65;
    const satThr  = fs?.diversity.saturation_threshold ?? 0.55;
    const histSaturation: Record<string, number> = {
      scene: 0, lighting: 0, composition: 0, interior: 0, human: 0, animal: 0,
      headline: 0, hook: 0, cta: 0, emotion: 0, product: 0, camera: 0,
    };
    // Saturation = how dominated history is by its most common value per axis.
    const dominanceOf = (vals: string[]) => {
      if (!vals.length) return 0;
      const counts = new Map<string, number>();
      for (const v of vals) { const k = (v||"").toLowerCase().trim(); if (!k) continue; counts.set(k,(counts.get(k)??0)+1); }
      let m = 0; for (const n of counts.values()) if (n>m) m=n;
      return m / vals.length;
    };
    histSaturation.scene       = dominanceOf(histBy("concept"));
    histSaturation.lighting    = dominanceOf(histBy("lighting"));
    histSaturation.composition = dominanceOf(histBy("composition"));
    histSaturation.interior    = dominanceOf(histBy("background"));
    histSaturation.human       = dominanceOf(histBy("layout"));
    histSaturation.animal      = dominanceOf(histBy("animal_breed"));
    histSaturation.headline    = dominanceOf(histBy("headline"));
    histSaturation.hook        = dominanceOf(histBy("hook"));
    histSaturation.cta         = dominanceOf(histBy("cta"));
    histSaturation.emotion     = dominanceOf(histBy("primary_emotion"));
    histSaturation.product     = dominanceOf(histBy("product_id"));
    histSaturation.camera      = dominanceOf(histBy("camera_angle"));
    const saturated_axes: string[] = [];
    let decision: "pass" | "regenerate" | "reject" = "pass";
    for (const [k, v] of Object.entries(axes)) {
      const isSat = (histSaturation[k] ?? 0) >= satThr;
      const cap = isSat ? satCap : baseCap;
      if (isSat) saturated_axes.push(k);
      if (v > cap) { decision = "regenerate"; break; }
    }
    if (decision === "pass" && overall > 0.5) decision = "regenerate";
    if (c.attempt >= 3) decision = decision === "pass" ? "pass" : "reject";

    // Genesis V4.1 — Feed Quality preflight. Even if per-axis caps pass, escalate
    // to regenerate when the feed-level Fatigue Index is high. Best-effort: never
    // block on failure (the per-axis governor remains the source of truth).
    let feed_quality: Record<string, unknown> | null = null;
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gv41-feed-quality`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ window: 100, persist: false }),
      });
      if (resp.ok) {
        const fq = await resp.json() as { feed_discovery_score?: number; feed_fatigue_index?: number };
        feed_quality = fq;
        if (decision === "pass" && (fq.feed_fatigue_index ?? 0) >= 65) {
          decision = "regenerate";
        }
      }
    } catch (_) { /* ignore */ }

    // Choose a world that does not match the candidate's current concept tokens.
    const candTokens = tokenize(`${c.scene} ${c.interior} ${c.composition}`);
    const suggested = WORLDS.find((w) => !candTokens.has(w.split("_")[0])) ?? WORLDS[0];

    // Audit log (best-effort; ignore failure).
    await supabase.from("pcie_v2_events").insert({
      event_type: decision === "pass" ? "diversity_v2_pass" : `diversity_v2_${decision}`,
      payload: {
        axes, max_axis, overall, attempt: c.attempt, suggested_world: suggested,
        first_sale_mode: !!fs?.active, saturated_axes,
        per_axis_caps: { default: baseCap, saturated: satCap, threshold: satThr },
        feed_quality,
      },
    } as never).then(() => {}, () => {});

    return new Response(
      JSON.stringify({
        decision, max_axis, overall, axes, suggested_world: suggested,
        first_sale_mode: !!fs?.active, saturated_axes,
        per_axis_caps: { default: baseCap, saturated: satCap, threshold: satThr },
        feed_quality,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});