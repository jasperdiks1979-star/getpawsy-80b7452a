// Deno unit tests for the pre-publish gate's pure scoring + decision helpers.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classify, nativeScore, decideAction, type Row } from "./scoring.ts";

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "r1",
    status: "draft",
    priority: 50,
    category_key: "cat_tree",
    content_type: null,
    pin_title: null,
    pin_description: null,
    hashtags: null,
    meta: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

Deno.test("classify: explicit content_type wins", () => {
  assertEquals(classify(row({ content_type: "lifestyle" })), "lifestyle");
  assertEquals(classify(row({ content_type: "educational" })), "educational");
});

Deno.test("classify: falls back to meta.content_type", () => {
  assertEquals(classify(row({ content_type: "product", meta: { content_type: "seasonal" } })), "seasonal");
});

Deno.test("classify: falls back to meta.pin_type when content_type is absent", () => {
  assertEquals(classify(row({ content_type: "product", meta: { pin_type: "entertainment" } })), "entertainment");
});

Deno.test("classify: default is product_showcase when nothing tags it", () => {
  assertEquals(classify(row({ content_type: "product" })), "product_showcase");
  assertEquals(classify(row()), "product_showcase");
});

Deno.test("nativeScore: salesy showcase copy scores low", () => {
  const { score, axes } = nativeScore(row({
    pin_title: "Shop the sale — 20% off, buy now",
    pin_description: "Shop now and grab this deal before it ends.",
    hashtags: ["sale", "shop"],
  }));
  assert(score < 30, `expected low native score, got ${score}`);
  assert(axes.showcasePenalty > 0);
});

Deno.test("nativeScore: helpful + lifestyle + edu copy scores high", () => {
  const { score } = nativeScore(row({
    pin_title: "How to stop cat scratching: a vet-approved guide",
    pin_description: "A cozy morning guide explaining the science behind training cats. Tips and a checklist for the kitchen and living room. Step-by-step tutorial.",
    hashtags: ["catbehavior", "training"],
  }));
  assert(score >= 70, `expected high native score, got ${score}`);
});

Deno.test("nativeScore: rewards substantive long-form descriptions", () => {
  const short = nativeScore(row({
    pin_title: "How to stop scratching",
    pin_description: "Tips for a calm living room.",
    hashtags: ["guide"],
  }));
  const long = nativeScore(row({
    pin_title: "How to stop scratching",
    pin_description:
      "Tips for a calm living room. Keep the same helpful signals while adding enough context for a saved Pinterest idea that explains placement, timing, and pet parent routines.",
    hashtags: ["guide"],
  }));
  assertEquals(long.score, short.score + 10);
});

Deno.test("nativeScore: bounded 0..100", () => {
  for (let i = 0; i < 20; i++) {
    const { score } = nativeScore(row({ pin_title: "x".repeat(i * 5), pin_description: "y".repeat(i * 10) }));
    assert(score >= 0 && score <= 100, `out of range: ${score}`);
  }
});

Deno.test("decideAction: low-score showcase is rejected", () => {
  const d = decideAction({ score: 20, minScore: 55, type: "product_showcase", overType: false, overCat: false });
  assertEquals(d.action, "reject");
  assert(d.reason.includes("showcase"));
});

Deno.test("decideAction: low-score non-showcase is downranked", () => {
  const d = decideAction({ score: 20, minScore: 55, type: "lifestyle", overType: false, overCat: false });
  assertEquals(d.action, "downrank");
});

Deno.test("decideAction: passing score with over-category is downranked", () => {
  const d = decideAction({ score: 80, minScore: 55, type: "lifestyle", overType: false, overCat: true });
  assertEquals(d.action, "downrank");
  assert(d.reason.includes("over_category"));
});

Deno.test("decideAction: passing score and balanced is kept", () => {
  const d = decideAction({ score: 80, minScore: 55, type: "lifestyle", overType: false, overCat: false });
  assertEquals(d.action, "keep");
});

Deno.test("decideAction: low-score over-type is rejected with reason chain", () => {
  const d = decideAction({ score: 30, minScore: 55, type: "lifestyle", overType: true, overCat: true });
  assertEquals(d.action, "reject");
  assert(d.reason.includes("over_type(lifestyle)"));
  assert(d.reason.includes("over_category"));
});

Deno.test("decideAction: low-score over-category non-showcase is rejected", () => {
  const d = decideAction({ score: 40, minScore: 55, type: "educational", overType: false, overCat: true });
  assertEquals(d.action, "reject");
  assert(d.reason.includes("over_category"));
});