// cinematic-story-arc
//
// Composes a 6-beat emotional story arc consumed by the Motion V2 planner
// and Hook elector. Pure heuristic — no AI cost. Always returns a usable arc.
//
// POST { job_id: string }
// Resp { ok, traceId, job_id, story_arc }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const trace = () => `arc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Beat = {
  scene_index: number;
  beat: "problem" | "frustration" | "discovery" | "solution" | "payoff" | "cta";
  emotion: string;
  caption_intent: string;
  visual_intent: string;
  preferred_camera: string;
  preferred_distance: "wide" | "medium" | "close_up" | "extreme_close_up";
};

const CATEGORY_ARCS: Record<string, Partial<Record<Beat["beat"], Partial<Beat>>>> = {
  cat_trees: {
    problem:     { emotion: "concern",   visual_intent: "messy living room, scratched couch", preferred_camera: "handheld",        preferred_distance: "wide" },
    frustration: { emotion: "annoyed",   visual_intent: "owner sighs, bored cat",             preferred_camera: "push_in",         preferred_distance: "medium" },
    discovery:   { emotion: "curious",   visual_intent: "tree appears, light catches it",     preferred_camera: "reveal",          preferred_distance: "wide" },
    solution:    { emotion: "relief",    visual_intent: "cat climbs, exploring playfully",    preferred_camera: "orbit",           preferred_distance: "medium" },
    payoff:      { emotion: "joy",       visual_intent: "cat lounging top perch, calm room",  preferred_camera: "dolly_in",        preferred_distance: "close_up" },
    cta:         { emotion: "invitation",visual_intent: "product hero with price + free ship",preferred_camera: "rack_focus",      preferred_distance: "extreme_close_up" },
  },
  litter_boxes: {
    problem:     { emotion: "disgust",   visual_intent: "smell lines, owner pinches nose",    preferred_camera: "push_in",         preferred_distance: "close_up" },
    frustration: { emotion: "exhausted", visual_intent: "daily scoop chore, time wasted",     preferred_camera: "handheld",        preferred_distance: "medium" },
    discovery:   { emotion: "intrigued", visual_intent: "auto-clean cycle reveal",            preferred_camera: "reveal",          preferred_distance: "medium" },
    solution:    { emotion: "relief",    visual_intent: "fresh box, cat steps in confident",  preferred_camera: "tracking",        preferred_distance: "close_up" },
    payoff:      { emotion: "calm",      visual_intent: "clean home, owner relaxed",          preferred_camera: "dolly_out",       preferred_distance: "wide" },
    cta:         { emotion: "decision",  visual_intent: "product hero, shop badge",           preferred_camera: "rack_focus",      preferred_distance: "extreme_close_up" },
  },
  beds: {
    problem:     { emotion: "ache",      visual_intent: "old worn bed, dog can't settle",     preferred_camera: "push_in",         preferred_distance: "medium" },
    frustration: { emotion: "worry",     visual_intent: "restless circling, stiff joints",    preferred_camera: "handheld",        preferred_distance: "close_up" },
    discovery:   { emotion: "hope",      visual_intent: "premium bed reveal, soft light",     preferred_camera: "reveal",          preferred_distance: "wide" },
    solution:    { emotion: "comfort",   visual_intent: "dog nestles in, melts down",         preferred_camera: "dolly_in",        preferred_distance: "extreme_close_up" },
    payoff:      { emotion: "peace",     visual_intent: "deep sleep, owner smiles",           preferred_camera: "orbit",           preferred_distance: "close_up" },
    cta:         { emotion: "invitation",visual_intent: "hero shot + price",                  preferred_camera: "rack_focus",      preferred_distance: "extreme_close_up" },
  },
  default: {
    problem:     { emotion: "concern",   visual_intent: "the pain point shown plainly",       preferred_camera: "push_in",         preferred_distance: "medium" },
    frustration: { emotion: "tired",     visual_intent: "owner reaction, struggle",           preferred_camera: "handheld",        preferred_distance: "close_up" },
    discovery:   { emotion: "curious",   visual_intent: "product enters, reveal beat",        preferred_camera: "reveal",          preferred_distance: "wide" },
    solution:    { emotion: "relief",    visual_intent: "product solving the problem",        preferred_camera: "tracking",        preferred_distance: "medium" },
    payoff:      { emotion: "joy",       visual_intent: "happy pet + owner, warm grade",      preferred_camera: "orbit",           preferred_distance: "close_up" },
    cta:         { emotion: "decision",  visual_intent: "hero + price + shop now",            preferred_camera: "rack_focus",      preferred_distance: "extreme_close_up" },
  },
};

function pickCategory(s: string): keyof typeof CATEGORY_ARCS {
  const x = s.toLowerCase();
  if (/cat\s*tree|tower|condo/.test(x)) return "cat_trees";
  if (/litter/.test(x)) return "litter_boxes";
  if (/bed|mattress|cushion/.test(x)) return "beds";
  return "default";
}

const BEATS: Beat["beat"][] = ["problem", "frustration", "discovery", "solution", "payoff", "cta"];

function buildArc(productName: string, category: string, hookText: string): Beat[] {
  const key = pickCategory(`${category} ${productName}`);
  const tpl = CATEGORY_ARCS[key];
  return BEATS.map((beat, idx) => {
    const t = tpl[beat] ?? CATEGORY_ARCS.default[beat]!;
    const captionIntent =
      beat === "problem"     ? "name the pain plainly"
    : beat === "frustration" ? "amplify the cost of the pain"
    : beat === "discovery"   ? "introduce the product with curiosity"
    : beat === "solution"    ? "show the product working"
    : beat === "payoff"      ? "show the emotional reward"
    :                          "clear call to action with price";
    return {
      scene_index: idx,
      beat,
      emotion: t.emotion!,
      caption_intent: beat === "problem" && hookText ? `lead with hook: "${hookText}"` : captionIntent,
      visual_intent: t.visual_intent!,
      preferred_camera: t.preferred_camera!,
      preferred_distance: t.preferred_distance!,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  if (req.method !== "POST") return json(405, { ok: false, traceId, message: "POST required" });
  let body: { job_id?: string } = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!body.job_id) return json(400, { ok: false, traceId, message: "job_id required" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: job, error } = await admin
    .from("cinematic_ad_jobs")
    .select("id, product_name, product_slug, hook_text")
    .eq("id", body.job_id)
    .maybeSingle();
  if (error || !job) return json(404, { ok: false, traceId, message: "job not found" });

  let category = "";
  if ((job as any).product_slug) {
    const { data: p } = await (admin as any).from("products_public").select("category").eq("slug", (job as any).product_slug).maybeSingle();
    category = String((p as any)?.category ?? "");
  }

  const arc = buildArc(
    String((job as any).product_name ?? (job as any).product_slug ?? "this product"),
    category,
    String((job as any).hook_text ?? ""),
  );

  await admin.from("cinematic_ad_jobs").update({
    story_arc: arc,
    updated_at: new Date().toISOString(),
  } as any).eq("id", (job as any).id);

  return json(200, { ok: true, traceId, job_id: (job as any).id, story_arc: arc });
});