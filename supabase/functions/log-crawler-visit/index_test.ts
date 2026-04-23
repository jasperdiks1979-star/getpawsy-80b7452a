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
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
// deno-lint-ignore no-explicit-any
async function waitForRow(
  supabase: SupabaseClient<any, any, any>,
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

// deno-lint-ignore no-explicit-any
async function cleanup(
  supabase: SupabaseClient<any, any, any>,
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

Deno.test({
  name:
    "log-crawler-visit rejects pageUrl/userAgent above the 2048-char max length with HTTP 400 + INVALID_PAYLOAD",
  async fn() {
    // The Zod schema in index.ts caps both fields at 2048 chars. We exercise:
    //   1. exact boundary (2048) → must NOT be rejected for length
    //   2. boundary+1 (2049)     → must be rejected with INVALID_PAYLOAD
    //   3. far-over (5000)       → must be rejected with INVALID_PAYLOAD
    //   4. both fields oversized → fieldErrors must mention BOTH fields
    const MAX_LEN = 2048;

    // Build a pageUrl of exact length N. Pad the path with `a`s so the URL
    // stays syntactically valid and the slug is unique per run.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buildPageUrlOfLength = (n: number) => {
      const prefix = `${ORIGIN}/product/len-${runId}-`;
      const padLen = Math.max(0, n - prefix.length);
      return prefix + "a".repeat(padLen);
    };
    // Build a userAgent of exact length N by padding the Googlebot UA with
    // a long bracketed suffix (preserves "looks like a real UA").
    const buildUserAgentOfLength = (n: number) => {
      const prefix = `${GOOGLEBOT_UA} [pad=`;
      const suffix = `]`;
      const padLen = Math.max(0, n - prefix.length - suffix.length);
      return prefix + "x".repeat(padLen) + suffix;
    };

    // -----------------------------------------------------------------------
    // 1. Exact boundary — must be ACCEPTED (length-wise). The function may
    //    still return 200 OK; we only assert it is *not* a 400 with a
    //    length-related field error, since other validation passes.
    // -----------------------------------------------------------------------
    {
      const body = {
        pageUrl: buildPageUrlOfLength(MAX_LEN),
        userAgent: buildUserAgentOfLength(MAX_LEN),
      };
      assertEquals(body.pageUrl.length, MAX_LEN);
      assertEquals(body.userAgent.length, MAX_LEN);

      const res = await callFunction(body);
      const text = await res.text();
      // Must not be rejected purely for being too long.
      // (200 is the happy path; anything else is acceptable as long as it
      // doesn't claim a length violation.)
      if (res.status === 400) {
        assertEquals(
          text.includes("exceeds 2048 chars"),
          false,
          `boundary-length payload (${MAX_LEN}) must not be rejected for length, got: ${text}`,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. boundary+1 on pageUrl alone — must be 400 INVALID_PAYLOAD with a
    //    fieldErrors entry mentioning pageUrl + "exceeds 2048 chars".
    // -----------------------------------------------------------------------
    {
      const body = {
        pageUrl: buildPageUrlOfLength(MAX_LEN + 1),
        userAgent: GOOGLEBOT_UA,
      };
      assertEquals(body.pageUrl.length, MAX_LEN + 1);

      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for over-long pageUrl (len=${body.pageUrl.length}), got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(json.code, "INVALID_PAYLOAD");
      assertExists(json.fieldErrors?.pageUrl, "fieldErrors.pageUrl missing");
      assertMatch(
        String((json.fieldErrors.pageUrl as string[]).join(" | ")),
        /exceeds 2048 chars/,
        "pageUrl error message should mention the 2048-char cap",
      );
      // userAgent must NOT be flagged when only pageUrl is over the limit.
      assertEquals(
        json.fieldErrors?.userAgent,
        undefined,
        "userAgent must not be flagged when only pageUrl is over-long",
      );
    }

    // -----------------------------------------------------------------------
    // 3. far-over on userAgent alone — same shape, mirrored field.
    // -----------------------------------------------------------------------
    {
      const body = {
        pageUrl: `${ORIGIN}/product/over-${runId}`,
        userAgent: buildUserAgentOfLength(5000),
      };
      assertEquals(body.userAgent.length, 5000);

      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for far-over userAgent (len=${body.userAgent.length}), got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(json.code, "INVALID_PAYLOAD");
      assertExists(json.fieldErrors?.userAgent, "fieldErrors.userAgent missing");
      assertMatch(
        String((json.fieldErrors.userAgent as string[]).join(" | ")),
        /exceeds 2048 chars/,
        "userAgent error message should mention the 2048-char cap",
      );
      assertEquals(
        json.fieldErrors?.pageUrl,
        undefined,
        "pageUrl must not be flagged when only userAgent is over-long",
      );
    }

    // -----------------------------------------------------------------------
    // 4. BOTH fields oversized — fieldErrors must surface BOTH violations
    //    in a single response so callers can fix both at once.
    // -----------------------------------------------------------------------
    {
      const body = {
        pageUrl: buildPageUrlOfLength(MAX_LEN + 100),
        userAgent: buildUserAgentOfLength(MAX_LEN + 100),
      };
      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 when both fields are over-long, got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(json.code, "INVALID_PAYLOAD");
      assertExists(json.fieldErrors?.pageUrl);
      assertExists(json.fieldErrors?.userAgent);
      assertMatch(
        String((json.fieldErrors.pageUrl as string[]).join(" | ")),
        /exceeds 2048 chars/,
      );
      assertMatch(
        String((json.fieldErrors.userAgent as string[]).join(" | ")),
        /exceeds 2048 chars/,
      );
      // Validation counters should reflect both fields incremented.
      assertExists(json.validationCounters);
    }
  },
});

// =============================================================================
// Persistence fidelity tests
// =============================================================================
// The earlier "maps slug + pdp-render-trace state" test asserts the right
// *shape* lands in the DB (regex contains/match). These tests tighten that
// contract: the row must hold the slug-bearing pageUrl and the validated
// state-tagged userAgent **byte-for-byte** as the client sent them — the edge
// function must not URL-decode, lowercase, trim trailing params, or otherwise
// massage either field. This is what downstream log-greps and the bot-trace
// dashboard rely on.
// =============================================================================

/** Re-implementation of the function's slug extractor for round-trip checks. */
function extractSlugFromPersistedUrl(persistedPageUrl: string): string | null {
  try {
    const u = new URL(persistedPageUrl, "https://getpawsy.pet");
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

/** Re-implementation of the function's state-tag extractor. */
function extractStateFromPersistedUa(persistedUa: string): string | null {
  // Accept both the slash form (`pdp-render-trace/<state>`) used by the
  // server-side regex AND the colon form (`pdp-render-trace:<state>`) emitted
  // by `usePdpBotRenderTrace`. The bracketed-suffix form is also supported.
  const m = persistedUa.match(/pdp-render-trace[\/:]([a-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

Deno.test({
  name:
    "log-crawler-visit persists pageUrl + userAgent verbatim — slug and validated pdp-render-trace state survive 1:1",
  ignore: !haveServiceRole,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slugs: Record<RenderState, string> = {
      shell: `it-persist-shell-${runId}`,
      rendered: `it-persist-rendered-${runId}`,
      timeout: `it-persist-timeout-${runId}`,
    };

    // Build the payloads ONCE so the assertions can reference the exact same
    // strings we transmitted (defends against accidental drift in buildPayload).
    const payloads: Record<RenderState, ReturnType<typeof buildPayload>> = {
      shell: buildPayload(slugs.shell, "shell"),
      rendered: buildPayload(slugs.rendered, "rendered"),
      timeout: buildPayload(slugs.timeout, "timeout"),
    };

    try {
      // --- 1. Send each payload and require a 200 OK ----------------------
      for (const state of ["shell", "rendered", "timeout"] as const) {
        const res = await callFunction(payloads[state]);
        const text = await res.text();
        assertEquals(
          res.status,
          200,
          `Edge function returned ${res.status} for state=${state}: ${text}`,
        );
      }

      // --- 2. For each state, read back the row and assert byte-for-byte
      //        equality of the two fields the dashboard depends on. ---------
      for (const state of ["shell", "rendered", "timeout"] as const) {
        const slug = slugs[state];
        const expected = payloads[state];
        const row = await waitForRow(supabase, slug, state);

        const persistedPageUrl = String(row.page_url);
        const persistedUa = String(row.user_agent);
        const persistedReferrer =
          row.referrer === null ? null : String(row.referrer);

        // Verbatim equality — these are the strongest assertions in this file.
        assertEquals(
          persistedPageUrl,
          expected.pageUrl,
          `page_url for ${state} must be persisted byte-for-byte as sent`,
        );
        assertEquals(
          persistedUa,
          expected.userAgent,
          `user_agent for ${state} must be persisted byte-for-byte as sent`,
        );
        assertEquals(
          persistedReferrer,
          expected.referrer,
          `referrer for ${state} must be persisted as sent`,
        );

        // Round-trip: derive the slug from the persisted page_url and confirm
        // it equals the slug we encoded into the request. This proves the
        // last-segment extraction the function uses for trace validation is
        // also stable against the persisted value.
        const derivedSlug = extractSlugFromPersistedUrl(persistedPageUrl);
        assertEquals(
          derivedSlug,
          slug,
          `slug derived from persisted page_url must equal the slug sent (state=${state})`,
        );

        // Round-trip: derive the validated state tag from the persisted
        // user_agent and confirm it equals the state we asked for. If the
        // function ever starts stripping the bracketed suffix, this fails.
        const derivedState = extractStateFromPersistedUa(persistedUa);
        assertEquals(
          derivedState,
          state,
          `state derived from persisted user_agent must equal the state sent (state=${state})`,
        );

        // The `_render` query param must also survive verbatim, since some
        // dashboards key off the URL and not the UA.
        const url = new URL(persistedPageUrl);
        assertEquals(
          url.searchParams.get("_render"),
          state,
          `_render query param must equal "${state}" on the persisted row`,
        );

        // Sanity: the row must have an auto-populated created_at.
        assertExists(row.created_at, "created_at must be set on insert");
      }
    } finally {
      await cleanup(supabase, Object.values(slugs));
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit does NOT persist a row when the pdp-render-trace state tag is invalid (rejection is total)",
  ignore: !haveServiceRole,
  async fn() {
    // Complement to the persistence test: if the function rejects a trace
    // payload (because the state tag is unknown), it must NOT have written a
    // half-baked row. Otherwise the dashboard would silently accumulate rows
    // tagged with invalid states and the validation counters would be lying.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const slug = `it-reject-bogus-state-${runId}`;
    const bogusState = "halfrendered"; // not in {shell, rendered, timeout}

    // Mirror the hook's payload shape but with an unknown state tag. We use
    // the slash form here so the server-side regex *does* match the tag and
    // can therefore classify it as INVALID_PDP_RENDER_STATE (vs. the more
    // generic MISSING_FIELDS path, which is exercised elsewhere).
    const pageUrl = `${ORIGIN}/product/${slug}?_render=${bogusState}`;
    const userAgent =
      `${GOOGLEBOT_UA} [pdp-render-trace/${bogusState} +1ms]`;

    try {
      const res = await callFunction({ pageUrl, userAgent });
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for bogus state tag, got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        "INVALID_PDP_RENDER_STATE",
        `expected INVALID_PDP_RENDER_STATE code, got ${json.code}`,
      );

      // Give Postgres a beat in case an erroneous insert is in flight, then
      // confirm there is NO row for this slug.
      await new Promise((r) => setTimeout(r, 750));
      const { data, error } = await supabase
        .from("crawler_visits")
        .select("page_url,user_agent,created_at")
        .ilike("page_url", `%/product/${slug}%`)
        .limit(5);
      if (error) throw error;
      assertEquals(
        (data ?? []).length,
        0,
        `crawler_visits must not contain any row for the rejected slug, found: ${
          JSON.stringify(data)
        }`,
      );
    } finally {
      // Defensive cleanup in case the function ever regresses and writes a row.
      await cleanup(supabase, [slug]);
    }
  },
});