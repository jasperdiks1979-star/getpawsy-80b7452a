// Regression: run 8c3e65d3-... blocked at 0.48 + 0.02 due to float drift
// (`0.5000000000001 > 0.5`). Integer microcredit arithmetic must allow it.

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertBudget, BudgetExceededError, type RunConfig } from "./pinterest-cost-guard.ts";

function makeCfg(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    run_id: "test-run", wave_slug: null, requested_pin_count: 45,
    product_category: null, hero_priority_slugs: [],
    max_credit_spend: 0.5, max_image_calls: 0, max_qa_calls: 45,
    allow_pro_image: false, force_rescore: false,
    manual_resume_required: false, manual_resume: true,
    status: "active", paused_reason: null,
    max_credit_spend_per_pin: 1, max_paid_image_calls_per_pin: 1,
    max_paid_qa_calls_per_image_hash: 1, max_total_paid_calls: 100,
    ...overrides,
  };
}

// Mock supabase client returning a synthetic ledger of 24 rows * 0.02 credits
// (= 0.48 float which internally accumulates to 0.4800000000000003).
function mockSb(rows: Array<{ credits: number; operation: string; cached_hit: boolean; queue_id?: string; image_hash?: string }>) {
  const q = {
    select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (r: any) => Promise.resolve({ data: rows, error: null }).then(r),
  };
  return { from: () => q } as any;
}

Deno.test("regression: 0.48 float ledger + 0.02 next call is ALLOWED at 0.5 cap", async () => {
  const rows = Array.from({ length: 24 }, () => ({ credits: 0.02, operation: "qa", cached_hit: false }));
  const { projected } = await assertBudget(mockSb(rows), makeCfg(), 0.02, "qa");
  assertEquals(projected, 0.5);
});

Deno.test("0.50 spent + 0.01 next is BLOCKED", async () => {
  const rows = Array.from({ length: 25 }, () => ({ credits: 0.02, operation: "qa", cached_hit: false }));
  await assertRejects(
    () => assertBudget(mockSb(rows), makeCfg(), 0.01, "qa"),
    BudgetExceededError,
  );
});

Deno.test("cache hits do not consume budget", async () => {
  const rows = Array.from({ length: 100 }, () => ({ credits: 0.02, operation: "qa", cached_hit: true }));
  const { projected } = await assertBudget(mockSb(rows), makeCfg(), 0.02, "qa");
  assertEquals(projected, 0.02);
});
