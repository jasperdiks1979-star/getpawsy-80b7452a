// Integration test for the deployed `cj-dropshipping` edge function.
//
// Verifies that a request signed with a valid Supabase user access token
// returns HTTP 200 and a CJ payload with the expected shape.
//
// Requires the following env vars (loaded from project-root `.env` +
// optional shell env for the test credentials):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY
//   TEST_USER_EMAIL        (a real confirmed user in this project)
//   TEST_USER_PASSWORD
//
// Run with:
//   deno test --allow-net --allow-env --allow-read \
//     supabase/functions/cj-dropshipping/index.test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const TEST_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");

async function getAccessToken(): Promise<string> {
  assert(SUPABASE_URL, "VITE_SUPABASE_URL must be set");
  assert(SUPABASE_ANON_KEY, "VITE_SUPABASE_PUBLISHABLE_KEY must be set");
  assert(TEST_EMAIL, "TEST_USER_EMAIL must be set to run this test");
  assert(TEST_PASSWORD, "TEST_USER_PASSWORD must be set to run this test");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL!,
    password: TEST_PASSWORD!,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Sign-in failed: ${error?.message ?? "no session"}`);
  }
  return data.session.access_token;
}

Deno.test("cj-dropshipping returns 200 with expected payload for authed user", async () => {
  const token = await getAccessToken();

  const res = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "list-products", pageNum: 1, pageSize: 1 }),
  });

  const bodyText = await res.text();
  assertEquals(
    res.status,
    200,
    `Expected 200 OK, got ${res.status}. Body: ${bodyText}`,
  );

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`Response was not JSON: ${bodyText}`);
  }

  // CJ envelope: { code: 200, data: { list: [...] } }
  assert(typeof body === "object" && body !== null, "body must be an object");
  const obj = body as Record<string, unknown>;
  assertEquals(obj.code, 200, `CJ code should be 200, got ${obj.code}`);
  assert("data" in obj, "response missing `data`");
  const data = obj.data as Record<string, unknown>;
  assert(Array.isArray(data.list), "`data.list` must be an array");

  const list = data.list as Array<Record<string, unknown>>;
  assert(list.length > 0, "`data.list` should contain at least one product");
  const first = list[0];
  for (const field of ["pid", "productNameEn", "productSku", "productImage"]) {
    assert(
      typeof first[field] === "string" && (first[field] as string).length > 0,
      `First product missing string field \`${field}\``,
    );
  }
});

Deno.test("cj-dropshipping rejects requests without an Authorization header", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cj-dropshipping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: "list-products", pageNum: 1, pageSize: 1 }),
  });
  await res.text(); // consume body to avoid resource leak
  assert(
    res.status === 401 || res.status === 403,
    `Expected 401/403 for unauthenticated request, got ${res.status}`,
  );
});