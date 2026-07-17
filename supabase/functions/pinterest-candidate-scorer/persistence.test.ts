// Hermetic persistence regression suite for pinterest-candidate-scorer.
// No network, no real Supabase, no paid calls. Injects a chainable fake
// Supabase client and stubs per-product scoring via createCandidateScorerHandler.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createCandidateScorerHandler } from "./index.ts";

type PgError = { message: string; code?: string } | null;

interface TableSpec {
  rows: Record<string, unknown>[];
  primaryKey?: string[];
  errors?: Partial<Record<"upsert" | "update" | "select" | "insert", PgError>>;
  upsertFilter?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
}

interface FakeDB { tables: Record<string, TableSpec>; }

function makeFakeDB(): FakeDB {
  return {
    tables: {
      products: { rows: [] },
      pinterest_run_config: { rows: [], primaryKey: ["run_id"] },
      pinterest_candidate_score_results: { rows: [], primaryKey: ["stable_key"] },
      pinterest_candidate_run_items: { rows: [], primaryKey: ["run_id", "product_id"] },
      pinterest_qa_score_cache: { rows: [], primaryKey: ["cache_key"] },
      pinterest_credit_ledger: { rows: [] },
    },
  };
}

function makeFakeSupabase(db: FakeDB) {
  function tbl(name: string): TableSpec {
    if (!db.tables[name]) db.tables[name] = { rows: [] };
    return db.tables[name];
  }
  function fromTable(name: string) {
    const state: any = { op: null, filters: [] };
    function applyFilters(rows: Record<string, unknown>[]) {
      let out = rows;
      for (const f of state.filters) {
        if (f.kind === "eq") out = out.filter((r) => (r as any)[f.col] === f.val);
        else out = out.filter((r) => (f.val as unknown[]).includes((r as any)[f.col]));
      }
      return out;
    }
    async function resolve() {
      const spec = tbl(name);
      if (state.op === "select") {
        const err = spec.errors?.select ?? null;
        if (err) return { data: null, error: err, status: 401, statusText: "unauth" };
        let rows = applyFilters(spec.rows);
        if (state.limit != null) rows = rows.slice(0, state.limit);
        return { data: rows, error: null };
      }
      if (state.op === "upsert") {
        const err = spec.errors?.upsert ?? null;
        if (err) return { data: null, error: err, status: 401, statusText: "unauth" };
        const requested = state.upsertRows ?? [];
        const toPersist = spec.upsertFilter ? spec.upsertFilter(requested) : requested;
        const conflict = (state.upsertOnConflict ?? spec.primaryKey?.join(",") ?? "id").split(",");
        for (const row of toPersist) {
          const withKey: Record<string, unknown> = { ...row };
          if (name === "pinterest_candidate_score_results" && !withKey.stable_key) {
            withKey.stable_key = `${withKey.run_id}|${withKey.product_id}|${withKey.source_image_hash ?? ""}|${withKey.scorer_version ?? ""}`;
          }
          if (!withKey.id) withKey.id = crypto.randomUUID();
          const idx = spec.rows.findIndex((existing) =>
            conflict.every((k: string) => (existing as any)[k] === (withKey as any)[k]),
          );
          if (idx >= 0) spec.rows[idx] = { ...spec.rows[idx], ...withKey };
          else spec.rows.push(withKey);
        }
        return { data: toPersist.map((r: any) => ({ id: r.id ?? crypto.randomUUID() })), error: null };
      }
      if (state.op === "update") {
        const err = spec.errors?.update ?? null;
        if (err) return { data: null, error: err, status: 401, statusText: "unauth" };
        const matched = applyFilters(spec.rows);
        for (const row of matched) Object.assign(row, state.updatePatch ?? {});
        return { data: matched, error: null };
      }
      if (state.op === "insert") {
        const err = spec.errors?.insert ?? null;
        if (err) return { data: null, error: err, status: 401, statusText: "unauth" };
        const row = { id: crypto.randomUUID(), ...(state.insertRow ?? {}) };
        spec.rows.push(row);
        return { data: [row], error: null };
      }
      return { data: null, error: { message: "no_op" } };
    }
    const q: any = {
      select(cols?: string) { state.selectCols = cols; if (state.op == null) state.op = "select"; return q; },
      eq(col: string, val: unknown) { state.filters.push({ col, val, kind: "eq" }); return q; },
      in(col: string, vals: unknown[]) { state.filters.push({ col, val: vals, kind: "in" }); return q; },
      limit(n: number) { state.limit = n; return q; },
      async maybeSingle() { const r = await resolve(); const rows = (r.data as unknown[]) ?? []; return { data: rows[0] ?? null, error: r.error }; },
      async single() { const r = await resolve(); const rows = (r.data as unknown[]) ?? []; return { data: rows[0] ?? null, error: r.error }; },
      upsert(rows: any, opts?: { onConflict?: string }) { state.op = "upsert"; state.upsertRows = Array.isArray(rows) ? rows : [rows]; state.upsertOnConflict = opts?.onConflict; return q; },
      update(patch: Record<string, unknown>) { state.op = "update"; state.updatePatch = patch; return q; },
      insert(row: Record<string, unknown>) { state.op = "insert"; state.insertRow = row; return q; },
      then(onF: any, onR?: any) { return resolve().then(onF, onR); },
    };
    return q;
  }
  return { from: fromTable } as any;
}

const RUN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-1111-1111-111111111111";
const P2 = "22222222-2222-2222-2222-222222222222";

function baseReqBody(overrides: Record<string, unknown> = {}) {
  return {
    run_id: RUN_ID, product_ids: [P1], max_candidates: 1, max_paid_calls: 1,
    max_credit_spend: 0.1, use_cache: true, allow_tier_b_evaluation: true,
    publication_allowed: false, queue_writes_allowed: false, ...overrides,
  };
}
function makeReq(body: unknown): Request {
  return new Request("http://local/scorer", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
function stubScoreOne(outcomesByPid: Record<string, any>) {
  return async (_sb: any, _cfg: any, req: any, pid: string) => {
    const o = outcomesByPid[pid];
    if (!o) throw new Error(`no_stub_for_${pid}`);
    if (o.throwError) throw new Error(o.throwError);
    const row = {
      run_id: req.run_id, product_id: pid, slug: `slug-${pid.slice(0, 4)}`, species: "dog",
      source_image_url: `https://cdn.example/${pid}.jpg`,
      source_image_hash: o.source_image_hash ?? "hash-" + pid.slice(0, 4),
      scorer_version: o.scorer_version ?? "v2-test", cache_hit: o.cache_hit ?? false,
      tier_a_result: o.tier_a ?? "not_ready", tier_b_potential_result: o.tier_b ?? "not_eligible",
      rejection_reasons: o.rejection_reasons ?? [], credits_used: o.credits ?? 0,
      occupancy: 0.6, identity_confidence: 0.98, pdp_similarity: 0.97, species_confidence: 0.9,
      variant_match: true, color_match: true, shape_match: true,
      watermark_detected: false, supplier_text_detected: false, collage_detected: false,
      image_decode_status: "pass", ...(o.extraRow ?? {}),
    };
    return { ok: true, row, report: row, provider_calls: o.provider_calls ?? 0, credits: o.credits ?? 0, disposition: o.disposition };
  };
}
function preseededRunConfig(db: FakeDB) {
  db.tables.pinterest_run_config.rows.push({
    run_id: RUN_ID, run_type: "candidate_scoring", max_credit_spend: 0.5,
    max_image_calls: 0, max_qa_calls: 45, max_total_paid_calls: 45,
    status: "active", calibrated_v2_enabled: false,
    persistence_failed: false, persistence_failure_reason: null,
  });
}

Deno.test("P01-P05. valid result: 1 score row, 1 run-item, counts reconcile, failed=0", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 200, JSON.stringify(body));
  assertEquals(body.ok, true); assertEquals(body.persistence_ok, true);
  assertEquals(body.persisted_rows, 1); assertEquals(body.failed_rows, 0);
  assertEquals(db.tables.pinterest_candidate_score_results.rows.length, 1);
  assertEquals(db.tables.pinterest_candidate_run_items.rows.length, 1);
  assertEquals(body.run_items.finalized, 1);
  assertEquals((db.tables.pinterest_candidate_run_items.rows[0] as any).disposition, "SCORED_TIER_A");
});

Deno.test("P06. score-result permission error → HTTP 500", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_score_results.errors = { upsert: { message: "permission denied for table pinterest_candidate_score_results", code: "42501" } };
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500); assertEquals(body.ok, false);
  assertEquals(body.persistence_ok, false); assertEquals(body.failed_rows, 1);
  assertEquals(body.persisted_rows, 0);
  assert(String(body.persistence_error).includes("permission denied"), body.persistence_error);
});

Deno.test("P07. run-item seed permission error surfaces + HTTP 500", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_run_items.errors = { upsert: { message: "permission denied", code: "42501" } };
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500); assertEquals(body.persistence_ok, false);
  assert(String(body.run_items.error).includes("run_item_seed_failed"), body.run_items.error);
});

Deno.test("P08. run-item finalize permission error → HTTP 500", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_run_items.errors = { update: { message: "permission denied on update", code: "42501" } };
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500);
  assert(String(body.persistence_error).includes("run_item_update_failed"), body.persistence_error);
});

Deno.test("P09-P12. score-result error → persistence_error set + persistence_failed=true on run_config", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_score_results.errors = { upsert: { message: "connection lost mid-upsert", code: "08006" } };
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500);
  assert(String(body.persistence_error).includes("connection lost"));
  const cfg = db.tables.pinterest_run_config.rows[0] as any;
  assertEquals(cfg.persistence_failed, true);
  assert(typeof cfg.persistence_failure_reason === "string" && cfg.persistence_failure_reason.length > 0);
});

Deno.test("P13/P14. zero persisted score rows never returns ok:true", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_score_results.upsertFilter = () => [];
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500); assertEquals(body.ok, false);
  assertEquals(body.persisted_rows, 0); assertEquals(body.failed_rows, 1);
  assert(String(body.persistence_error).includes("partial_persist"));
});

Deno.test("P15/P16. partial score persistence is terminal failure", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_score_results.upsertFilter = (rows) => rows.slice(0, 1);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({
      [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" },
      [P2]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" },
    }) });
  const resp = await h(makeReq(baseReqBody({ product_ids: [P1, P2], max_candidates: 2 })));
  const body = await resp.json();
  assertEquals(resp.status, 500); assertEquals(body.persisted_rows, 1);
  assertEquals(body.failed_rows, 1);
  assert(String(body.persistence_error).includes("partial_persist"));
});

Deno.test("P17. resolved Supabase response with { error } is not swallowed", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_score_results.errors = { upsert: { message: "resolved-with-error" } };
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const resp = await h(makeReq(baseReqBody()));
  const body = await resp.json();
  assertEquals(resp.status, 500);
  assert(String(body.persistence_error).includes("resolved-with-error"));
});

Deno.test("P18. thrown persistence exception → TECHNICAL_ERROR disposition on run item", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "TECHNICAL_ERROR", throwError: "boom_something_broke" } }) });
  await (await h(makeReq(baseReqBody()))).json();
  const runItem = db.tables.pinterest_candidate_run_items.rows[0] as any;
  assertEquals(runItem.disposition, "TECHNICAL_ERROR");
  assertEquals(runItem.error_message, "boom_something_broke");
});

Deno.test("P19-P21. replay idempotent: 1 score row, 1 run-item, same stable_key", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: "H1", scorer_version: "V1" } }) });
  assertEquals((await h(makeReq(baseReqBody()))).status, 200);
  assertEquals((await h(makeReq(baseReqBody()))).status, 200);
  assertEquals(db.tables.pinterest_candidate_score_results.rows.length, 1);
  assertEquals(db.tables.pinterest_candidate_run_items.rows.length, 1);
  const key = (db.tables.pinterest_candidate_score_results.rows[0] as any).stable_key;
  assertEquals(key, `${RUN_ID}|${P1}|H1|V1`);
});

Deno.test("P22. changed source hash creates a new stable_key", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const mk = (hash: string) => createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: hash, scorer_version: "V1" } }) });
  await mk("HA")(makeReq(baseReqBody()));
  await mk("HB")(makeReq(baseReqBody()));
  const keys = db.tables.pinterest_candidate_score_results.rows.map((r) => (r as any).stable_key);
  assertEquals(new Set(keys).size, 2, JSON.stringify(keys));
});

Deno.test("P23. changed scorer version creates a new stable_key", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const mk = (v: string) => createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: "H", scorer_version: v } }) });
  await mk("vA")(makeReq(baseReqBody()));
  await mk("vB")(makeReq(baseReqBody()));
  assertEquals(new Set(db.tables.pinterest_candidate_score_results.rows.map((r) => (r as any).stable_key)).size, 2);
});

Deno.test("P24. two products persist independently", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({
      [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: "hA" },
      [P2]: { disposition: "SCORED_REJECTED", tier_a: "not_ready", source_image_hash: "hB", rejection_reasons: ["low_occupancy"] },
    }) });
  const resp = await h(makeReq(baseReqBody({ product_ids: [P1, P2], max_candidates: 2 })));
  const body = await resp.json();
  assertEquals(resp.status, 200); assertEquals(body.persisted_rows, 2);
  assertEquals(db.tables.pinterest_candidate_run_items.rows.length, 2);
  assertEquals(db.tables.pinterest_candidate_run_items.rows.map((r) => (r as any).disposition).sort(), ["SCORED_REJECTED", "SCORED_TIER_A"]);
});

Deno.test("P25/P26. rejection reasons + categorical decisions persist unchanged", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const reasons = ["watermark_detected", "supplier_text_detected"];
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_REJECTED", tier_a: "not_ready",
      rejection_reasons: reasons, extraRow: { watermark_detected: true, supplier_text_detected: true } } }) });
  await h(makeReq(baseReqBody()));
  const scoreRow = db.tables.pinterest_candidate_score_results.rows[0] as any;
  assertEquals(scoreRow.rejection_reasons, reasons);
  assertEquals(scoreRow.watermark_detected, true);
  const runItem = db.tables.pinterest_candidate_run_items.rows[0] as any;
  assertEquals(runItem.rejection_reasons, reasons);
  assertEquals(runItem.categorical_decisions.watermark_detected, true);
});

Deno.test("P27/P28. source URL, hash, scorer version persist on both tables", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: "HXYZ", scorer_version: "v2.calib" } }) });
  await h(makeReq(baseReqBody()));
  const s = db.tables.pinterest_candidate_score_results.rows[0] as any;
  assertEquals(s.source_image_hash, "HXYZ"); assertEquals(s.scorer_version, "v2.calib");
  assert(String(s.source_image_url).includes(P1));
  const r = db.tables.pinterest_candidate_run_items.rows[0] as any;
  assertEquals(r.source_image_hash, "HXYZ"); assertEquals(r.evaluator_version, "v2.calib");
});

Deno.test("P29-P37. every disposition finalizes on the run item", async () => {
  const cases: Array<[string, any]> = [
    ["CACHE_HIT_TIER_A",   { disposition: "CACHE_HIT_TIER_A", tier_a: "tier_a_ready", cache_hit: true }],
    ["CACHE_HIT_REJECTED", { disposition: "CACHE_HIT_REJECTED", tier_a: "not_ready", cache_hit: true }],
    ["SCORED_TIER_A",      { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" }],
    ["SCORED_REJECTED",    { disposition: "SCORED_REJECTED", tier_a: "not_ready" }],
    ["PREFILTER_REJECTED", { disposition: "PREFILTER_REJECTED", tier_a: "not_ready" }],
    ["MISSING_SOURCE",     { disposition: "MISSING_SOURCE", tier_a: "not_ready" }],
    ["PROVIDER_FAILED",    { disposition: "PROVIDER_FAILED", throwError: "vision_call_failed:503:down" }],
    ["BUDGET_STOPPED",     { disposition: "BUDGET_STOPPED", throwError: "budget_exceeded:qa" }],
    ["TECHNICAL_ERROR",    { disposition: "TECHNICAL_ERROR", throwError: "unexpected_boom" }],
  ];
  for (const [label, spec] of cases) {
    const db = makeFakeDB(); preseededRunConfig(db);
    const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
      scoreOne: stubScoreOne({ [P1]: spec }) });
    await (await h(makeReq(baseReqBody()))).json();
    const runItem = db.tables.pinterest_candidate_run_items.rows[0] as any;
    assertEquals(runItem?.disposition, spec.disposition, `${label} expected ${spec.disposition} got ${runItem?.disposition}`);
  }
});

Deno.test("P38. provider failure produces no score-result row", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "PROVIDER_FAILED", throwError: "vision_call_failed:503:x" } }) });
  await h(makeReq(baseReqBody()));
  assertEquals(db.tables.pinterest_candidate_score_results.rows.length, 0);
});

Deno.test("P39. cache-hit produces zero provider calls and zero credits", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "CACHE_HIT_TIER_A", tier_a: "tier_a_ready", cache_hit: true, provider_calls: 0, credits: 0 } }) });
  const body = await (await h(makeReq(baseReqBody()))).json();
  assertEquals(body.provider_calls, 0); assertEquals(body.credits_spent, 0);
});

Deno.test("P40. budget_exceeded halts loop; subsequent products remain REQUESTED", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({
      [P1]: { disposition: "BUDGET_STOPPED", throwError: "budget_exceeded:qa" },
      [P2]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" },
    }) });
  await (await h(makeReq(baseReqBody({ product_ids: [P1, P2], max_candidates: 2 })))).json();
  assertEquals(db.tables.pinterest_candidate_score_results.rows.length, 0);
  const p1 = db.tables.pinterest_candidate_run_items.rows.find((r) => (r as any).product_id === P1) as any;
  const p2 = db.tables.pinterest_candidate_run_items.rows.find((r) => (r as any).product_id === P2) as any;
  assertEquals(p1.disposition, "BUDGET_STOPPED");
  assertEquals(p2.disposition, "REQUESTED");
});

Deno.test("P41/P42. no pinterest_pin_queue table touched, no PINTEREST_ACCESS_TOKEN read", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const inner = makeFakeSupabase(db);
  const readTables: string[] = [];
  const client: any = { from(name: string) { readTables.push(name); return inner.from(name); } };
  const h = createCandidateScorerHandler({ makeSupabase: () => client,
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  await h(makeReq(baseReqBody()));
  assert(!readTables.some((t) => t.includes("pin_queue")), readTables.join(","));
  // PINTEREST_ACCESS_TOKEN may exist in env; static guard (test 18c in index.test.ts) proves scorer never reads it.
});

Deno.test("P43. side_effects block reports 0 queue rows / api calls / board mutations", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  const body = await (await h(makeReq(baseReqBody()))).json();
  assertEquals(body.side_effects.queue_rows_created, 0);
  assertEquals(body.side_effects.pinterest_api_calls, 0);
  assertEquals(body.side_effects.board_mutations, 0);
  assertEquals(body.side_effects.publication_allowed, false);
});

Deno.test("P44. successful response contains persistence_ok=true", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  assertEquals((await (await h(makeReq(baseReqBody()))).json()).persistence_ok, true);
});

Deno.test("P47. duplicate run-item resolves idempotently (upsert on run_id,product_id)", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  db.tables.pinterest_candidate_run_items.rows.push({
    run_id: RUN_ID, ordinal: 99, product_id: P1, disposition: "REQUESTED", requested_at: "2020-01-01T00:00:00Z",
  });
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready" } }) });
  assertEquals((await h(makeReq(baseReqBody()))).status, 200);
  assertEquals(db.tables.pinterest_candidate_run_items.rows.length, 1);
  assertEquals((db.tables.pinterest_candidate_run_items.rows[0] as any).disposition, "SCORED_TIER_A");
});

Deno.test("P48. identical semantic input replayed collapses to 1 score row", async () => {
  const db = makeFakeDB(); preseededRunConfig(db);
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db),
    scoreOne: stubScoreOne({ [P1]: { disposition: "SCORED_TIER_A", tier_a: "tier_a_ready", source_image_hash: "SAME", scorer_version: "SAME" } }) });
  await h(makeReq(baseReqBody())); await h(makeReq(baseReqBody())); await h(makeReq(baseReqBody()));
  assertEquals(db.tables.pinterest_candidate_score_results.rows.length, 1);
});

Deno.test("P49. production default handler constructs without throwing", () => {
  assertEquals(typeof createCandidateScorerHandler(), "function");
});

Deno.test("P50. request schema behavior unchanged (invalid body → 400)", async () => {
  const db = makeFakeDB();
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db), scoreOne: stubScoreOne({}) });
  const resp = await h(makeReq({ garbage: true }));
  assertEquals(resp.status, 400);
  assertEquals((await resp.json()).error, "invalid_request");
});

Deno.test("P51. publication_allowed=true rejected at schema layer", async () => {
  const db = makeFakeDB();
  const h = createCandidateScorerHandler({ makeSupabase: () => makeFakeSupabase(db), scoreOne: stubScoreOne({}) });
  assertEquals((await h(makeReq(baseReqBody({ publication_allowed: true })))).status, 400);
});
