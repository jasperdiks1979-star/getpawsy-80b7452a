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

// =============================================================================
// Failure taxonomy used by the admin dashboard
// =============================================================================
// The "Crawler Sampling Decisions" dashboard groups failures by a single
// stable string so engineers can answer "are we losing pings to the network,
// to slow servers, or to bad payloads?" without parsing free-form errors.
//
// We freeze the taxonomy here (mirroring `ERROR_CODES` in index.ts plus the
// two client-side categories that never reach the server) so any future
// drift in either layer fails a test instead of silently splitting a bucket.
//
//   * Server-side, returned in `body.code` for non-2xx responses:
//       INVALID_JSON, INVALID_PAYLOAD, MISSING_FIELDS,
//       INVALID_PDP_RENDER_STATE, DB_INSERT_FAILED, INTERNAL_ERROR
//
//   * Client-side, derived from the thrown `fetch` error:
//       NETWORK_ERROR  — unreachable host, DNS failure, connection refused
//       TIMEOUT_ERROR  — request aborted because it exceeded the deadline
// -----------------------------------------------------------------------------
const SERVER_VALIDATION_ERROR_CODES = new Set<string>([
  "INVALID_JSON",
  "INVALID_PAYLOAD",
  "MISSING_FIELDS",
  "INVALID_PDP_RENDER_STATE",
]);

const SERVER_INTERNAL_ERROR_CODES = new Set<string>([
  "DB_INSERT_FAILED",
  "INTERNAL_ERROR",
]);

const ALL_KNOWN_SERVER_CODES = new Set<string>([
  ...SERVER_VALIDATION_ERROR_CODES,
  ...SERVER_INTERNAL_ERROR_CODES,
]);

type DashboardFailureCode =
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "INVALID_JSON"
  | "INVALID_PAYLOAD"
  | "MISSING_FIELDS"
  | "INVALID_PDP_RENDER_STATE"
  | "DB_INSERT_FAILED"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Map a thrown `fetch` failure (or any caught Error) onto the dashboard's
 * failure taxonomy. Mirrors the logic the client / cron monitor uses when it
 * records an "outbound failure" so log queries can aggregate by `code` even
 * for requests that never produced an HTTP response.
 *
 * Heuristics (cheap & deterministic):
 *   * AbortError name OR /timed?\s*out|deadline/i in message → TIMEOUT_ERROR
 *   * TypeError + /fetch|network|connect|dns|refused|unreachable/i message
 *     OR ECONNREFUSED / ENOTFOUND / EAI_AGAIN system codes        → NETWORK_ERROR
 *   * Anything else                                                → UNKNOWN_ERROR
 */
function classifyFetchFailure(err: unknown): DashboardFailureCode {
  if (err === null || err === undefined) return "UNKNOWN_ERROR";
  // DOMException with name AbortError is what AbortSignal.timeout() throws.
  // It can also surface as `TimeoutError` on newer Deno builds.
  // deno-lint-ignore no-explicit-any
  const anyErr = err as any;
  const name: string = String(anyErr?.name ?? "");
  const message: string = String(anyErr?.message ?? "");
  const sysCode: string = String(anyErr?.cause?.code ?? anyErr?.code ?? "");

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /timed?\s*out|deadline|aborted/i.test(message)
  ) {
    return "TIMEOUT_ERROR";
  }

  if (
    err instanceof TypeError ||
    /fetch|network|connect|dns|refused|unreachable|name not resolved|getaddrinfo/i
      .test(message) ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH/i.test(sysCode)
  ) {
    return "NETWORK_ERROR";
  }

  return "UNKNOWN_ERROR";
}

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

// =============================================================================
// Validation-path integration tests (no service role required)
// =============================================================================
// These tests hit the deployed function over HTTP and assert the full error
// envelope — status, structured `code`, optional `fieldErrors`, optional
// `missing` array, and the `validationCounters` snapshot — so dashboards and
// client-side error branches can rely on the contract end-to-end.
// =============================================================================

/** Minimal helper: POST a *raw* string body (bypasses JSON.stringify) so we
 *  can simulate truly malformed JSON the way a misbehaving client would. */
async function callFunctionRaw(rawBody: string): Promise<Response> {
  return await fetch(FUNCTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: rawBody,
  });
}

Deno.test({
  name:
    "log-crawler-visit rejects malformed JSON bodies with HTTP 400 + INVALID_JSON",
  async fn() {
    // Each case is a body that's *not* valid JSON. The function must catch the
    // parse error before any schema validation runs and return INVALID_JSON.
    const cases: Array<{ label: string; raw: string }> = [
      { label: "trailing comma", raw: '{"pageUrl":"x","userAgent":"y",}' },
      { label: "unquoted key", raw: '{pageUrl: "x"}' },
      { label: "single quotes", raw: "{'pageUrl':'x','userAgent':'y'}" },
      { label: "truncated object", raw: '{"pageUrl":"x"' },
      { label: "bare word", raw: "not-json-at-all" },
      { label: "empty body", raw: "" },
    ];

    for (const { label, raw } of cases) {
      const res = await callFunctionRaw(raw);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for malformed JSON (${label}), got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        "INVALID_JSON",
        `expected code=INVALID_JSON for ${label}, got ${json.code}`,
      );
      assertEquals(
        json.error,
        "Invalid JSON body",
        `expected human-readable error string for ${label}`,
      );
      // The counters snapshot must be present and `invalid_json` must be > 0
      // (the function increments per request, so by the time this case runs
      // the counter is at least 1 within this cold-start invocation).
      assertExists(
        json.validationCounters,
        `validationCounters snapshot missing for ${label}`,
      );
      assertEquals(
        typeof json.validationCounters.invalid_json,
        "number",
        "invalid_json counter must be a number",
      );
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit returns INVALID_PAYLOAD with field-level errors for missing/empty pageUrl + userAgent",
  async fn() {
    // Cases the earlier "rejects payloads missing pageUrl or userAgent" test
    // only checked at the status-code level. Here we also assert the
    // structured contract (code + fieldErrors + counters) so callers can
    // surface field-specific UI errors without parsing English strings.
    const cases: Array<{
      label: string;
      body: Record<string, unknown>;
      expectFields: ("pageUrl" | "userAgent")[];
    }> = [
      {
        label: "missing pageUrl",
        body: { userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "missing userAgent",
        body: { pageUrl: `${ORIGIN}/product/x` },
        expectFields: ["userAgent"],
      },
      {
        label: "both missing (empty body)",
        body: {},
        expectFields: ["pageUrl", "userAgent"],
      },
      {
        label: "empty-string pageUrl",
        body: { pageUrl: "", userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "whitespace-only userAgent (trims to empty)",
        body: { pageUrl: `${ORIGIN}/product/x`, userAgent: "   " },
        expectFields: ["userAgent"],
      },
      {
        label: "wrong type — pageUrl is a number",
        body: { pageUrl: 42, userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "wrong type — userAgent is null",
        body: { pageUrl: `${ORIGIN}/product/x`, userAgent: null },
        expectFields: ["userAgent"],
      },
    ];

    for (const { label, body, expectFields } of cases) {
      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for ${label}, got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        "INVALID_PAYLOAD",
        `expected code=INVALID_PAYLOAD for ${label}, got ${json.code}`,
      );
      assertExists(
        json.fieldErrors,
        `fieldErrors object missing for ${label}`,
      );
      for (const field of expectFields) {
        assertExists(
          json.fieldErrors[field],
          `fieldErrors.${field} should be present for ${label}`,
        );
        // Each field error is an array of human-readable messages.
        const msgs = json.fieldErrors[field] as unknown;
        if (!Array.isArray(msgs) || msgs.length === 0) {
          throw new Error(
            `fieldErrors.${field} should be a non-empty array for ${label}, got: ${
              JSON.stringify(msgs)
            }`,
          );
        }
      }
      // Fields NOT in `expectFields` must NOT be flagged — keeps error
      // surfaces tight and prevents false positives in client UIs.
      const allFields: ("pageUrl" | "userAgent")[] = ["pageUrl", "userAgent"];
      for (const f of allFields) {
        if (!expectFields.includes(f)) {
          assertEquals(
            json.fieldErrors[f],
            undefined,
            `fieldErrors.${f} must NOT be set for ${label}`,
          );
        }
      }
      assertExists(json.validationCounters, "counters snapshot missing");
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit rejects pdp-render-trace pings missing the state tag with HTTP 400 + MISSING_FIELDS",
  async fn() {
    // The UA contains the literal `pdp-render-trace` substring (so the
    // function classifies it as a trace ping) but NO recognisable state
    // segment. The function must:
    //   - return 400
    //   - use code MISSING_FIELDS (not INVALID_PDP_RENDER_STATE — that code
    //     is reserved for a tag that's *present* but unknown)
    //   - list the missing pieces in `missing[]`
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cases: Array<{
      label: string;
      body: { pageUrl: string; userAgent: string };
      expectMissingPattern: RegExp;
    }> = [
      {
        label: "trace UA with no state segment at all",
        body: {
          pageUrl: `${ORIGIN}/product/missing-state-a-${runId}`,
          // No `/`, no `:`, just the bare keyword — regex extracts nothing.
          userAgent: `${GOOGLEBOT_UA} pdp-render-trace`,
        },
        expectMissingPattern: /state tag/i,
      },
      {
        label: "trace UA with empty bracket suffix",
        body: {
          pageUrl: `${ORIGIN}/product/missing-state-b-${runId}`,
          userAgent: `${GOOGLEBOT_UA} [pdp-render-trace]`,
        },
        expectMissingPattern: /state tag/i,
      },
      {
        label: "trace UA where the slug is also unextractable",
        body: {
          // No path segment after the host → extractSlug returns null too.
          pageUrl: `${ORIGIN}/`,
          userAgent: `${GOOGLEBOT_UA} pdp-render-trace`,
        },
        expectMissingPattern: /slug/i,
      },
    ];

    for (const { label, body, expectMissingPattern } of cases) {
      const res = await callFunction(body);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `expected 400 for ${label}, got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        "MISSING_FIELDS",
        `expected code=MISSING_FIELDS for ${label}, got ${json.code}`,
      );
      assertEquals(
        json.error,
        "Invalid pdp-render-trace payload",
        `expected human-readable error for ${label}`,
      );
      // `missing` must be a non-empty array describing what was absent.
      const missing = json.missing as unknown;
      if (!Array.isArray(missing) || missing.length === 0) {
        throw new Error(
          `missing[] should be a non-empty array for ${label}, got: ${
            JSON.stringify(missing)
          }`,
        );
      }
      assertMatch(
        missing.join(" | "),
        expectMissingPattern,
        `missing[] for ${label} should mention the right field`,
      );
      assertExists(json.validationCounters);
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit rejects pdp-render-trace pings with an INVALID state value (400 + INVALID_PDP_RENDER_STATE)",
  async fn() {
    // A trace UA with a *recognised-shape* state segment whose value is not
    // in {shell, rendered, timeout}. The function must distinguish this from
    // the "missing state" path and return INVALID_PDP_RENDER_STATE so logs
    // and dashboards can quantify "unknown new state values" separately.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cases: Array<{ label: string; bogusState: string }> = [
      { label: "obviously bogus", bogusState: "halfrendered" },
      { label: "future state (forward-compat probe)", bogusState: "hydrated" },
      { label: "near-miss typo", bogusState: "shel" },
      { label: "uppercase variant", bogusState: "SHELL" },
      // ↑ `SHELL` is interesting: the regex matches case-insensitively, the
      //   function lowercases the captured tag, so "SHELL" → "shell" which is
      //   actually VALID. We exclude it from the assertion below.
    ];

    for (const { label, bogusState } of cases) {
      const slug = `it-bogus-state-${bogusState}-${runId}`;
      // Use the slash form so the regex extracts the tag value cleanly.
      const body = {
        pageUrl: `${ORIGIN}/product/${slug}?_render=${bogusState}`,
        userAgent:
          `${GOOGLEBOT_UA} [pdp-render-trace/${bogusState} +5ms]`,
      };
      const res = await callFunction(body);
      const text = await res.text();

      // "SHELL" lowercases to "shell" and is therefore valid — function
      // returns 200. Skip the rejection assertions for that case.
      if (bogusState.toLowerCase() === "shell" ||
          bogusState.toLowerCase() === "rendered" ||
          bogusState.toLowerCase() === "timeout") {
        assertEquals(
          res.status,
          200,
          `case "${label}" lowercases to a valid state, expected 200, got ${res.status}: ${text}`,
        );
        continue;
      }

      assertEquals(
        res.status,
        400,
        `expected 400 for ${label} (state=${bogusState}), got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        "INVALID_PDP_RENDER_STATE",
        `expected code=INVALID_PDP_RENDER_STATE for ${label}, got ${json.code}`,
      );
      // The `missing[]` entry should quote the bad value back so admins can
      // see exactly what shipped without grepping logs.
      const missing = (json.missing as string[]) ?? [];
      assertMatch(
        missing.join(" | "),
        new RegExp(`valid pdp-render-trace state.*${bogusState}`, "i"),
        `missing[] should quote the offending state for ${label}`,
      );
      assertExists(json.validationCounters);
      // The trace_invalid_state counter must have ticked.
      const counter = json.validationCounters.trace_invalid_state;
      if (typeof counter !== "number" || counter < 1) {
        throw new Error(
          `trace_invalid_state counter should be >= 1 for ${label}, got: ${counter}`,
        );
      }
    }
  },
});

// =============================================================================
// Missing/empty duration-marker integrity test
// =============================================================================
// Regression guard for a class of bugs where the server (or a downstream log
// transform) might "helpfully" synthesise duration markers — most dangerously
// promoting an absent state to `pdp-render-trace:timeout` because timeout is
// the longest / most-pessimistic default. The contract is the *opposite*:
//
//   * If the inbound UA has no `pdp-render-trace` tag at all → row is persisted
//     verbatim, with NO `t_mount=`, NO `t_shell=`, and NO synthetic state tag.
//   * If the inbound UA carries a valid trace state (`shell`/`rendered`) but
//     no duration markers → row is persisted verbatim with the original state
//     tag, and STILL no `t_mount=`/`t_shell=` markers. The function must not
//     "fill in" zeros and must not escalate the state to `timeout`.
//
// We assert on the persisted DB row (not just the HTTP response) so any future
// edge-side normaliser that mutates the UA before insert will fail this test.
Deno.test({
  name:
    "log-crawler-visit preserves UA verbatim when duration markers are missing/empty (no synthetic timeout tag)",
  ignore: !haveServiceRole,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Each case produces a 200 response (the payload is *valid* — duration
    // markers are an optional cosmetic suffix, not a required field) and a
    // persisted row whose user_agent matches the inbound string.
    type Case = {
      label: string;
      slug: string;
      payload: { pageUrl: string; userAgent: string; referrer: string };
      /** Trace state we expect (or `null` for non-trace UAs). */
      expectedState: RenderState | null;
    };

    const cases: Case[] = [
      {
        label: "non-trace crawler UA (no pdp-render-trace tag at all)",
        slug: `it-no-trace-${runId}`,
        payload: {
          pageUrl: `${ORIGIN}/product/it-no-trace-${runId}`,
          // Plain Googlebot — no trace suffix. Must NOT gain a timeout tag.
          userAgent: GOOGLEBOT_UA,
          referrer: `${ORIGIN}/`,
        },
        expectedState: null,
      },
      {
        label: "shell trace UA with state but NO duration markers",
        slug: `it-shell-no-durations-${runId}`,
        payload: {
          pageUrl: `${ORIGIN}/product/it-shell-no-durations-${runId}?_render=shell`,
          // Bracketed tag with state, but no `t_mount=`/`t_shell=` suffix.
          userAgent: `${GOOGLEBOT_UA} [pdp-render-trace:shell]`,
          referrer: `${ORIGIN}/`,
        },
        expectedState: "shell",
      },
      {
        label: "rendered trace UA with EMPTY marker values (t_mount=ms)",
        slug: `it-rendered-empty-markers-${runId}`,
        payload: {
          pageUrl: `${ORIGIN}/product/it-rendered-empty-markers-${runId}?_render=rendered`,
          // Marker keys present but with no numeric value. The server must
          // NOT coerce these to "0ms" (which would create a fake "0-duration
          // render") and must NOT promote the state to timeout.
          userAgent:
            `${GOOGLEBOT_UA} [pdp-render-trace:rendered t_mount=ms t_shell=ms]`,
          referrer: `${ORIGIN}/`,
        },
        expectedState: "rendered",
      },
    ];

    const slugs = cases.map((c) => c.slug);

    try {
      // --- 1. POST each case and assert the function accepted it (200) ----
      for (const c of cases) {
        const res = await callFunction(c.payload);
        const text = await res.text(); // always consume body (Deno guidance)
        assertEquals(
          res.status,
          200,
          `[${c.label}] expected 200, got ${res.status}: ${text}`,
        );
      }

      // --- 2. Read each persisted row back and assert UA fidelity ---------
      // We can't reuse `waitForRow` here because it filters on a state tag
      // that the non-trace case explicitly lacks. Inline a slug-only poll.
      const deadline = Date.now() + 10_000;
      const rowsBySlug = new Map<string, Record<string, unknown>>();
      while (Date.now() < deadline && rowsBySlug.size < cases.length) {
        for (const c of cases) {
          if (rowsBySlug.has(c.slug)) continue;
          const { data, error } = await supabase
            .from("crawler_visits")
            .select("page_url,user_agent,bot_type,created_at")
            .ilike("page_url", `%/product/${c.slug}%`)
            .order("created_at", { ascending: false })
            .limit(1);
          if (error) throw error;
          if (data && data.length > 0) {
            rowsBySlug.set(c.slug, data[0] as Record<string, unknown>);
          }
        }
        if (rowsBySlug.size < cases.length) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }

      if (rowsBySlug.size < cases.length) {
        const missing = cases
          .filter((c) => !rowsBySlug.has(c.slug))
          .map((c) => c.slug);
        throw new Error(
          `Timed out waiting for crawler_visits rows. Missing slugs: ${
            JSON.stringify(missing)
          }`,
        );
      }

      // --- 3. Per-case persistence assertions -----------------------------
      for (const c of cases) {
        const row = rowsBySlug.get(c.slug)!;
        const persistedUa = String(row.user_agent);
        const persistedUrl = String(row.page_url);

        // (a) UA round-trips byte-for-byte. This is the keystone assertion:
        //     if anything mutates the UA mid-flight (synthetic markers,
        //     state coercion, normaliser stripping brackets, …) it dies here.
        assertEquals(
          persistedUa,
          c.payload.userAgent,
          `[${c.label}] persisted user_agent must equal the inbound UA verbatim`,
        );

        // (b) Slug round-trips inside the path so dashboards can group rows.
        assertMatch(
          persistedUrl,
          new RegExp(`/product/${c.slug}(?:[/?#]|$)`),
          `[${c.label}] page_url should contain /product/${c.slug}`,
        );

        // (c) Duration-marker absence — the central bug class this test
        //     guards. Server must NOT synthesise `t_mount=<n>ms` /
        //     `t_shell=<n>ms` markers anywhere in the persisted UA.
        assertEquals(
          /\bt_mount=\d+ms/.test(persistedUa),
          false,
          `[${c.label}] persisted UA must NOT contain a synthesised t_mount=<n>ms marker`,
        );
        assertEquals(
          /\bt_shell=\d+ms/.test(persistedUa),
          false,
          `[${c.label}] persisted UA must NOT contain a synthesised t_shell=<n>ms marker`,
        );

        // (d) State-tag fidelity — this is the *anti-promotion* assertion.
        //     A missing/empty-marker payload must NEVER be relabelled as
        //     `pdp-render-trace:timeout`. The non-trace case must carry no
        //     trace tag at all; the shell/rendered cases must carry their
        //     original state and nothing else.
        const otherStates = (
          ["shell", "rendered", "timeout"] as RenderState[]
        ).filter((s) => s !== c.expectedState);

        if (c.expectedState === null) {
          // Non-trace UA — server must not invent a trace tag.
          assertEquals(
            /pdp-render-trace[:/](shell|rendered|timeout)/i.test(persistedUa),
            false,
            `[${c.label}] non-trace UA must not gain ANY pdp-render-trace state tag`,
          );
        } else {
          // Trace UA — original state preserved, no foreign tags injected.
          assertMatch(
            persistedUa,
            new RegExp(`pdp-render-trace[:/]${c.expectedState}\\b`, "i"),
            `[${c.label}] persisted UA must keep its original ${c.expectedState} tag`,
          );
          for (const other of otherStates) {
            assertEquals(
              new RegExp(`pdp-render-trace[:/]${other}\\b`, "i").test(
                persistedUa,
              ),
              false,
              `[${c.label}] persisted UA must NOT carry a synthetic ${other} tag`,
            );
          }
        }
      }
    } finally {
      await cleanup(supabase, slugs);
    }
  },
});

// =============================================================================
// Sample-rate integration tests
// =============================================================================
// These tests mutate `site_settings.crawler_visit_sample_rate` and verify that
// the deployed `log-crawler-visit` edge function honours it for *probabilistic*
// (non-trace, non-bot, non-appeal) requests, while continuing to insert
// `pdp-render-trace`-tagged requests unconditionally (the dashboard's source
// of truth). They require:
//   * SUPABASE_SERVICE_ROLE_KEY  — to write site_settings + read crawler_visits
//   * a working live edge deploy of log-crawler-visit
//
// We bust the function's 60-second sample-rate cache by hitting the
// `?probe=sample-rate&refresh=1` admin probe immediately after each setting
// change, so each batch of N requests sees the rate we just installed.
// =============================================================================

/** A non-Googlebot, non-trace, non-appeal UA. The function will treat these
 *  requests as ordinary human pings, eligible for probabilistic sampling. */
const HUMAN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/** Build an ordinary-page payload (no /product/ slug, no trace tag). */
function buildHumanPayload(slug: string) {
  return {
    pageUrl: `${ORIGIN}/category/cat-trees/${slug}`,
    userAgent: HUMAN_UA,
    referrer: `${ORIGIN}/`,
  };
}

/** Force the deployed function to drop its in-memory sample-rate cache so
 *  the next request sees whatever value we just wrote into site_settings. */
async function forceSampleRateRefresh(): Promise<number> {
  const url = new URL(FUNCTIONS_URL);
  url.searchParams.set("probe", "sample-rate");
  url.searchParams.set("refresh", "1");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  const text = await res.text();
  if (res.status !== 200) {
    throw new Error(
      `probe=sample-rate&refresh=1 returned ${res.status}: ${text}`,
    );
  }
  const json = JSON.parse(text);
  return Number(json.effectiveSampleRate);
}

/** Write the rate into site_settings and confirm the function picked it up. */
// deno-lint-ignore no-explicit-any
async function setSampleRate(
  supabase: SupabaseClient<any, any, any>,
  rate: number,
) {
  const { error } = await supabase
    .from("site_settings")
    .upsert(
      {
        key: SAMPLE_RATE_KEY,
        value: String(rate),
        description: "Set by log-crawler-visit integration test",
      },
      { onConflict: "key" },
    );
  if (error) throw error;
  // Wait for the cache bust to take effect; tolerate float jitter.
  const effective = await forceSampleRateRefresh();
  if (Math.abs(effective - rate) > 1e-6) {
    throw new Error(
      `forceSampleRateRefresh saw effectiveSampleRate=${effective}, expected ${rate}`,
    );
  }
}

/** site_settings key used by the edge function — kept in sync with index.ts. */
const SAMPLE_RATE_KEY = "crawler_visit_sample_rate";

/** Count rows that match a slug fragment in the `page_url` column. */
// deno-lint-ignore no-explicit-any
async function countRowsForSlugPrefix(
  supabase: SupabaseClient<any, any, any>,
  prefix: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("crawler_visits")
    .select("id", { count: "exact", head: true })
    .ilike("page_url", `%${prefix}%`);
  if (error) throw error;
  return count ?? 0;
}

/** Wait until the function has finished its fire-and-forget inserts. The
 *  edge function uses `EdgeRuntime.waitUntil` for the DB write, so we poll
 *  until the row count stops growing for two consecutive checks. */
// deno-lint-ignore no-explicit-any
async function waitForInsertsToSettle(
  supabase: SupabaseClient<any, any, any>,
  prefix: string,
  expectedAtLeast: number,
  timeoutMs = 15_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    const c = await countRowsForSlugPrefix(supabase, prefix);
    if (c === last && c >= expectedAtLeast) {
      stableTicks++;
      if (stableTicks >= 2) return c;
    } else {
      stableTicks = 0;
    }
    last = c;
    await new Promise((r) => setTimeout(r, 400));
  }
  return last < 0 ? 0 : last;
}

/** Restore the original site_settings value (or delete the row if there
 *  wasn't one). Always called from a `finally` block so a mid-test failure
 *  doesn't leave the production sample rate at 0. */
// deno-lint-ignore no-explicit-any
async function restoreSampleRate(
  supabase: SupabaseClient<any, any, any>,
  original: { existed: boolean; value: string | null },
) {
  if (original.existed && original.value !== null) {
    await supabase
      .from("site_settings")
      .upsert(
        { key: SAMPLE_RATE_KEY, value: original.value },
        { onConflict: "key" },
      );
  } else {
    // Roll back to "log everything" (the function's hard default) rather than
    // deleting the row, so admins inspecting the table still see a value.
    await supabase
      .from("site_settings")
      .upsert(
        { key: SAMPLE_RATE_KEY, value: "1" },
        { onConflict: "key" },
      );
  }
  // Bust the cache so subsequent traffic uses the restored value immediately.
  await forceSampleRateRefresh().catch(() => {});
}

Deno.test({
  name:
    "log-crawler-visit: sample_rate=0 drops 100% of non-trace requests, but pdp-render-trace pings are always inserted",
  ignore: !haveServiceRole,
  // Touching site_settings + waiting for fire-and-forget inserts can take a
  // few seconds per batch; give the test plenty of headroom.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Snapshot the current rate so we can restore it at the end.
    const { data: prior } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SAMPLE_RATE_KEY)
      .maybeSingle();
    const originalRate = {
      existed: prior !== null,
      value: prior?.value ?? null,
    };

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const humanPrefix = `it-rate0-human-${runId}`;
    const traceSlug = `it-rate0-trace-${runId}`;
    const REQUESTS = 20;

    try {
      // --- Install rate=0 and confirm it propagated to the running function -
      await setSampleRate(supabase, 0);

      // --- Fire 20 ordinary human pings (must all be sampled out) ---------
      for (let i = 0; i < REQUESTS; i++) {
        const res = await callFunction(buildHumanPayload(`${humanPrefix}-${i}`));
        const text = await res.text();
        assertEquals(
          res.status,
          200,
          `human ping #${i} should return 200, got ${res.status}: ${text}`,
        );
        const json = JSON.parse(text);
        // Contract: success=true + sampled=false means "we accepted the
        // request but did not insert a row". This is what the client hooks
        // were updated to treat as a non-error.
        assertEquals(
          json.success,
          true,
          `human ping #${i}: success should be true at rate=0`,
        );
        assertEquals(
          json.sampled,
          false,
          `human ping #${i}: sampled should be false at rate=0`,
        );
        assertEquals(
          Number(json.sampleRate),
          0,
          `human ping #${i}: sampleRate echoed back must equal the installed rate`,
        );
      }

      // --- Fire one render-trace ping (must be inserted regardless) -------
      const tracePayload = buildPayload(traceSlug, "shell");
      const traceRes = await callFunction(tracePayload);
      const traceText = await traceRes.text();
      assertEquals(
        traceRes.status,
        200,
        `render-trace ping should return 200 at rate=0, got ${traceRes.status}: ${traceText}`,
      );

      // --- Wait for fire-and-forget inserts to finish, then count ---------
      // Trace ping must have produced exactly one row.
      const traceRow = await waitForRow(supabase, traceSlug, "shell");
      assertExists(traceRow, "render-trace ping must insert a crawler_visits row even at rate=0");

      // Human pings must have produced ZERO rows. We give the runtime a
      // grace window (2s) to flush any hypothetical stragglers.
      await new Promise((r) => setTimeout(r, 2_000));
      const humanCount = await countRowsForSlugPrefix(supabase, humanPrefix);
      assertEquals(
        humanCount,
        0,
        `at rate=0, expected 0 human rows persisted, got ${humanCount}`,
      );
    } finally {
      // Restore production rate FIRST so any failure can't leave the live
      // site sampled at 0. Cleanup of test rows comes second.
      await restoreSampleRate(supabase, originalRate);
      await cleanup(supabase, [traceSlug]);
      await supabase
        .from("crawler_visits")
        .delete()
        .ilike("page_url", `%${humanPrefix}%`);
    }
  },
});

// =============================================================================
// Failure-code grouping tests (network / timeout / validation / internal)
// =============================================================================
// These tests are dashboard-driven: every failure surface the admin
// "Crawler Sampling Decisions" page groups by MUST resolve to a stable,
// known string. Without that, regressions silently split a single bucket
// into two ("network" vs "Network" vs "fetch failed: …") and the totals
// stop adding up.
//
// We exercise each bucket through the real call path:
//   * NETWORK_ERROR  — fetch a definitely-unreachable host
//   * TIMEOUT_ERROR  — fire the real endpoint with AbortSignal.timeout(1)
//   * INVALID_JSON / INVALID_PAYLOAD / MISSING_FIELDS / INVALID_PDP_RENDER_STATE
//                    — single sweep that re-confirms every server-side
//                      validation response carries a code from the frozen
//                      `SERVER_VALIDATION_ERROR_CODES` set
// =============================================================================

Deno.test({
  name:
    "failure taxonomy: classifyFetchFailure() maps an unreachable host to NETWORK_ERROR",
  // Hitting an unreachable IP-literal port is effectively offline-only; works
  // in any sandbox that allows outbound TCP. We use the IETF documentation
  // address space (192.0.2.0/24) which is guaranteed not to route, plus a
  // short abort guard so the test never hangs if the network silently
  // black-holes the SYN.
  async fn() {
    const unreachable =
      "http://192.0.2.1:9/never-listens"; // TEST-NET-1, reserved by RFC 5737
    let caught: unknown = null;
    try {
      await fetch(unreachable, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: "x", userAgent: "y" }),
        // Cap at 3s so a flaky environment surfaces as a TIMEOUT_ERROR
        // (still a known bucket) rather than an open-ended hang.
        signal: AbortSignal.timeout(3_000),
      });
    } catch (err) {
      caught = err;
    }
    assertExists(
      caught,
      "fetch to 192.0.2.1:9 must throw — either NETWORK_ERROR or TIMEOUT_ERROR",
    );
    const code = classifyFetchFailure(caught);
    // Either bucket is acceptable for this address. The contract is that
    // it MUST resolve to one of the two known dashboard buckets, never
    // UNKNOWN_ERROR, so the dashboard can show a real category.
    if (code !== "NETWORK_ERROR" && code !== "TIMEOUT_ERROR") {
      throw new Error(
        `classifyFetchFailure returned ${code} for unreachable host; ` +
          `expected NETWORK_ERROR or TIMEOUT_ERROR. ` +
          `Underlying error: name=${(caught as Error)?.name}, ` +
          `message=${(caught as Error)?.message}`,
      );
    }
  },
});

Deno.test({
  name:
    "failure taxonomy: AbortSignal.timeout() against the real endpoint is classified as TIMEOUT_ERROR",
  async fn() {
    let caught: unknown = null;
    try {
      await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(buildPayload("classify-timeout", "shell")),
        // 1ms is virtually guaranteed to abort before any TLS handshake
        // completes, regardless of network conditions.
        signal: AbortSignal.timeout(1),
      });
    } catch (err) {
      caught = err;
    }
    assertExists(caught, "1ms abort must throw");
    const code = classifyFetchFailure(caught);
    assertEquals(
      code,
      "TIMEOUT_ERROR",
      `expected TIMEOUT_ERROR, got ${code}. ` +
        `Underlying: name=${(caught as Error)?.name}, ` +
        `message=${(caught as Error)?.message}`,
    );
  },
});

Deno.test({
  name:
    "failure taxonomy: classifyFetchFailure() returns UNKNOWN_ERROR for non-fetch errors (defensive default)",
  fn() {
    // The dashboard relies on UNKNOWN_ERROR being the *only* fallback so
    // any new bucket can be added later without silently re-classifying
    // other errors. Cover a handful of shapes the helper might see.
    assertEquals(classifyFetchFailure(new Error("totally unrelated")), "UNKNOWN_ERROR");
    assertEquals(classifyFetchFailure(null), "UNKNOWN_ERROR");
    assertEquals(classifyFetchFailure(undefined), "UNKNOWN_ERROR");
    assertEquals(classifyFetchFailure({ name: "WeirdError", message: "?" }), "UNKNOWN_ERROR");
    // String-only throw (legacy code path) — still UNKNOWN_ERROR, never crashes.
    assertEquals(classifyFetchFailure("oops"), "UNKNOWN_ERROR");

    // Boundary: an Error whose message *contains* timeout-y words IS
    // classified as TIMEOUT_ERROR — this is the dashboard contract for
    // server-recorded timeout strings (e.g. "request deadline exceeded").
    assertEquals(
      classifyFetchFailure(new Error("request deadline exceeded")),
      "TIMEOUT_ERROR",
    );
    // Boundary: a TypeError with a network-y message IS classified as
    // NETWORK_ERROR — matches Deno's typical `fetch` failure shape.
    assertEquals(
      classifyFetchFailure(new TypeError("error sending request: connection refused")),
      "NETWORK_ERROR",
    );
  },
});

Deno.test({
  name:
    "failure taxonomy: every server-side validation rejection returns a code in the frozen taxonomy",
  // This is the dashboard's anchor: if a future change introduces a new
  // server-side `code`, this test fails until the taxonomy is updated, so
  // the dashboard never has to deal with surprise buckets.
  async fn() {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    type Case = {
      label: string;
      expectedCode: string;
      // Either a JSON body (most cases) or a raw string body (INVALID_JSON).
      body?: Record<string, unknown>;
      raw?: string;
    };
    const cases: Case[] = [
      {
        label: "INVALID_JSON: malformed body",
        expectedCode: "INVALID_JSON",
        raw: "{not-json",
      },
      {
        label: "INVALID_PAYLOAD: missing required fields",
        expectedCode: "INVALID_PAYLOAD",
        body: {},
      },
      {
        label: "INVALID_PAYLOAD: oversized pageUrl",
        expectedCode: "INVALID_PAYLOAD",
        body: {
          pageUrl: `${ORIGIN}/x?` + "a".repeat(4_000),
          userAgent: GOOGLEBOT_UA,
        },
      },
      {
        label: "MISSING_FIELDS: trace UA without state segment",
        expectedCode: "MISSING_FIELDS",
        body: {
          pageUrl: `${ORIGIN}/product/codes-missing-${runId}`,
          userAgent: `${GOOGLEBOT_UA} pdp-render-trace`,
        },
      },
      {
        label: "INVALID_PDP_RENDER_STATE: trace UA with bogus state",
        expectedCode: "INVALID_PDP_RENDER_STATE",
        body: {
          pageUrl: `${ORIGIN}/product/codes-bogus-${runId}?_render=halfrendered`,
          userAgent: `${GOOGLEBOT_UA} [pdp-render-trace/halfrendered +1ms]`,
        },
      },
    ];

    const observed: string[] = [];
    for (const c of cases) {
      const res = c.raw !== undefined
        ? await callFunctionRaw(c.raw)
        : await callFunction(c.body!);
      const text = await res.text();
      assertEquals(
        res.status,
        400,
        `${c.label}: expected 400, got ${res.status}: ${text}`,
      );
      const json = JSON.parse(text);
      assertEquals(
        json.code,
        c.expectedCode,
        `${c.label}: expected code=${c.expectedCode}, got ${json.code}`,
      );
      // The frozen-taxonomy assertion: this is what protects the dashboard
      // from surprise codes shipping in a future migration.
      if (!ALL_KNOWN_SERVER_CODES.has(String(json.code))) {
        throw new Error(
          `${c.label}: server returned code "${json.code}" which is not in the ` +
            `frozen failure taxonomy. Update SERVER_VALIDATION_ERROR_CODES (or ` +
            `SERVER_INTERNAL_ERROR_CODES) and the dashboard before merging.`,
        );
      }
      observed.push(String(json.code));
    }

    // Sanity: every validation code we documented was actually exercised at
    // least once. Catches the "code dropped from server but still listed in
    // the test taxonomy" drift.
    for (const code of SERVER_VALIDATION_ERROR_CODES) {
      if (!observed.includes(code)) {
        throw new Error(
          `validation code "${code}" is in SERVER_VALIDATION_ERROR_CODES but ` +
            `not exercised by any test case. Add a case or remove the code.`,
        );
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Idempotency-key dedupe
// ---------------------------------------------------------------------------
// When a client supplies the same `idempotencyKey` for repeated calls (e.g.
// the edge function gets retried, or a render-trace ping fires twice for the
// same page-view), the server must collapse them to a single
// `crawler_visits` row instead of inserting duplicates. We verify both:
//   1. The first call inserts and returns `deduped: false`.
//   2. Every subsequent call with the same key returns `deduped: true` and
//      the DB still has exactly one matching row.
Deno.test({
  name:
    "log-crawler-visit: repeated calls with the same idempotencyKey are deduplicated to a single row",
  ignore: !haveServiceRole,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const slug = `idem-${crypto.randomUUID().slice(0, 8)}`;
    const idempotencyKey = `pdp:${crypto.randomUUID()}:${slug}:rendered`;
    const payload = { ...buildPayload(slug, "rendered"), idempotencyKey };

    try {
      // --- First call: should insert ---------------------------------------
      const first = await callFunction(payload);
      const firstJson = await first.json();
      assertEquals(first.status, 200, `first call status: ${first.status}`);
      assertEquals(firstJson.success, true, "first call should succeed");
      assertEquals(
        firstJson.deduped,
        false,
        "first call must not be flagged as deduped",
      );
      assertEquals(
        firstJson.idempotencyKey,
        idempotencyKey,
        "server should echo back the supplied idempotency key",
      );

      // Wait for the row to land before issuing retries.
      await waitForRow(supabase, slug, "rendered");

      // --- Retries: same key → server reports deduped, DB count stays at 1 -
      const RETRIES = 4;
      for (let i = 0; i < RETRIES; i++) {
        const res = await callFunction(payload);
        const json = await res.json();
        assertEquals(
          res.status,
          200,
          `retry #${i + 1} should return 200, got ${res.status}`,
        );
        assertEquals(
          json.success,
          true,
          `retry #${i + 1} should succeed`,
        );
        assertEquals(
          json.deduped,
          true,
          `retry #${i + 1} must be flagged as deduped`,
        );
      }

      // --- DB check: exactly one row for this idempotency key --------------
      const { data: rows, error } = await supabase
        .from("crawler_visits")
        .select("id, idempotency_key, page_url, user_agent")
        .eq("idempotency_key", idempotencyKey);
      if (error) throw error;
      assertEquals(
        (rows ?? []).length,
        1,
        `expected exactly 1 row for idempotency_key=${idempotencyKey} after ${
          RETRIES + 1
        } calls, got ${(rows ?? []).length}`,
      );
      assertMatch(
        String((rows ?? [])[0].user_agent),
        /pdp-render-trace:rendered/,
      );

      // --- Different key, same payload → must insert a SECOND row ----------
      const otherKey = `pdp:${crypto.randomUUID()}:${slug}:rendered`;
      const otherPayload = { ...payload, idempotencyKey: otherKey };
      const otherRes = await callFunction(otherPayload);
      const otherJson = await otherRes.json();
      assertEquals(otherRes.status, 200);
      assertEquals(
        otherJson.deduped,
        false,
        "a fresh idempotency key must NOT be deduped against a previous key",
      );

      const { data: allRows, error: allErr } = await supabase
        .from("crawler_visits")
        .select("id, idempotency_key")
        .ilike("page_url", `%/product/${slug}%`);
      if (allErr) throw allErr;
      assertEquals(
        (allRows ?? []).length,
        2,
        `expected exactly 2 rows for slug=${slug} (one per distinct key), got ${
          (allRows ?? []).length
        }`,
      );
    } finally {
      await cleanup(supabase, [slug]);
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit: sample_rate=0.5 drops non-trace requests probabilistically (~50%), trace pings still always inserted",
  ignore: !haveServiceRole,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: prior } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", SAMPLE_RATE_KEY)
      .maybeSingle();
    const originalRate = {
      existed: prior !== null,
      value: prior?.value ?? null,
    };

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const humanPrefix = `it-rate50-human-${runId}`;
    const traceSlug = `it-rate50-trace-${runId}`;
    // 60 requests gives a wide tolerance band (10–50 inserts) that's
    // statistically robust enough to not flake while still catching gross
    // regressions like "rate is being ignored" (would yield 60) or "rate
    // collapsed to 0" (would yield 0).
    const REQUESTS = 60;
    const MIN_INSERTED = 10;
    const MAX_INSERTED = 50;

    try {
      await setSampleRate(supabase, 0.5);

      // --- Fire human pings, count how many the SERVER says it kept ------
      // The function returns `sampled: true|false` per request, so we don't
      // have to round-trip through the DB to know the intended outcome.
      // We use that as the *primary* signal and cross-check against actual
      // row count to catch insert-path regressions.
      let serverKept = 0;
      let serverDropped = 0;
      for (let i = 0; i < REQUESTS; i++) {
        const res = await callFunction(buildHumanPayload(`${humanPrefix}-${i}`));
        const text = await res.text();
        assertEquals(
          res.status,
          200,
          `human ping #${i} should return 200, got ${res.status}: ${text}`,
        );
        const json = JSON.parse(text);
        assertEquals(json.success, true);
        if (json.sampled === true) serverKept++;
        else if (json.sampled === false) serverDropped++;
        else throw new Error(`human ping #${i}: server returned sampled=${json.sampled}`);
        // Echoed sampleRate must reflect the installed rate.
        assertEquals(Number(json.sampleRate), 0.5);
      }

      // Sanity: every response was classified one way or the other.
      assertEquals(
        serverKept + serverDropped,
        REQUESTS,
        "every human ping must be classified as sampled-in or sampled-out",
      );
      // Strong contract: at rate=0.5 across 60 requests, observing 0 kept
      // or 60 kept means the rate is not being applied at all.
      if (serverKept < MIN_INSERTED || serverKept > MAX_INSERTED) {
        throw new Error(
          `at rate=0.5, expected ${MIN_INSERTED}–${MAX_INSERTED} kept across ${REQUESTS} requests, got ${serverKept} kept / ${serverDropped} dropped. ` +
            `This suggests sampling is not being applied as configured.`,
        );
      }

      // --- Fire one render-trace ping (must always be inserted) ----------
      const tracePayload = buildPayload(traceSlug, "rendered");
      const traceRes = await callFunction(tracePayload);
      const traceText = await traceRes.text();
      assertEquals(
        traceRes.status,
        200,
        `render-trace ping should return 200 at rate=0.5, got ${traceRes.status}: ${traceText}`,
      );

      // --- Cross-check the DB matches the server's view ------------------
      const traceRow = await waitForRow(supabase, traceSlug, "rendered");
      assertExists(
        traceRow,
        "render-trace ping must insert a crawler_visits row regardless of sample rate",
      );

      const dbHumanCount = await waitForInsertsToSettle(
        supabase,
        humanPrefix,
        serverKept,
      );
      // The DB count should track the server's "kept" count exactly. Allow
      // ±1 jitter to absorb the rare case where a fire-and-forget insert
      // hadn't flushed yet despite the settle wait.
      const drift = Math.abs(dbHumanCount - serverKept);
      if (drift > 1) {
        throw new Error(
          `DB row count (${dbHumanCount}) drifted from server-reported kept count (${serverKept}) by ${drift}. ` +
            `This suggests inserts are failing silently.`,
        );
      }
    } finally {
      await restoreSampleRate(supabase, originalRate);
      await cleanup(supabase, [traceSlug]);
      await supabase
        .from("crawler_visits")
        .delete()
        .ilike("page_url", `%${humanPrefix}%`);
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit rejects empty/whitespace-only pageUrl and userAgent with HTTP 400 + INVALID_PAYLOAD and field-specific zod messages",
  async fn() {
    // Focused, exhaustive coverage of the "trims to empty" boundary for
    // BOTH validated string fields. The schema in index.ts uses
    //   z.string().trim().min(1, '<field> must be a non-empty string')
    // so any of these payloads must:
    //   1. fail with HTTP 400
    //   2. carry code === "INVALID_PAYLOAD"
    //   3. include the exact field-specific zod message in
    //      fieldErrors[<offending field>] — not a generic one
    //   4. NOT mention the other field in fieldErrors (so a UI can
    //      surface the right inline error without false positives)
    //   5. NOT have created any DB row (no slug to clean up)
    //
    // Variants exercised per field: zero-length, ASCII spaces, tab,
    // newline, carriage return, and a mixed whitespace blob.
    const WHITESPACE_VARIANTS: Array<{ label: string; value: string }> = [
      { label: "empty string", value: "" },
      { label: "ASCII spaces", value: "   " },
      { label: "tab characters", value: "\t\t" },
      { label: "newline characters", value: "\n\n" },
      { label: "carriage return", value: "\r\r" },
      { label: "mixed whitespace", value: " \t\n\r " },
    ];

    type Case = {
      label: string;
      body: Record<string, unknown>;
      offending: "pageUrl" | "userAgent";
      otherField: "pageUrl" | "userAgent";
      expectedMessage: string;
    };

    const cases: Case[] = [];
    for (const v of WHITESPACE_VARIANTS) {
      cases.push({
        label: `pageUrl ${v.label}`,
        body: { pageUrl: v.value, userAgent: GOOGLEBOT_UA },
        offending: "pageUrl",
        otherField: "userAgent",
        expectedMessage: "pageUrl must be a non-empty string",
      });
      cases.push({
        label: `userAgent ${v.label}`,
        body: { pageUrl: `${ORIGIN}/product/whitespace-guard`, userAgent: v.value },
        offending: "userAgent",
        otherField: "pageUrl",
        expectedMessage: "userAgent must be a non-empty string",
      });
    }

    for (const c of cases) {
      const res = await callFunction(c.body);
      const text = await res.text();

      assertEquals(
        res.status,
        400,
        `[${c.label}] expected HTTP 400, got ${res.status}: ${text}`,
      );

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error(
          `[${c.label}] response body was not valid JSON: ${text} (${
            (err as Error).message
          })`,
        );
      }

      // Field-specific error code — not the generic "MISSING_FIELDS"
      // (which is reserved for pdp-render-trace pings) and not the
      // "INVALID_JSON" code (the body parsed fine).
      assertEquals(
        json.code,
        "INVALID_PAYLOAD",
        `[${c.label}] expected code=INVALID_PAYLOAD, got ${
          JSON.stringify(json.code)
        }`,
      );

      assertExists(
        json.fieldErrors,
        `[${c.label}] response missing fieldErrors envelope`,
      );
      const fieldErrors = json.fieldErrors as Record<string, unknown>;

      // Offending field is present, is a non-empty string[], and the
      // exact zod message we configured shows up — guarding against
      // accidental message edits that would silently re-bucket failures.
      const offendingMsgs = fieldErrors[c.offending];
      if (!Array.isArray(offendingMsgs) || offendingMsgs.length === 0) {
        throw new Error(
          `[${c.label}] fieldErrors.${c.offending} must be a non-empty array, got: ${
            JSON.stringify(offendingMsgs)
          }`,
        );
      }
      const offendingJoined = (offendingMsgs as string[]).join(" | ");
      if (!offendingJoined.includes(c.expectedMessage)) {
        throw new Error(
          `[${c.label}] fieldErrors.${c.offending} must contain "${c.expectedMessage}", got: ${offendingJoined}`,
        );
      }

      // The OTHER field is clean — no spurious fieldErrors entry. This
      // matters because the UI uses key presence to decide which input
      // to highlight; bleeding errors across fields would surface a
      // wrong red border for the user.
      assertEquals(
        fieldErrors[c.otherField],
        undefined,
        `[${c.label}] fieldErrors.${c.otherField} must NOT be set, got: ${
          JSON.stringify(fieldErrors[c.otherField])
        }`,
      );

      // The validation-counter snapshot must be present and must reflect
      // a bump on the field-specific bucket (schema_page_url /
      // schema_user_agent), not the catch-all schema_other.
      assertExists(
        json.validationCounters,
        `[${c.label}] validationCounters snapshot missing`,
      );
      const counters = json.validationCounters as Record<string, number>;
      const expectedBucket = c.offending === "pageUrl"
        ? "schema_page_url"
        : "schema_user_agent";
      const bucketCount = counters[expectedBucket];
      if (typeof bucketCount !== "number" || bucketCount < 1) {
        throw new Error(
          `[${c.label}] expected counter ${expectedBucket} >= 1, got ${
            JSON.stringify(bucketCount)
          }`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "log-crawler-visit 400 INVALID_PAYLOAD envelope is structurally consistent across all length + schema failures (code, fieldErrors, validationCounters)",
  async fn() {
    // Cross-cutting envelope contract: every 400 caused by Zod must return
    // the SAME response shape so dashboards, retries, and admin tooling can
    // parse one structure without per-case branches:
    //
    //   {
    //     error: string,                       // human-readable, non-empty
    //     code: "INVALID_PAYLOAD",             // stable enum value
    //     fieldErrors: { [field]: string[] },  // 1+ keys, each a non-empty
    //                                          // string[] of zod messages
    //     validationCounters: {                // ALL 8 buckets present,
    //       invalid_json: number,              // every value an integer >= 0
    //       schema_page_url: number,
    //       schema_user_agent: number,
    //       schema_referrer: number,
    //       schema_other: number,
    //       trace_missing_slug: number,
    //       trace_missing_state: number,
    //       trace_invalid_state: number,
    //     }
    //   }
    //
    // Failure cases below cover every Zod entry point in the schema:
    //   pageUrl: missing, wrong-type, empty, whitespace, over-length
    //   userAgent: missing, wrong-type, empty, whitespace, over-length
    //   referrer: over-length
    //   idempotencyKey: regex violation, over-length
    //   multi-field: pageUrl+userAgent both over-length
    // Each case asserts the envelope, not just the offending field — so a
    // future regression that drops one of the four envelope keys (or returns
    // partial counters) fails uniformly across the whole matrix.

    const REQUIRED_COUNTER_KEYS = [
      "invalid_json",
      "schema_page_url",
      "schema_user_agent",
      "schema_referrer",
      "schema_other",
      "trace_missing_slug",
      "trace_missing_state",
      "trace_invalid_state",
    ] as const;

    const MAX_LEN = 2048;
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const buildPageUrlOfLength = (n: number) => {
      const prefix = `${ORIGIN}/product/env-${runId}-`;
      const padLen = Math.max(0, n - prefix.length);
      return prefix + "a".repeat(padLen);
    };
    const buildUserAgentOfLength = (n: number) => {
      const prefix = `${GOOGLEBOT_UA} [pad=`;
      const suffix = `]`;
      const padLen = Math.max(0, n - prefix.length - suffix.length);
      return prefix + "x".repeat(padLen) + suffix;
    };

    type Case = {
      label: string;
      body: Record<string, unknown>;
      // The fields we expect to surface in fieldErrors. Order-insensitive.
      expectFields: Array<"pageUrl" | "userAgent" | "referrer" | "idempotencyKey">;
    };

    const cases: Case[] = [
      // --- length boundary: single-field over-length -----------------------
      {
        label: "pageUrl over MAX_LEN",
        body: {
          pageUrl: buildPageUrlOfLength(MAX_LEN + 1),
          userAgent: GOOGLEBOT_UA,
        },
        expectFields: ["pageUrl"],
      },
      {
        label: "userAgent over MAX_LEN",
        body: {
          pageUrl: `${ORIGIN}/product/ok-${runId}`,
          userAgent: buildUserAgentOfLength(MAX_LEN + 1),
        },
        expectFields: ["userAgent"],
      },
      // --- length boundary: multi-field over-length ------------------------
      {
        label: "pageUrl + userAgent both over MAX_LEN",
        body: {
          pageUrl: buildPageUrlOfLength(MAX_LEN + 50),
          userAgent: buildUserAgentOfLength(MAX_LEN + 50),
        },
        expectFields: ["pageUrl", "userAgent"],
      },
      {
        label: "referrer over MAX_LEN",
        body: {
          pageUrl: `${ORIGIN}/product/ok-${runId}`,
          userAgent: GOOGLEBOT_UA,
          referrer: "https://example.com/" + "a".repeat(MAX_LEN + 1),
        },
        expectFields: ["referrer"],
      },
      // --- missing required fields ----------------------------------------
      {
        label: "missing pageUrl",
        body: { userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "missing userAgent",
        body: { pageUrl: `${ORIGIN}/product/ok-${runId}` },
        expectFields: ["userAgent"],
      },
      {
        label: "empty body — both required fields missing",
        body: {},
        expectFields: ["pageUrl", "userAgent"],
      },
      // --- type violations -------------------------------------------------
      {
        label: "pageUrl wrong type (number)",
        body: { pageUrl: 42, userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "userAgent wrong type (null)",
        body: { pageUrl: `${ORIGIN}/product/ok-${runId}`, userAgent: null },
        expectFields: ["userAgent"],
      },
      // --- empty / whitespace (post-trim) ---------------------------------
      {
        label: "pageUrl empty string",
        body: { pageUrl: "", userAgent: GOOGLEBOT_UA },
        expectFields: ["pageUrl"],
      },
      {
        label: "userAgent whitespace-only",
        body: { pageUrl: `${ORIGIN}/product/ok-${runId}`, userAgent: "   \t\n" },
        expectFields: ["userAgent"],
      },
      // --- idempotencyKey: regex + length ---------------------------------
      {
        label: "idempotencyKey contains unsupported chars",
        body: {
          pageUrl: `${ORIGIN}/product/ok-${runId}`,
          userAgent: GOOGLEBOT_UA,
          idempotencyKey: "bad key with spaces!",
        },
        expectFields: ["idempotencyKey"],
      },
      {
        label: "idempotencyKey over 200 chars",
        body: {
          pageUrl: `${ORIGIN}/product/ok-${runId}`,
          userAgent: GOOGLEBOT_UA,
          idempotencyKey: "a".repeat(201),
        },
        expectFields: ["idempotencyKey"],
      },
    ];

    for (const c of cases) {
      const res = await callFunction(c.body);
      const text = await res.text();

      // Every case must be a 400 — never 200, never 5xx.
      assertEquals(
        res.status,
        400,
        `[${c.label}] expected HTTP 400, got ${res.status}: ${text}`,
      );

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error(
          `[${c.label}] response body was not valid JSON: ${text} (${
            (err as Error).message
          })`,
        );
      }

      // ---- envelope key 1: error -----------------------------------------
      if (typeof json.error !== "string" || json.error.length === 0) {
        throw new Error(
          `[${c.label}] response.error must be a non-empty string, got: ${
            JSON.stringify(json.error)
          }`,
        );
      }

      // ---- envelope key 2: code (stable enum) ----------------------------
      assertEquals(
        json.code,
        "INVALID_PAYLOAD",
        `[${c.label}] expected code=INVALID_PAYLOAD, got ${
          JSON.stringify(json.code)
        }`,
      );

      // ---- envelope key 3: fieldErrors -----------------------------------
      // Must be a plain object, with at least one key, and every value is
      // a non-empty string[] (zod's flatten().fieldErrors shape).
      assertExists(
        json.fieldErrors,
        `[${c.label}] envelope missing fieldErrors`,
      );
      const fieldErrors = json.fieldErrors as Record<string, unknown>;
      if (
        typeof fieldErrors !== "object" ||
        fieldErrors === null ||
        Array.isArray(fieldErrors)
      ) {
        throw new Error(
          `[${c.label}] fieldErrors must be a plain object, got: ${
            JSON.stringify(fieldErrors)
          }`,
        );
      }
      const fieldKeys = Object.keys(fieldErrors);
      if (fieldKeys.length === 0) {
        throw new Error(
          `[${c.label}] fieldErrors must contain at least one entry, got: ${
            JSON.stringify(fieldErrors)
          }`,
        );
      }
      for (const k of fieldKeys) {
        const v = fieldErrors[k];
        if (
          !Array.isArray(v) ||
          v.length === 0 ||
          !v.every((m) => typeof m === "string" && m.length > 0)
        ) {
          throw new Error(
            `[${c.label}] fieldErrors.${k} must be a non-empty string[], got: ${
              JSON.stringify(v)
            }`,
          );
        }
      }

      // Every field we expect must be present; nothing else may be flagged.
      // (Symmetry guard — prevents accidental fan-out of field errors.)
      for (const f of c.expectFields) {
        assertExists(
          fieldErrors[f],
          `[${c.label}] fieldErrors.${f} must be present`,
        );
      }
      const unexpected = fieldKeys.filter(
        (k) => !c.expectFields.includes(k as typeof c.expectFields[number]),
      );
      assertEquals(
        unexpected,
        [],
        `[${c.label}] unexpected fieldErrors keys: ${JSON.stringify(unexpected)}`,
      );

      // ---- envelope key 4: validationCounters (full taxonomy) ------------
      assertExists(
        json.validationCounters,
        `[${c.label}] envelope missing validationCounters`,
      );
      const counters = json.validationCounters as Record<string, unknown>;
      if (
        typeof counters !== "object" ||
        counters === null ||
        Array.isArray(counters)
      ) {
        throw new Error(
          `[${c.label}] validationCounters must be a plain object, got: ${
            JSON.stringify(counters)
          }`,
        );
      }
      // ALL 8 taxonomy buckets must always be present so log aggregations
      // never have to handle "missing key vs zero" — and no extra keys may
      // sneak in (catches typos / silent taxonomy drift).
      const counterKeys = Object.keys(counters).sort();
      const expectedKeys = [...REQUIRED_COUNTER_KEYS].sort();
      assertEquals(
        counterKeys,
        expectedKeys,
        `[${c.label}] validationCounters key set mismatch — got ${
          JSON.stringify(counterKeys)
        }, expected ${JSON.stringify(expectedKeys)}`,
      );
      for (const k of REQUIRED_COUNTER_KEYS) {
        const v = counters[k];
        if (
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          !Number.isInteger(v) ||
          v < 0
        ) {
          throw new Error(
            `[${c.label}] validationCounters.${k} must be a non-negative integer, got: ${
              JSON.stringify(v)
            }`,
          );
        }
      }

      // No stray top-level keys leak into the envelope (e.g. raw zod
      // dump, internal stack traces). Future additions must be added here
      // intentionally so we don't quietly start exposing new fields.
      const ALLOWED_TOP_LEVEL = new Set([
        "error",
        "code",
        "fieldErrors",
        "validationCounters",
      ]);
      const stray = Object.keys(json).filter((k) => !ALLOWED_TOP_LEVEL.has(k));
      assertEquals(
        stray,
        [],
        `[${c.label}] envelope leaked unexpected top-level keys: ${
          JSON.stringify(stray)
        }`,
      );
    }
  },
});