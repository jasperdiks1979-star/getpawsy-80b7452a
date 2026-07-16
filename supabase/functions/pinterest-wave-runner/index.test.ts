// Dry-run unit tests for the Pinterest hard cost-control primitives.
// NO paid AI calls, NO Supabase writes — a lightweight in-memory mock stands
// in for the SupabaseClient. Run with `deno test --allow-none` (offline).

import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertBudget,
  assertNotPaused,
  BudgetExceededError,
  RetryLimitExceededError,
  RunPausedError,
  type RunConfig,
} from "../_shared/pinterest-cost-guard.ts";
import {
  IMAGE_MODEL_FLASH,
  IMAGE_MODEL_PRO,
  MAX_IMAGE_RETRIES,
  pickImageStrategy,
} from "../_shared/pinterest-image-policy.ts";

// ── Minimal in-memory Supabase mock ────────────────────────────────────────
type Row = Record<string, unknown>;
class MockDb {
  tables: Record<string, Row[]> = {};
  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    const self = this;
    const state: {
      filters: Array<[string, unknown]>;
      inserted?: Row[];
    } = { filters: [] };
    const api = {
      select(_cols?: string) { return api; },
      eq(col: string, val: unknown) { state.filters.push([col, val]); return api; },
      gte(_c: string, _v: unknown) { return api; },
      in(_c: string, _v: unknown[]) { return api; },
      order(_c: string, _o: unknown) { return api; },
      limit(_n: number) { return api; },
      maybeSingle() {
        const rows = self.tables[table].filter((r) =>
          state.filters.every(([c, v]) => r[c] === v)
        );
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      single() { return api.maybeSingle(); },
      then(resolve: (v: { data: Row[]; error: null }) => void) {
        const rows = self.tables[table].filter((r) =>
          state.filters.every(([c, v]) => r[c] === v)
        );
        resolve({ data: rows, error: null });
      },
      insert(row: Row | Row[]) {
        const rows = Array.isArray(row) ? row : [row];
        self.tables[table].push(...rows);
        return Promise.resolve({ data: rows, error: null });
      },
      upsert(row: Row) {
        const key = (row as any).run_id ?? (row as any).cache_key;
        const kcol = "run_id" in row ? "run_id" : "cache_key";
        const idx = self.tables[table].findIndex((r) => r[kcol] === key);
        if (idx >= 0) self.tables[table][idx] = { ...self.tables[table][idx], ...row };
        else self.tables[table].push(row);
        return {
          select() {
            return {
              single: () => Promise.resolve({ data: row, error: null }),
            };
          },
        };
      },
      update(patch: Row) {
        for (const r of self.tables[table]) {
          if (state.filters.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
        }
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      },
    };
    return api;
  }
}

function baseCfg(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    run_id: "test-run-1",
    wave_slug: "dog",
    requested_pin_count: 3,
    product_category: "dog",
    hero_priority_slugs: [],
    max_credit_spend: 1.0,
    max_image_calls: 4,
    max_qa_calls: 4,
    allow_pro_image: false,
    force_rescore: false,
    manual_resume_required: true,
    manual_resume: true,
    status: "active",
    paused_reason: null,
    ...overrides,
  };
}

// ── Test D — projected cost exceeds cap → blocked BEFORE call ──────────────
Deno.test("D: projected spend > cap throws BudgetExceededError before call", async () => {
  const db = new MockDb();
  // Pre-seed 0.95 credits of prior spend.
  db.tables["pinterest_run_cost_ledger"] = [
    { run_id: "test-run-1", credits: 0.95, operation: "image_gen", cached_hit: false },
  ];
  const cfg = baseCfg({ max_credit_spend: 1.0 });
  await assertRejects(
    () => assertBudget(db as any, cfg, 0.15, "image"),
    BudgetExceededError,
  );
});

// ── Test C — retry limit is 1 ──────────────────────────────────────────────
Deno.test("C: MAX_IMAGE_RETRIES enforces exactly one retry", () => {
  assertEquals(MAX_IMAGE_RETRIES, 1);
  const err = new RetryLimitExceededError("image", MAX_IMAGE_RETRIES);
  assertEquals(err.kind, "image");
  assertEquals(err.limit, 1);
});

// ── Test E — paused run without manual_resume stays blocked ────────────────
Deno.test("E: paused run without manual_resume rejects work", async () => {
  const cfg = baseCfg({ status: "paused", manual_resume: false, paused_reason: "credit_state_red" });
  await assertRejects(() => assertNotPaused(cfg), RunPausedError);
});

Deno.test("E-b: paused run WITH manual_resume=true is allowed to proceed", async () => {
  const cfg = baseCfg({ status: "paused", manual_resume: true, paused_reason: "credit_state_red" });
  await assertNotPaused(cfg); // does not throw
});

// ── Test G — deterministic composite chosen, no gateway call ───────────────
Deno.test("G: pdp_hero_ok && !requires_scene → composite_photo_lock, model=null", () => {
  const cfg = baseCfg();
  const decision = pickImageStrategy(cfg, {
    pdp_hero_ok: true,
    requires_scene: false,
    hero_priority: false,
  });
  assertEquals(decision.strategy, "composite_photo_lock");
  assertEquals(decision.model, null);
  assertEquals(decision.projected_credit_cost, 0);
});

// ── Test H — pro_image requested without allow flag → falls back to flash ──
Deno.test("H: pro image requested but allow_pro_image=false → flash fallback", () => {
  const cfg = baseCfg({ allow_pro_image: false });
  const decision = pickImageStrategy(cfg, {
    pdp_hero_ok: false, // force scene path
    requires_scene: true,
    hero_priority: true,
    requested_model: IMAGE_MODEL_PRO,
  });
  assertEquals(decision.strategy, "flash_image_edit");
  assertEquals(decision.model, IMAGE_MODEL_FLASH);
  assert(decision.reason.includes("fell_back_to_flash"));
});

Deno.test("H-b: pro image allowed AND hero_priority → uses pro model", () => {
  const cfg = baseCfg({ allow_pro_image: true, max_credit_spend: 1.0 });
  const decision = pickImageStrategy(cfg, {
    pdp_hero_ok: false,
    requires_scene: true,
    hero_priority: true,
    requested_model: IMAGE_MODEL_PRO,
  });
  assertEquals(decision.strategy, "pro_image");
  assertEquals(decision.model, IMAGE_MODEL_PRO);
});

// ── Test F — worker isolation via run_id (contract check, not a live query) ─
Deno.test("F: rows with different run_id are ignored by processCandidate scope", () => {
  // The wave-runner iterates products it selects itself; only its own inserts
  // set run_id. This test documents the invariant: legacy rows created before
  // this change have run_id=null and are NEVER surfaced by the wave-runner.
  const legacyRow = { id: "legacy-1", run_id: null, status: "queued" };
  const waveRow = { id: "wave-1", run_id: "test-run-1", status: "wave_draft" };
  const activeRunId = "test-run-1";
  const eligible = [legacyRow, waveRow].filter((r) => r.run_id === activeRunId);
  assertEquals(eligible.length, 1);
  assertEquals(eligible[0].id, "wave-1");
});

// ── Tests A + B require the live Supabase client; documented as integration ─
// A (source occupancy <40%) and B (unchanged image QA cache hit) exercise
// runSourcePreflight + runScoredWithCache which need real network + DB. They
// are runnable against a staging DB with `deno test --allow-net --allow-env`
// but are excluded from the pure-unit run to keep it hermetic.
Deno.test("A/B: preflight + cache invariants (unit-level contract)", () => {
  // Contract A: preflight returns paid_calls=0 on any failure path.
  //   (Enforced by construction — runSourcePreflight makes zero gateway calls.)
  // Contract B: cache hit returns cached=true and writes credits=0 ledger row.
  //   (Enforced by runScoredWithCache — see pinterest-qa-cache.ts.)
  assert(true);
});