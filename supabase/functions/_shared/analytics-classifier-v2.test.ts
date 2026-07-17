// Deno tests for the Phase-1 analytics classifier v2.
// Runs against the deployed DB using PostgREST RPC.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(args),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${body}`);
  return JSON.parse(body);
}

// ── normalize_country ────────────────────────────────────────
Deno.test("normalize_country: NULL → Unknown", async () => {
  assertEquals(await rpc("normalize_country", { p: null }), "Unknown");
});
Deno.test("normalize_country: empty → Unknown", async () => {
  assertEquals(await rpc("normalize_country", { p: "" }), "Unknown");
});
Deno.test("normalize_country: US → United States", async () => {
  assertEquals(await rpc("normalize_country", { p: "US" }), "United States");
});
Deno.test("normalize_country: Netherlands passes through", async () => {
  assertEquals(await rpc("normalize_country", { p: "Netherlands" }), "Netherlands");
});
Deno.test("normalize_country: France passes through", async () => {
  assertEquals(await rpc("normalize_country", { p: "France" }), "France");
});

// ── classify_channel_v2 ──────────────────────────────────────
type V2 = {
  traffic_class: string; channel: string; is_internal: boolean;
  exclude_from_commercial: boolean; reason: string; bot_name?: string;
};
async function classify(overrides: Partial<Record<string, unknown>> = {}): Promise<V2> {
  return await rpc("classify_channel_v2", {
    p_referrer: null, p_utm_source: null, p_utm_medium: null,
    p_user_agent: null, p_landing_path: null, p_query_string: null,
    p_click_ids: {}, p_has_js_evidence: null, p_has_interaction: null,
    ...overrides,
  });
}

Deno.test("lovable.dev referrer → INTERNAL_PREVIEW", async () => {
  const r = await classify({ p_referrer: "https://lovable.dev/preview/abc" });
  assertEquals(r.traffic_class, "INTERNAL_PREVIEW");
  assertEquals(r.exclude_from_commercial, true);
});
Deno.test("__lovable_sha query → INTERNAL_PREVIEW", async () => {
  const r = await classify({ p_query_string: "?__lovable_sha=abc123" });
  assertEquals(r.traffic_class, "INTERNAL_PREVIEW");
});
Deno.test("forceHideBadge=true → INTERNAL_PREVIEW", async () => {
  const r = await classify({ p_query_string: "?forceHideBadge=true" });
  assertEquals(r.traffic_class, "INTERNAL_PREVIEW");
});
Deno.test("Bingbot UA → BOT_CONFIRMED", async () => {
  const r = await classify({ p_user_agent: "Mozilla/5.0 (compatible; bingbot/2.0)" });
  assertEquals(r.traffic_class, "BOT_CONFIRMED");
  assertEquals(r.bot_name, "Bingbot");
});
Deno.test("Googlebot UA → BOT_CONFIRMED", async () => {
  const r = await classify({ p_user_agent: "Mozilla/5.0 (compatible; Googlebot/2.1)" });
  assertEquals(r.bot_name, "Googlebot");
});
Deno.test("Pinterestbot verifier → VERIFIER", async () => {
  const r = await classify({ p_user_agent: "Pinterest/0.2 (+https://www.pinterest.com/bot.html)" });
  assertEquals(r.traffic_class, "VERIFIER");
  assertEquals(r.bot_name, "Pinterestbot");
});
Deno.test("UptimeRobot → UPTIME_MONITOR", async () => {
  const r = await classify({ p_user_agent: "Mozilla/5.0 (compatible; UptimeRobot/2.0)" });
  assertEquals(r.traffic_class, "UPTIME_MONITOR");
});
Deno.test("HeadlessChrome → PRERENDER", async () => {
  const r = await classify({ p_user_agent: "HeadlessChrome/119.0.0.0" });
  assertEquals(r.traffic_class, "PRERENDER");
});
Deno.test("pinterest.com human browser → HUMAN_PROBABLE pinterest_organic", async () => {
  const r = await classify({
    p_referrer: "https://www.pinterest.com/pin/12345/",
    p_user_agent: "Mozilla/5.0 (Macintosh) Chrome/126",
  });
  assertEquals(r.traffic_class, "HUMAN_PROBABLE");
  assertEquals(r.channel, "pinterest_organic");
});
Deno.test("empty everything + no evidence → UNKNOWN (not direct)", async () => {
  const r = await classify({});
  assertEquals(r.traffic_class, "UNKNOWN");
  assertEquals(r.exclude_from_commercial, true);
});
Deno.test("empty everything + js + interaction → HUMAN_CONFIRMED direct", async () => {
  const r = await classify({
    p_user_agent: "Mozilla/5.0 (iPhone) Safari/17",
    p_has_js_evidence: true,
    p_has_interaction: true,
  });
  assertEquals(r.traffic_class, "HUMAN_CONFIRMED");
  assertEquals(r.channel, "direct");
});
Deno.test("gclid → HUMAN_PROBABLE google_ads", async () => {
  const r = await classify({ p_click_ids: { gclid: "abc" } });
  assertEquals(r.channel, "google_ads");
});
Deno.test("pinterest_click_id → HUMAN_PROBABLE pinterest_ads", async () => {
  const r = await classify({ p_click_ids: { pinterest_click_id: "abc" } });
  assertEquals(r.channel, "pinterest_ads");
});
Deno.test("automation UA → INTERNAL_AUTOMATION", async () => {
  const r = await classify({ p_user_agent: "GetPawsy-Automation/1.0 pinterest-verify" });
  assertEquals(r.traffic_class, "INTERNAL_AUTOMATION");
});
Deno.test("no signal but automation-like path proves nothing → UNKNOWN", async () => {
  const r = await classify({ p_landing_path: "/products/some-item" });
  assertEquals(r.traffic_class, "UNKNOWN");
});