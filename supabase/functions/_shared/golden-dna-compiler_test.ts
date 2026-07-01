import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDeterministicPrompt,
  compilePrompt,
  compilerQA,
  extractProductRules,
  mutateForBlocker,
  predictPre,
  ruleHash,
} from "./golden-dna-compiler.ts";

Deno.test("extractProductRules locks species for a dog collar", () => {
  const r = extractProductRules({ name: "Reflective Dog Collar", description: "For puppies and adult dogs" });
  assertEquals(r.species, "dog");
  assert(r.forbidden_species.includes("cat"));
});

Deno.test("extractProductRules locks species for a cat tree", () => {
  const r = extractProductRules({ name: "Modern Cat Tree", description: "Perfect for kittens" });
  assertEquals(r.species, "cat");
  assert(r.forbidden_species.includes("dog"));
});

Deno.test("buildDeterministicPrompt embeds species lock, occupancy and negative block", () => {
  const r = extractProductRules({ name: "Reflective Dog Collar" });
  const p = buildDeterministicPrompt({ name: "Reflective Dog Collar" }, r);
  assert(p.includes("DOG ONLY"));
  assert(p.includes("Product occupancy target"));
  assert(p.includes("MUST NOT include"));
});

Deno.test("compilerQA flags unknown species", () => {
  const r = extractProductRules({ name: "Mystery item" });
  const p = buildDeterministicPrompt({ name: "Mystery item" }, r);
  const qa = compilerQA({ name: "Mystery item" }, r, p);
  assert(!qa.ok);
  assert(qa.blockers.includes("species_ambiguity"));
});

Deno.test("mutateForBlocker raises occupancy target and never resends same rules", () => {
  const r = extractProductRules({ name: "Reflective Dog Collar" });
  const before = r.product_occupancy_target;
  const next = mutateForBlocker(r, "occupancy");
  assert(next.product_occupancy_target > before);
});

Deno.test("predictPre penalizes unknown species and rewards clean QA", () => {
  const clean = extractProductRules({ name: "Reflective Dog Collar" });
  const cleanPrompt = buildDeterministicPrompt({ name: "Reflective Dog Collar" }, clean);
  const cleanQa = compilerQA({ name: "Reflective Dog Collar" }, clean, cleanPrompt);
  const cleanScore = predictPre(clean, cleanQa);

  const dirty = extractProductRules({ name: "Mystery item" });
  const dirtyPrompt = buildDeterministicPrompt({ name: "Mystery item" }, dirty);
  const dirtyQa = compilerQA({ name: "Mystery item" }, dirty, dirtyPrompt);
  const dirtyScore = predictPre(dirty, dirtyQa);

  assert(cleanScore > dirtyScore);
});

Deno.test("compilePrompt orchestrator passes for a well-defined product", () => {
  const res = compilePrompt({
    name: "Reflective Dog Collar",
    description: "Adjustable dog collar for outdoor walks",
    landing_dominant_colors: ["#123456", "warm neutral"],
  });
  assert(res.ok, `expected ok, reason=${res.reason}`);
  assert(res.predicted_pre >= 90);
});

Deno.test("compilePrompt gate blocks Gemini for ambiguous products", () => {
  const res = compilePrompt({ name: "Mystery item" }, { maxMutations: 0 });
  assert(!res.ok);
  assertEquals(res.mutation_step, 0);
});

Deno.test("ruleHash is stable across identical inputs", () => {
  const r = extractProductRules({ name: "Reflective Dog Collar" });
  const p = buildDeterministicPrompt({ name: "Reflective Dog Collar" }, r);
  assertEquals(ruleHash(r, p), ruleHash(r, p));
});