// Offline unit tests for merchant-api-reconciliation identity semantics.
// Runs with `deno test --allow-env --allow-net`.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDataSource, normalizeLocalUuid } from "./index.ts";

const UUID = "0d7a2c3b-8b1e-4a2e-9a4a-5e6f7a8b9c0d";

Deno.test("normalizeLocalUuid strips exactly one getpawsy_ prefix", () => {
  assertEquals(normalizeLocalUuid(`getpawsy_${UUID}`), UUID);
});

Deno.test("normalizeLocalUuid accepts bare uuid", () => {
  assertEquals(normalizeLocalUuid(UUID), UUID);
});

Deno.test("normalizeLocalUuid rejects non-uuid remainder", () => {
  assertEquals(normalizeLocalUuid("getpawsy_not-a-uuid"), null);
  assertEquals(normalizeLocalUuid("random-sku-123"), null);
  assertEquals(normalizeLocalUuid(""), null);
});

Deno.test("normalizeLocalUuid does not double-strip", () => {
  assertEquals(normalizeLocalUuid(`getpawsy_getpawsy_${UUID}`), null);
});

Deno.test("classifyDataSource FILE via fileInput", () => {
  assertEquals(classifyDataSource({ fileInput: { fetchSettings: {} } }), "FILE");
});

Deno.test("classifyDataSource API via primary input=API", () => {
  assertEquals(classifyDataSource({ primaryProductDataSource: { input: "API" } }), "API");
});

Deno.test("classifyDataSource AUTOFEED via primary input=AUTOFEED", () => {
  assertEquals(classifyDataSource({ primaryProductDataSource: { input: "AUTOFEED" } }), "AUTOFEED");
});

Deno.test("classifyDataSource does NOT infer AUTOFEED from defaultRule alone", () => {
  // Content API source should classify as API even though defaultRule is present.
  const ds = { primaryProductDataSource: { input: "API", defaultRule: { takeFromDataSources: [] } } };
  assertEquals(classifyDataSource(ds), "API");
});

Deno.test("classifyDataSource UNKNOWN when input missing", () => {
  assertEquals(classifyDataSource({ primaryProductDataSource: {} }), "UNKNOWN");
  assertEquals(classifyDataSource({}), "UNKNOWN");
});