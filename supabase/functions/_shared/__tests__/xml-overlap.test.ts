import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function overlapCount(xmlOfferIds: Set<string>, candidates: string[]): number {
  let n = 0;
  for (const c of candidates) if (xmlOfferIds.has(c)) n++;
  return n;
}
function assertNoOverlap(xml: Set<string>, cand: string[]): void {
  if (overlapCount(xml, cand) > 0) throw new Error("xml_feed_overlap");
}

Deno.test("overlap guard throws when candidate present in XML", () => {
  let threw = false;
  try { assertNoOverlap(new Set(["getpawsy_a"]), ["getpawsy_a"]); } catch { threw = true; }
  assert(threw);
});

Deno.test("overlap guard passes when disjoint", () => {
  assertNoOverlap(new Set(["getpawsy_a"]), ["getpawsy_z"]);
  assertEquals(overlapCount(new Set(["getpawsy_a"]), ["getpawsy_z"]), 0);
});