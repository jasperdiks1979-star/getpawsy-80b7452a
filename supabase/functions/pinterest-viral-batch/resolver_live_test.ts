import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

Deno.test("pinterest-viral-batch resolves known slug without transport_error", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-viral-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      dryRun: true,
      productOnly: true,
      useLifestyleBackdrop: false,
      pinLimit: 1,
      slug: SLUG,
      slugs: [SLUG],
    }),
  });

  const text = await res.text();
  assertEquals(res.status, 200, `Expected 200, got ${res.status}: ${text.slice(0, 500)}`);

  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 500)}`);
  }

  const blob = JSON.stringify(json);
  assert(!/transport_error/i.test(blob), `Response contained transport_error: ${blob.slice(0, 500)}`);
  assert(!/non-2xx/i.test(blob), `Response contained non-2xx marker: ${blob.slice(0, 500)}`);

  assertEquals(json.ok, true, `Expected ok:true, got: ${blob.slice(0, 500)}`);

  // Locate resolver lookup diagnostics anywhere in the payload.
  const lookup =
    json.lookup ??
    json.results?.[0]?.lookup ??
    json.previews?.[0]?.lookup ??
    json.debug?.lookup;

  assert(lookup, `Missing lookup diagnostics in response: ${blob.slice(0, 500)}`);
  assert(
    typeof lookup.resolved_id === "string" && lookup.resolved_id.length > 0,
    `Invalid resolved_id: ${JSON.stringify(lookup)}`,
  );
  assert(
    typeof lookup.resolved_title === "string" && lookup.resolved_title.length > 0,
    `Invalid resolved_title: ${JSON.stringify(lookup)}`,
  );
});