import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractStrictQcJson } from "./index.ts";

Deno.test("strict JSON response parses", () => {
  const v = extractStrictQcJson('{"score":92,"ok":true,"reasons":["clean"]}');
  assertEquals(v?.score, 92);
  assertEquals(v?.ok, true);
  assertEquals(v?.reasons, ["clean"]);
});

Deno.test("JSON wrapped in markdown fence parses", () => {
  const raw = "Sure!\n```json\n{\"score\":81,\"ok\":true,\"reasons\":[]}\n```";
  const v = extractStrictQcJson(raw);
  assertEquals(v?.score, 81);
  assertEquals(v?.ok, true);
});

Deno.test("prose-only response returns null", () => {
  const v = extractStrictQcJson(
    "This is a beautiful image of a cat with the toy. Great composition!",
  );
  assertEquals(v, null);
});

Deno.test("malformed JSON returns null", () => {
  const v = extractStrictQcJson('{"score":92,"ok":true,"reasons":[');
  assertEquals(v, null);
});

Deno.test("JSON embedded after prose is recovered", () => {
  const raw = 'Verdict below.\n{"score":74,"ok":false,"reasons":["overlay"]}';
  const v = extractStrictQcJson(raw);
  assertEquals(v?.score, 74);
  assertEquals(v?.ok, false);
  assertEquals(v?.reasons, ["overlay"]);
});