// Integration test: for every function protected by requireInternalOrAdmin,
// hit the deployed URL without any auth (and once with a wrong internal
// secret) and confirm the request is rejected with 401/403. This is the
// production-side proof that no guarded intelligence/orchestrator endpoint
// is reachable without either the shared internal secret or an admin JWT.
//
// Reads SUPABASE_URL from the repo .env via std/dotenv. When the URL is not
// available (e.g. offline dev sandbox) the test is skipped rather than
// failed so local `deno test` runs stay green.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GUARDED_EDGE_FUNCTIONS } from "./guarded-functions.ts";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "";

// Statuses we accept as "guard rejected the call". Anything <400 means the
// function actually processed the request and is a hard failure.
const REJECT_STATUSES = new Set([401, 403]);

async function callGuarded(
  functionName: string,
  extraHeaders: Record<string, string>,
): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify({ dryRun: true }),
  });
  // Consume body to satisfy Deno's resource tracker.
  await res.arrayBuffer();
  return res.status;
}

for (const fn of GUARDED_EDGE_FUNCTIONS) {
  Deno.test({
    name: `guarded/${fn} rejects unauthenticated requests`,
    ignore: !SUPABASE_URL,
    fn: async () => {
      const status = await callGuarded(fn, {});
      assert(
        REJECT_STATUSES.has(status),
        `${fn} accepted unauthenticated call (status ${status}); expected 401/403`,
      );
    },
  });

  Deno.test({
    name: `guarded/${fn} rejects wrong x-internal-secret`,
    ignore: !SUPABASE_URL,
    fn: async () => {
      const status = await callGuarded(fn, {
        "x-internal-secret": "definitely-not-the-real-secret",
      });
      assert(
        REJECT_STATUSES.has(status),
        `${fn} accepted wrong internal secret (status ${status}); expected 401/403`,
      );
    },
  });
}