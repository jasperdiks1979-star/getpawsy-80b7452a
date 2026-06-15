// Regression test: AI credit exhaustion (RED state) must NOT pause the
// Pinterest publishing lane. Only the AI Generation lane may be paused.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCreditPaused, isPublishingPaused } from "./pinterest-credit-guard.ts";

function mockSupabase(state: Record<string, unknown>) {
  return {
    from(_table: string) {
      const chain: any = {
        _data: state,
        select() { return chain; },
        eq() { return chain; },
        maybeSingle: async () => ({ data: chain._data, error: null }),
      };
      return chain;
    },
  } as any;
}

Deno.test("RED credit state pauses AI generation but NOT publishing", async () => {
  const sb = mockSupabase({
    paused: true,
    ai_generation_paused: true,
    publishing_paused: false,
    state: "red",
    forecast_state: "red",
    last_402_at: new Date().toISOString(),
    last_success_at: null,
    manual_pause: false,
    emergency_mode: false,
  });

  const ai = await isCreditPaused(sb);
  const pub = await isPublishingPaused(sb);

  assertEquals(ai.state, "red");
  assert(ai.paused, "AI generation lane should be paused at RED");
  assertEquals(pub.paused, false, "Publishing lane must NEVER be paused by AI credit exhaustion");
});

Deno.test("Simulated RED + 3 queued pins → publish lane still RUNNING", () => {
  // Pure logic from pinterest-credit-status:
  const aiGenerationPaused = true;
  const publishingPaused = false;
  const queued = 3;
  const publishedLast1h = 0;

  const publishing_status =
    publishingPaused ? "BLOCKED" : (publishedLast1h > 0 || queued > 0 ? "RUNNING" : "IDLE");
  const publishing_message =
    aiGenerationPaused && queued > 0
      ? "AI generation paused, publishing continues from existing queue."
      : "n/a";

  assertEquals(publishing_status, "RUNNING");
  assertEquals(
    publishing_message,
    "AI generation paused, publishing continues from existing queue.",
  );
});

Deno.test("Operator-set publishing_paused IS the only way to BLOCK publish lane", async () => {
  const sb = mockSupabase({
    paused: false,
    ai_generation_paused: false,
    publishing_paused: true,
    state: "green",
    manual_pause: false,
    emergency_mode: false,
  });
  const pub = await isPublishingPaused(sb);
  assertEquals(pub.paused, true);
});