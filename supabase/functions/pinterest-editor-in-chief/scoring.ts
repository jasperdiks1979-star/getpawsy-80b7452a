// Pure scoring helpers for the Editor-in-Chief gate. Extracted from index.ts
// so the 10-axis Pinterest psychology scorer + expected-lift heuristics can
// be unit-tested without booting Deno.serve, the Lovable AI gateway, or DB.

export type Draft = {
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

export const HELPFUL = ["how", "why", "tips", "guide", "checklist", "avoid", "fix", "stop", "ways", "before you", "what to", "best", "vs", "signs"];
export const LIFESTYLE = ["cozy", "morning", "sunny", "evening", "weekend", "kitchen", "living room", "bedroom", "patio", "balcony", "couch", "rv", "cafe", "outdoor", "garden", "fall", "spring", "summer"];
export const EDU = ["guide", "tutorial", "step", "explained", "science", "learn", "training", "behavior", "vet", "expert", "checklist"];
export const SHOWCASE = ["buy", "sale", "discount", "% off", "shop now", "new arrival", "shop", "deal"];
export const CURIOSITY = ["secret", "nobody tells", "actually", "truth", "the one", "surprising", "weird", "you didn't know", "hidden"];
export const PROBLEM = ["stops", "stops the", "fix", "no more", "without", "solve", "smell", "mess", "scratching", "anxiety"];
export const EMOTION = ["love", "happy", "calm", "cozy", "safe", "snuggle", "cuddle", "joy", "peace", "comfort"];
export const TRUST = ["vet", "expert", "tested", "safe", "non-toxic", "natural", "approved", "review"];
export const FUTURE = ["save for later", "next", "summer", "winter", "ideas", "inspiration", "checklist", "planner"];
export const SHARE = ["friends", "everyone", "share", "tag a", "pet parents", "fellow"];

function hits(text: string, terms: string[]) {
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
}

export function scoreAxes(d: Draft): { axes: Record<string, number>; composite: number; failing: string[] } {
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

  const w = { save: 0.20, native: 0.18, lifestyle: 0.10, emotion: 0.10, curiosity: 0.08, educational: 0.08, problem_solving: 0.08, trust: 0.08, future_use: 0.06, share: 0.04 };
  let composite = 0;
  for (const [k, v] of Object.entries(axes)) composite += v * (w as Record<string, number>)[k];
  composite = Math.round(composite);

  const failing = Object.entries(axes)
    .filter(([k, v]) => v < (k === "trust" || k === "future_use" ? 45 : 55))
    .map(([k]) => k);

  return { axes, composite, failing };
}

export function expectedLifts(composite: number, axes: Record<string, number>) {
  const norm = (n: number) => Math.max(0, Math.min(1, (n - 40) / 60));
  return {
    save_rate_pct:     +(0.4 + norm(axes.save) * 1.6).toFixed(2),
    discovery_lift_x: +(1 + norm(composite) * 2.2).toFixed(2),
    follow_lift_pct:  +(0.1 + norm(axes.trust) * 0.9).toFixed(2),
    purchase_intent:  +(0.2 + norm(axes.problem_solving) * 0.8 + norm(axes.lifestyle) * 0.4).toFixed(2),
    authority_lift:   +(norm(axes.educational) * 0.7 + norm(axes.native) * 0.5).toFixed(2),
  };
}

// Final editorial verdict — pure, deterministic, deciding approve/downrank/reject.
export function decideEditorAction(args: {
  composite: number;
  minScore: number;
  maxIter: number;
}): { action: "approve" | "downrank" | "reject"; reason: string } {
  const { composite, minScore, maxIter } = args;
  if (composite >= minScore) {
    return { action: "approve", reason: `composite=${composite}≥${minScore}` };
  }
  if (composite < Math.max(45, minScore - 20)) {
    return {
      action: "reject",
      reason: `composite=${composite}<${Math.max(45, minScore - 20)} after ${maxIter} iters`,
    };
  }
  return { action: "downrank", reason: `composite=${composite}/${minScore}` };
}