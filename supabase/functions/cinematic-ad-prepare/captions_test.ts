import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SHOT_BLUEPRINTS, DEFAULT_SCENES } from "./index.ts";

// Phrases that were hardcoded in the original litter-box copy. None of these
// may appear in blueprint captions or default scene captions for any product
// genre — captions must be product-agnostic and adapt via the product name.
const FORBIDDEN = [
  "litter",
  "scoop",
  "scooping",
  "flip-top",
  "flip top",
  "odor",
  "odors",
  "enclosed",
  "cat will love",
  "tired of cleaning",
];

function assertNoForbidden(text: string, ctx: string) {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN) {
    assert(
      !lower.includes(phrase),
      `${ctx} must not contain hardcoded litter-box phrase "${phrase}": ${text}`,
    );
  }
}

const PRODUCTS = [
  "Choke-Proof Dog Chew Toy",
  "Premium Cat Tree Tower",
  "Orthopedic Dog Bed",
  "Interactive Puzzle Feeder",
];

Deno.test("SHOT_BLUEPRINTS captions are product-agnostic across genres", () => {
  for (const product of PRODUCTS) {
    for (const b of SHOT_BLUEPRINTS) {
      const caption = b.caption(product);
      assertNoForbidden(caption, `blueprint caption for "${product}"`);
    }
  }
});

Deno.test("DEFAULT_SCENES captions adapt to product name and contain no litter-box copy", () => {
  for (const product of PRODUCTS) {
    const scenes = DEFAULT_SCENES(product);
    assertEquals(scenes.length, 6, "must produce 6 scenes");
    // Scene 6 is the canonical CTA — explicitly allowed.
    assertEquals(scenes[5].caption, "Get yours at GetPawsy.pet");
    // Scene 2 must reference the actual product name, proving the copy is
    // wired to the product instead of a fixed cat-litter string.
    assert(
      scenes[1].caption.includes(product),
      `scene 2 caption should mention product name "${product}", got: ${scenes[1].caption}`,
    );
    for (const s of scenes) {
      assertNoForbidden(s.caption, `scene ${s.index} caption for "${product}"`);
    }
  }
});

Deno.test("Switching product genre changes the rendered captions", () => {
  const cat = DEFAULT_SCENES("Cat Tree Tower").map((s) => s.caption).join("|");
  const dog = DEFAULT_SCENES("Dog Chew Toy").map((s) => s.caption).join("|");
  assert(cat !== dog, "captions must differ when product genre changes");
  assert(dog.toLowerCase().includes("dog chew toy"), "dog captions must mention dog product");
  assert(cat.toLowerCase().includes("cat tree tower"), "cat captions must mention cat product");
});