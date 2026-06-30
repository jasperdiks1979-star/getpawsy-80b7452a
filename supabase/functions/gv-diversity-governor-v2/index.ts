// First Sale Sprint — Diversity Governor V2.
// Pure-TS pre-render gate. Given a candidate creative (12 attributes) it
// computes per-axis similarity against the last 90 published creatives and
// returns { decision: 'pass' | 'regenerate' | 'reject', max_axis, overall,
// suggested_world }.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";
import { z } from "https://esm.sh/zod@3.23.8";

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

// 30-world catalog used to suggest a regeneration direction.
const WORLDS = [
  "luxury_home","farmhouse","modern_apartment","tiny_apartment","outdoor_hiking",
  "camping","road_trip","rv_life","beach","lake","backyard","dog_park",
  "veterinarian","groomer","trainer","senior_pet","puppy_kitten","golden_retriever",
  "french_bulldog","labrador","cat_mom","dog_mom","busy_parents","travel",
  "minimalist","ugc_iphone","tiktok_style","idea_pin","before_after","problem_solution",
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

    let decision: "pass" | "regenerate" | "reject" = "pass";
    if (max_axis > 0.7 || overall > 0.55) decision = "regenerate";
    if (c.attempt >= 3) decision = decision === "pass" ? "pass" : "reject";

    // Choose a world that does not match the candidate's current concept tokens.
    const candTokens = tokenize(`${c.scene} ${c.interior} ${c.composition}`);
    const suggested = WORLDS.find((w) => !candTokens.has(w.split("_")[0])) ?? WORLDS[0];

    // Audit log (best-effort; ignore failure).
    await supabase.from("pcie_v2_events").insert({
      event_type: decision === "pass" ? "diversity_v2_pass" : `diversity_v2_${decision}`,
      payload: { axes, max_axis, overall, attempt: c.attempt, suggested_world: suggested },
    } as never).then(() => {}, () => {});

    return new Response(
      JSON.stringify({ decision, max_axis, overall, axes, suggested_world: suggested }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});