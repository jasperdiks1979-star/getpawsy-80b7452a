// Deno unit tests for the Editor-in-Chief 10-axis scorer + verdict logic.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scoreAxes, expectedLifts, decideEditorAction, type Draft } from "./scoring.ts";

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "d1",
    product_slug: "cat-tree",
    category_key: "cat_tree",
    content_type: "product",
    pin_title: "",
    pin_description: "",
    hashtags: [],
    hook: "",
    meta: null,
    priority: 50,
    ...overrides,
  };
}

Deno.test("scoreAxes: produces all 10 axes in [0,100]", () => {
  const r = scoreAxes(draft({ pin_title: "Hello", pin_description: "world" }));
  const expected = ["save","share","curiosity","trust","lifestyle","educational","problem_solving","emotion","future_use","native"];
  for (const k of expected) {
    assert(k in r.axes, `missing axis ${k}`);
    const v = r.axes[k];
    assert(v >= 0 && v <= 100, `${k}=${v} out of range`);
  }
  assert(r.composite >= 0 && r.composite <= 100);
});

Deno.test("scoreAxes: salesy product copy depresses composite vs editorial copy", () => {
  const salesy = scoreAxes(draft({
    content_type: "product",
    pin_title: "Buy now — 50% off sale, shop now deal",
    pin_description: "Shop the sale, buy now, % off everything.",
    hook: "Shop now",
    hashtags: ["sale", "deal", "shop"],
  }));
  const editorial = scoreAxes(draft({
    content_type: "lifestyle",
    pin_title: "Cozy morning rituals every cat parent will love",
    pin_description: "Save for later: 7 cozy ideas for a peaceful, vet-approved morning with your cat. Lifestyle inspiration for the kitchen, bedroom and balcony — a checklist you'll actually use.",
    hook: "A calm morning idea",
    hashtags: ["catlife", "cozy", "inspiration"],
  }));
  assert(editorial.composite > salesy.composite + 10, `editorial=${editorial.composite} salesy=${salesy.composite}`);
});

Deno.test("scoreAxes: identifies failing axes for weak drafts", () => {
  const r = scoreAxes(draft({ pin_title: "x", pin_description: "y", hook: "z" }));
  assert(r.failing.length > 0);
  // Curiosity should be failing on an empty/trivial draft.
  assert(r.failing.includes("curiosity") || r.composite < 55);
});

Deno.test("expectedLifts: monotonic in axis strength", () => {
  const weak = expectedLifts(40, { save: 0, trust: 0, problem_solving: 0, lifestyle: 0, educational: 0, native: 0 });
  const strong = expectedLifts(90, { save: 100, trust: 100, problem_solving: 100, lifestyle: 100, educational: 100, native: 100 });
  assert(strong.save_rate_pct > weak.save_rate_pct);
  assert(strong.discovery_lift_x > weak.discovery_lift_x);
  assert(strong.follow_lift_pct > weak.follow_lift_pct);
  assert(strong.purchase_intent > weak.purchase_intent);
  assert(strong.authority_lift > weak.authority_lift);
});

Deno.test("expectedLifts: stable bounds", () => {
  const e = expectedLifts(50, { save: 50, trust: 50, problem_solving: 50, lifestyle: 50, educational: 50, native: 50 });
  assert(e.discovery_lift_x >= 1);
  assert(e.save_rate_pct >= 0.4);
});

Deno.test("decideEditorAction: approves when at or above minScore", () => {
  assertEquals(decideEditorAction({ composite: 70, minScore: 70, maxIter: 2 }).action, "approve");
  assertEquals(decideEditorAction({ composite: 85, minScore: 70, maxIter: 2 }).action, "approve");
});

Deno.test("decideEditorAction: rejects when below floor (max(45, minScore-20))", () => {
  // minScore=70 → floor=50. composite=40 < 50 ⇒ reject.
  assertEquals(decideEditorAction({ composite: 40, minScore: 70, maxIter: 2 }).action, "reject");
  // minScore=55 → floor=45. composite=44 < 45 ⇒ reject.
  assertEquals(decideEditorAction({ composite: 44, minScore: 55, maxIter: 2 }).action, "reject");
});

Deno.test("decideEditorAction: downranks in the middle band", () => {
  // minScore=70 → floor=50. composite=55 ⇒ downrank (between 50 and 70).
  assertEquals(decideEditorAction({ composite: 55, minScore: 70, maxIter: 2 }).action, "downrank");
});