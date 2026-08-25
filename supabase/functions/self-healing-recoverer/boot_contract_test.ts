import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sourceUrl = new URL("./index.ts", import.meta.url);
const source = await Deno.readTextFile(sourceUrl);

Deno.test("recoverer uses a native npm import instead of a remote esm.sh boot dependency", () => {
  assert(source.includes('from "npm:@supabase/supabase-js@2.45.4"'));
  assertEquals(source.includes('from "https://esm.sh/@supabase/supabase-js@2.45.4"'), false);
});

Deno.test("recoverer exposes a read-only successful health no-op", () => {
  assert(source.includes('body.action === "health"'));
  assert(source.includes('outcome: "noop"'));
  assert(source.includes('mutations: 0'));
});