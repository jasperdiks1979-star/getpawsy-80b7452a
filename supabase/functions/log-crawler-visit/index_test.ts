// Integration test for the deployed `log-crawler-visit` edge function.
//
// Verifies that when the PDP bot-render-trace hook invokes the function with
// its standard payload shape, the function maps:
//   * the slug (encoded in pageUrl path) → crawler_visits.page_url
//   * the render-state tag (in userAgent suffix) → crawler_visits.user_agent
// 1:1 into the database row, for all three states: shell, rendered, timeout.
//
// The function is a public POST endpoint (no JWT required); we read the rows
// back with the service role key (the table's RLS only allows admin/service
// role to SELECT). Each test run uses unique slugs so we can safely clean up.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assertEquals,
  assertExists,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL =
  Deno.env.get("VITE_SUPABASE_URL") ??
  Deno.env.get("SUPABASE_URL") ??
  "https://nojvgfbcjgipjxpfatmm.supabase.co";

const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY") ??
  "";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1/log-crawler-visit`;
const ORIGIN = "https://getpawsy.pet";

// Verified Googlebot UA — the function's UA-only detection will mark this as
// `is_googlebot=true` only when the source IP also matches Google's published
// ranges. We don't rely on that flag here; we only assert payload mapping.
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

type RenderState = "shell" | "rendered" | "timeout";

/** Builds the exact payload shape produced by `usePdpBotRenderTrace`. */
function buildPayload(slug: string, state: RenderState) {
  const pageUrl = `${ORIGIN}/product/${slug}?_render=${state}&_trace=${
    state === "shell" ? "0" : state === "rendered" ? "120" : "8000"
  }`;
  const userAgent = `${GOOGLEBOT_UA} [pdp-render-trace:${state} +${
    state === "shell" ? "0" : state === "rendered" ? "120" : "8000"
  }ms]`;
  return { pageUrl, userAgent, referrer: `${ORIGIN}/` };
}

async function callFunction(body: unknown): Promise<Response> {
  return await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Edge runtime requires an apikey/Authorization for proxy admission;
      // the function itself does not validate the JWT.
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Polls `crawler_visits` until a row matching (page_url contains slug, ua
 * contains the state tag) is found, or the deadline is hit.
 */
async function waitForRow(
  supabase: ReturnType<typeof createClient>,
  slug: string,
  state: RenderState,
  timeoutMs = 10_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastRows: unknown[] = [];
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("crawler_visits")
      .select("page_url,user_agent,bot_type,referrer,is_googlebot,created_at")
      .ilike("page_url", `%/product/${slug}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    lastRows = data ?? [];
    const match = (data ?? []).find((r) =>
      String((r as { user_agent: string }).user_agent).includes(
        `pdp-render-trace:${state}`,
      )
    );
    if (match) return match as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Timed out waiting for crawler_visits row (slug=${slug}, state=${state}). Last rows: ${
      JSON.stringify(lastRows)
    }`,
  );
}

async function cleanup(
  supabase: ReturnType<typeof createClient>,
  slugs: string[],
) {
  for (const slug of slugs) {
    await supabase
      .from("crawler_visits")
      .delete()
      .ilike("page_url", `%/product/${slug}%`);
  }
}

const haveServiceRole = SERVICE_ROLE_KEY.length > 0;

Deno.test({
  name:
    "log-crawler-visit maps slug + pdp-render-trace state into crawler_visits row (shell, rendered, timeout)",
  ignore: !haveServiceRole,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Unique per run so concurrent CI runs don't collide.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slugs: Record<RenderState, string> = {
      shell: `it-render-trace-shell-${runId}`,
      rendered: `it-render-trace-rendered-${runId}`,
      timeout: `it-render-trace-timeout-${runId}`,
    };

    try {
      // --- 1. Invoke the function once per state with the hook's payload ---
      for (const state of ["shell", "rendered", "timeout"] as const) {
        const payload = buildPayload(slugs[state], state);
        const res = await callFunction(payload);
        const text = await res.text(); // always consume body (Deno guidance)
        assertEquals(
          res.status,
          200,
          `Edge function returned ${res.status} for state=${state}: ${text}`,
        );
      }

      // --- 2. Read each row back and verify field-by-field mapping ---------
      for (const state of ["shell", "rendered", "timeout"] as const) {
        const slug = slugs[state];
        const row = await waitForRow(supabase, slug, state);

        const pageUrl = String(row.page_url);
        const userAgent = String(row.user_agent);

        // Slug appears in the path exactly as sent.
        assertMatch(
          pageUrl,
          new RegExp(`/product/${slug}(?:[/?#]|$)`),
          `page_url for ${state} should contain /product/${slug}`,
        );

        // Mirror in the query param so log analysis on either field agrees.
        const url = new URL(pageUrl);
        assertEquals(url.searchParams.get("_render"), state);

        // State tag preserved verbatim in user_agent suffix.
        assertMatch(
          userAgent,
          new RegExp(`\\[pdp-render-trace:${state}\\b[^\\]]*\\]`),
          `user_agent for ${state} should carry the [pdp-render-trace:${state}] tag`,
        );

        // No cross-contamination between states.
        const otherStates = (
          ["shell", "rendered", "timeout"] as RenderState[]
        ).filter((s) => s !== state);
        for (const other of otherStates) {
          assertEquals(
            userAgent.includes(`pdp-render-trace:${other}`),
            false,
            `${state} payload must not carry the ${other} tag`,
          );
          assertEquals(
            pageUrl.includes(`_render=${other}`),
            false,
            `${state} pageUrl must not carry _render=${other}`,
          );
        }

        // The wrong slug must not appear in this row's page_url either.
        for (const otherState of otherStates) {
          assertEquals(
            pageUrl.includes(`/product/${slugs[otherState]}`),
            false,
            `${state} row should not reference the ${otherState} slug`,
          );
        }

        // Sanity: required columns are present on the row.
        assertExists(row.created_at);
        // bot_type may be 'Googlebot' or 'Googlebot (spoofed-ua)' depending on
        // the test runner's egress IP. Either way, it must be a Google* tag.
        const botType = row.bot_type === null ? "" : String(row.bot_type);
        assertMatch(
          botType,
          /Googlebot/,
          `bot_type should be a Googlebot variant, got "${botType}"`,
        );
      }
    } finally {
      await cleanup(supabase, Object.values(slugs));
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit rejects payloads missing pageUrl or userAgent with HTTP 400",
  async fn() {
    // No service role required — purely tests the function's validation path.
    const cases: Array<{ label: string; body: Record<string, unknown> }> = [
      { label: "missing pageUrl", body: { userAgent: GOOGLEBOT_UA } },
      { label: "missing userAgent", body: { pageUrl: `${ORIGIN}/product/x` } },
      { label: "empty body", body: {} },
    ];

    for (const { label, body } of cases) {
      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for ${label}, got ${res.status}: ${text}`,
      );
    }
  },
});