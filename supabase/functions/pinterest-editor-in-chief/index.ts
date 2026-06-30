// GENESIS V5.3 — Pinterest Editor-in-Chief Pre-Publish Intelligence Gate.
//
// Reuses existing engines — does NOT duplicate Recommendation OS, Feed Quality,
// Diversity Governor, Distribution Optimizer or PPE. Acts as the final editorial
// decision before any draft enters the publish queue:
//
//   draft  →  score 10 Pinterest psychology axes (Save, Share, Curiosity, Trust,
//             Lifestyle, Educational, Problem-Solving, Emotion, Future Use, Native)
//          →  fetch feed-quality + native mix snapshot
//          →  composite score
//          →  if below target: auto-improve weak components ONLY (headline /
//             hook / description / CTA) via Lovable AI gateway, re-score, repeat
//             up to MAX_ITERATIONS — every iteration must be measurably better.
//          →  persist explainability per iteration in pinterest_editor_decisions
//          →  action: approve (status='queued') | downrank | reject
//
// Body: { dryRun?: boolean, limit?: number, minScore?: number, maxIterations?: number }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Draft = {
  id: string;
  product_slug: string | null;
  category_key: string | null;
  content_type: string | null;
  pin_title: string | null;
  pin_description: string | null;
  hashtags: string[] | null;
  hook: string | null;
  meta: Record<string, unknown> | null;
  priority: number | null;
};

const HELPFUL = ["how", "why", "tips", "guide", "checklist", "avoid", "fix", "stop", "ways", "before you", "what to", "best", "vs", "signs"];
const LIFESTYLE = ["cozy", "morning", "sunny", "evening", "weekend", "kitchen", "living room", "bedroom", "patio", "balcony", "couch", "rv", "cafe", "outdoor", "garden", "fall", "spring", "summer"];
const EDU = ["guide", "tutorial", "step", "explained", "science", "learn", "training", "behavior", "vet", "expert", "checklist"];
const SHOWCASE = ["buy", "sale", "discount", "% off", "shop now", "new arrival", "shop", "deal"];
const CURIOSITY = ["secret", "nobody tells", "actually", "truth", "the one", "surprising", "weird", "you didn't know", "hidden"];
const PROBLEM = ["stops", "stops the", "fix", "no more", "without", "solve", "smell", "mess", "scratching", "anxiety"];
const EMOTION = ["love", "happy", "calm", "cozy", "safe", "snuggle", "cuddle", "joy", "peace", "comfort"];
const TRUST = ["vet", "expert", "tested", "safe", "non-toxic", "natural", "approved", "review"];
const FUTURE = ["save for later", "next", "summer", "winter", "ideas", "inspiration", "checklist", "planner"];
const SHARE = ["friends", "everyone", "share", "tag a", "pet parents", "fellow"];

function hits(text: string, terms: string[]) {
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
}

function scoreAxes(d: Draft): { axes: Record<string, number>; composite: number; failing: string[] } {
  const t = `${d.pin_title ?? ""} ${d.pin_description ?? ""} ${d.hook ?? ""} ${(d.hashtags ?? []).join(" ")}`.toLowerCase();
  const ct = (d.content_type || "product").toLowerCase();
  const isShowcase = ct === "product" || ct === "product_showcase";

  const cap = (n: number) => Math.max(0, Math.min(100, n));
  const showcasePenalty = Math.min(30, hits(t, SHOWCASE) * 12) + (isShowcase ? 8 : 0);

  const axes = {
    save:          cap(hits(t, FUTURE) * 18 + hits(t, LIFESTYLE) * 10 + (t.length > 120 ? 12 : 0) + 30 - showcasePenalty),
    share:         cap(hits(t, SHARE) * 22 + hits(t, EMOTION) * 8 + 35 - showcasePenalty / 2),
    curiosity:     cap(hits(t, CURIOSITY) * 28 + hits(t, HELPFUL) * 6 + 25),
    trust:         cap(hits(t, TRUST) * 22 + 40 - showcasePenalty / 2),
    lifestyle:     cap(hits(t, LIFESTYLE) * 20 + (isShowcase ? 10 : 35) - showcasePenalty),
    educational:   cap(hits(t, EDU) * 22 + hits(t, HELPFUL) * 8 + 20),
    problem_solving: cap(hits(t, PROBLEM) * 26 + hits(t, HELPFUL) * 6 + 18),
    emotion:       cap(hits(t, EMOTION) * 22 + hits(t, LIFESTYLE) * 6 + 28),
    future_use:    cap(hits(t, FUTURE) * 24 + hits(t, EDU) * 6 + 25),
    native:        cap(40 + hits(t, LIFESTYLE) * 8 + hits(t, EDU) * 6 + hits(t, HELPFUL) * 5 - showcasePenalty * 1.5),
  };

  // Weighted composite (Save + Native dominate; Pinterest's distribution loves saves).
  const w = { save: 0.20, native: 0.18, lifestyle: 0.10, emotion: 0.10, curiosity: 0.08, educational: 0.08, problem_solving: 0.08, trust: 0.08, future_use: 0.06, share: 0.04 };
  let composite = 0;
  for (const [k, v] of Object.entries(axes)) composite += v * (w as any)[k];
  composite = Math.round(composite);

  const failing = Object.entries(axes)
    .filter(([k, v]) => v < (k === "trust" || k === "future_use" ? 45 : 55))
    .map(([k]) => k);

  return { axes, composite, failing };
}

async function improveDraft(d: Draft, failing: string[]): Promise<Partial<Draft> | null> {
  if (!LOVABLE_API_KEY) return null;
  const prompt = `You are the Pinterest Editor-in-Chief for GetPawsy, a US pet brand.
Improve ONLY the weak components of this draft so it feels native on Pinterest —
inspirational, save-worthy, scroll-stopping, never promotional.

Weak axes to fix: ${failing.join(", ")}

Current draft:
- Title: ${d.pin_title ?? ""}
- Hook: ${d.hook ?? ""}
- Description: ${d.pin_description ?? ""}
- Hashtags: ${(d.hashtags ?? []).join(" ")}
- Category: ${d.category_key ?? ""}
- Content type: ${d.content_type ?? ""}

Rules:
- Title ≤ 65 chars, curiosity-driven, no "shop / buy / sale / % off / deal".
- Description ≥ 140 chars, helpful or lifestyle voice, US English.
- Hook ≤ 50 chars, scroll-stop.
- 3-6 hashtags, lowercase, no brand spam.
- Keep the niche/product context implicit; sound like a real Pinterest creator.

Return STRICT JSON: {"pin_title": "...", "hook": "...", "pin_description": "...", "hashtags": ["..."]}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const txt = j.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    return {
      pin_title: typeof parsed.pin_title === "string" ? parsed.pin_title.slice(0, 95) : d.pin_title,
      hook: typeof parsed.hook === "string" ? parsed.hook.slice(0, 80) : d.hook,
      pin_description: typeof parsed.pin_description === "string" ? parsed.pin_description.slice(0, 500) : d.pin_description,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8).map((x: unknown) => String(x).replace(/^#/, "").toLowerCase()) : d.hashtags,
    };
  } catch {
    return null;
  }
}

function expectedLifts(composite: number, axes: Record<string, number>) {
  // Heuristic expected uplift signals derived from axis strength.
  const norm = (n: number) => Math.max(0, Math.min(1, (n - 40) / 60));
  return {
    save_rate_pct:     +(0.4 + norm(axes.save) * 1.6).toFixed(2),
    discovery_lift_x: +(1 + norm(composite) * 2.2).toFixed(2),
    follow_lift_pct:  +(0.1 + norm(axes.trust) * 0.9).toFixed(2),
    purchase_intent:  +(0.2 + norm(axes.problem_solving) * 0.8 + norm(axes.lifestyle) * 0.4).toFixed(2),
    authority_lift:   +(norm(axes.educational) * 0.7 + norm(axes.native) * 0.5).toFixed(2),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  const supabase = createClient(PROJECT_URL, SERVICE_KEY);
  let body: { dryRun?: boolean; limit?: number; minScore?: number; maxIterations?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  const dryRun = body.dryRun !== false;
  const limit = Math.min(80, Math.max(1, body.limit ?? 25));
  const minScore = Math.max(40, Math.min(95, body.minScore ?? 70));
  const maxIter = Math.max(0, Math.min(3, body.maxIterations ?? 2));

  // 1. Pull drafts (oldest first so the backlog drains).
  const { data: drafts, error } = await supabase
    .from("pinterest_pin_queue")
    .select("id,product_slug,category_key,content_type,pin_title,pin_description,hashtags,hook,meta,priority")
    .eq("status", "draft")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message, traceId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Feed snapshot — reuse existing gv41-feed-quality (no duplicate logic).
  let feedSnapshot: unknown = null;
  try {
    const fq = await fetch(`${PROJECT_URL}/functions/v1/gv41-feed-quality`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", apikey: SERVICE_KEY },
      body: JSON.stringify({ window: 300 }),
    });
    if (fq.ok) feedSnapshot = await fq.json();
  } catch { /* non-fatal */ }

  const summary = { evaluated: 0, approved: 0, downranked: 0, rejected: 0, improved: 0, iterations: 0 };
  const decisions: Array<Record<string, unknown>> = [];

  for (const d0 of (drafts ?? []) as Draft[]) {
    summary.evaluated++;
    let current = { ...d0 };
    let scored = scoreAxes(current);
    const before = { pin_title: d0.pin_title, hook: d0.hook, pin_description: d0.pin_description, hashtags: d0.hashtags };
    const improvements: Array<Record<string, unknown>> = [];
    let prevComposite = scored.composite;

    for (let i = 1; i <= maxIter && scored.composite < minScore; i++) {
      summary.iterations++;
      const patch = await improveDraft(current, scored.failing);
      if (!patch) break;
      const candidate: Draft = { ...current, ...patch } as Draft;
      const next = scoreAxes(candidate);
      improvements.push({
        iteration: i,
        from_composite: prevComposite,
        to_composite: next.composite,
        fixed_axes: scored.failing,
        delta: next.composite - prevComposite,
      });
      // Every iteration must be measurably better; otherwise stop.
      if (next.composite <= prevComposite) break;
      current = candidate;
      scored = next;
      prevComposite = next.composite;
      summary.improved++;
    }

    const expected = expectedLifts(scored.composite, scored.axes);
    const passReasons: string[] = [];
    const failReasons: string[] = [];
    for (const [k, v] of Object.entries(scored.axes)) {
      if (v >= 70) passReasons.push(`${k}=${v}`);
      else if (v < 50) failReasons.push(`${k}=${v}`);
    }

    let action: "approve" | "downrank" | "reject" = "downrank";
    let reason = `composite=${scored.composite}/${minScore}`;
    if (scored.composite >= minScore) {
      action = "approve";
      reason = `composite=${scored.composite}≥${minScore}`;
    } else if (scored.composite < Math.max(45, minScore - 20)) {
      action = "reject";
      reason = `composite=${scored.composite}<${Math.max(45, minScore - 20)} after ${maxIter} iters`;
    }

    if (!dryRun) {
      const after = { pin_title: current.pin_title, hook: current.hook, pin_description: current.pin_description, hashtags: current.hashtags };
      if (action === "approve") {
        await supabase.from("pinterest_pin_queue").update({
          ...after,
          status: "queued",
          priority: Math.max(50, (current.priority ?? 50) + Math.round((scored.composite - minScore) / 2)),
          updated_at: new Date().toISOString(),
        }).eq("id", d0.id).eq("status", "draft");
        summary.approved++;
      } else if (action === "reject") {
        await supabase.from("pinterest_pin_queue").update({
          status: "rejected",
          rejection_reason: `editor_in_chief:${reason}`,
          updated_at: new Date().toISOString(),
        }).eq("id", d0.id).eq("status", "draft");
        summary.rejected++;
      } else {
        await supabase.from("pinterest_pin_queue").update({
          ...after,
          priority: Math.max(0, (current.priority ?? 50) - 40),
          updated_at: new Date().toISOString(),
        }).eq("id", d0.id).eq("status", "draft");
        summary.downranked++;
      }
    } else {
      // dry-run counters
      if (action === "approve") summary.approved++;
      else if (action === "reject") summary.rejected++;
      else summary.downranked++;
    }

    await supabase.from("pinterest_editor_decisions").insert({
      run_id: traceId,
      draft_id: d0.id,
      product_slug: d0.product_slug,
      iteration: improvements.length,
      composite_score: scored.composite,
      axes: scored.axes,
      expected,
      feed_impact: feedSnapshot ? { source: "gv41-feed-quality", snapshot: feedSnapshot } : {},
      improvements,
      action,
      reason,
      pass_reasons: passReasons,
      fail_reasons: failReasons,
      before_snapshot: before,
      after_snapshot: { pin_title: current.pin_title, hook: current.hook, pin_description: current.pin_description, hashtags: current.hashtags },
    });

    decisions.push({
      draft_id: d0.id, action, composite: scored.composite, iterations: improvements.length,
      axes: scored.axes, expected, pass_reasons: passReasons, fail_reasons: failReasons,
    });
  }

  return new Response(JSON.stringify({
    ok: true, traceId, dryRun, minScore, maxIter,
    feed: feedSnapshot ? { used: true } : { used: false },
    summary, decisions,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});