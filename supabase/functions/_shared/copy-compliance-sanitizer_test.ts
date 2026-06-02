import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  sanitizeCompliance,
  sanitizeCreativeKit,
} from "./copy-compliance-sanitizer.ts";

Deno.test("sanitizer rewrites 'heal' word-bounded and preserves case", () => {
  const r = sanitizeCompliance("Helps Heal joints fast");
  assertEquals(r.changed, true);
  assertEquals(r.text, "Helps Comfort joints fast");
});

Deno.test("sanitizer is idempotent", () => {
  const r1 = sanitizeCompliance("vet-approved healing pads");
  const r2 = sanitizeCompliance(r1.text);
  assertEquals(r2.changed, false);
  assertEquals(r1.text, r2.text);
});

Deno.test("sanitizer does not touch innocent substrings", () => {
  // 'health' contains 'heal' but must NOT be replaced (word boundary).
  const r = sanitizeCompliance("Good health for cats");
  assertEquals(r.changed, false);
  assertEquals(r.text, "Good health for cats");
});

Deno.test("sanitizeCreativeKit scrubs nested storyboard and hook variants", () => {
  const out = sanitizeCreativeKit({
    pin_title: "Heal anxiety naturally",
    pin_description: "vet-approved comfort for pets",
    hook_variants: [{ text: "Cure your dog's stress" }],
    cta_variants: [{ text: "Shop now" }],
    storyboard: { scenes: [{ on_screen_text: "Treatment for restless nights" }] },
    hashtags: ["#pet"],
  } as any);
  assert(out.changed);
  assertEquals(out.kit.pin_title, "Comfort anxiety naturally");
  assert(!out.kit.pin_description.includes("vet-approved"));
  assertEquals((out.kit.hook_variants as any)[0].text.startsWith("Help"), true);
  assert(!(out.kit.storyboard as any).scenes[0].on_screen_text.toLowerCase().includes("treatment"));
});