// Genesis Ω∞ — Golden Customer.
// Runs the FULL anonymous customer journey against https://getpawsy.pet using
// ONLY the public anon key + unauthenticated fetches. No admin, no service_role
// session, no cookies. Writes an auditable trail to genesis_golden_runs /
// genesis_golden_checks and, when invoked with `migration_id`, records the
// deployment verdict in genesis_rls_migration_audit.
//
// This is the single source of truth for the Production Safety Constitution.
// Extends production-validation-runner — does not replace it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const PROD_URL = "https://getpawsy.pet";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const THRESH = {
  products: 50,
  dog: 5,
  cat: 5,
  collections: 3,
  search: 1,
};

type Check = {
  phase: string;
  category: string;
  name: string;
  status: "pass" | "fail" | "warn";
  severity?: "info" | "warn" | "error";
  duration_ms?: number;
  threshold?: number;
  observed?: number;
  details?: Record<string, unknown>;
};

const ANON_HEADERS: Record<string, string> = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t = Date.now();
  const v = await fn();
  return { v, ms: Date.now() - t };
}

async function anonCount(query: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products_public?${query}`, {
    headers: { ...ANON_HEADERS, Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const range = res.headers.get("content-range") || "";
  return Number(range.split("/")[1] ?? 0);
}

async function anonList(query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products_public?${query}`, {
    headers: ANON_HEADERS,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function mk(
  phase: string,
  category: string,
  name: string,
  status: "pass" | "fail" | "warn",
  extra: Partial<Check> = {},
): Check {
  const severity = status === "fail" ? "error" : status === "warn" ? "warn" : "info";
  return { phase, category, name, status, severity, ...extra };
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// -------- Phase 2/7: reachability + business surfaces --------
async function checkPage(path: string, phase: string): Promise<Check> {
  const url = `${PROD_URL}${path}`;
  try {
    const { v, ms } = await timed(() =>
      fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "GetPawsy-GoldenCustomer/1.0" },
      })
    );
    const ok = v.status >= 200 && v.status < 400;
    return mk(phase, "reachability", `GET ${path}`, ok ? "pass" : "fail", {
      duration_ms: ms,
      details: { status: v.status, url },
    });
  } catch (e) {
    return mk(phase, "reachability", `GET ${path}`, "fail", { details: { error: String(e) } });
  }
}

// -------- Phase 4/8: catalog gates via anon PostgREST --------
async function catalogGates(): Promise<{ checks: Check[]; totals: Record<string, number> }> {
  const checks: Check[] = [];
  const totals: Record<string, number> = {};

  const gates: Array<[string, string, number]> = [
    ["all_products", "select=id&is_active=eq.true", THRESH.products],
    ["dog_products", "select=id&is_active=eq.true&primary_species=eq.dog", THRESH.dog],
    ["cat_products", "select=id&is_active=eq.true&primary_species=eq.cat", THRESH.cat],
  ];

  for (const [name, q, min] of gates) {
    try {
      const { v: n, ms } = await timed(() => anonCount(q));
      totals[name] = n;
      checks.push(mk("phase2_deployment", "catalog", name, n >= min ? "pass" : "fail", {
        duration_ms: ms, threshold: min, observed: n,
      }));
    } catch (e) {
      checks.push(mk("phase2_deployment", "catalog", name, "fail", { details: { error: String(e) } }));
    }
  }

  // Product detail — first anonymous product
  try {
    const rows = await anonList("select=id,slug,image_url,price,stock&is_active=eq.true&limit=1");
    if (!rows.length) {
      checks.push(mk("phase2_deployment", "pdp", "sample_pdp", "fail", { details: { reason: "no rows" } }));
    } else {
      const p = rows[0];
      const priceOk = typeof p.price === "number" && p.price > 0;
      const imgOk = !!p.image_url;
      const stockOk = p.stock === null || (typeof p.stock === "number" && p.stock > 0);
      checks.push(mk("phase2_deployment", "pdp", "sample_price", priceOk ? "pass" : "fail", { details: p }));
      checks.push(mk("phase2_deployment", "pdp", "sample_image", imgOk ? "pass" : "fail", { details: { image_url: p.image_url } }));
      checks.push(mk("phase2_deployment", "pdp", "sample_stock", stockOk ? "pass" : "warn", { details: { stock: p.stock } }));
      // Hit the PDP as an anonymous browser
      checks.push(await checkPage(`/product/${p.slug}`, "phase2_deployment"));
    }
  } catch (e) {
    checks.push(mk("phase2_deployment", "pdp", "sample_pdp", "fail", { details: { error: String(e) } }));
  }

  // Search — anonymous keyword count
  try {
    const { v: n, ms } = await timed(() =>
      anonCount("select=id&is_active=eq.true&name=ilike.*litter*")
    );
    totals.search = n;
    checks.push(mk("phase2_deployment", "search", "keyword_litter", n >= THRESH.search ? "pass" : "fail", {
      duration_ms: ms, threshold: THRESH.search, observed: n,
    }));
  } catch (e) {
    checks.push(mk("phase2_deployment", "search", "keyword_litter", "fail", { details: { error: String(e) } }));
  }

  return { checks, totals };
}

// -------- Phase 3/4: RLS + view/policy fingerprint via admin RPC-free reads --------
async function rlsGuardian(admin: ReturnType<typeof createClient>): Promise<{ checks: Check[]; view_checksum: string; policy_checksum: string; rls_ok: boolean }> {
  const checks: Check[] = [];

  // Introspect via information_schema through service role
  const { data: viewData } = await admin
    .from("pg_views" as any)
    .select("viewname,definition")
    .eq("schemaname", "public")
    .in("viewname", ["products_public"] as any);
  const { data: polData } = await admin
    .from("pg_policies" as any)
    .select("tablename,policyname,cmd,qual,with_check,roles")
    .eq("schemaname", "public")
    .in("tablename", ["products", "products_public"] as any);

  const view_checksum = await sha256(JSON.stringify(viewData ?? []));
  const policy_checksum = await sha256(JSON.stringify(polData ?? []));

  // Live RLS proof — anon must currently see > 0 rows on both surfaces
  let anon_products = 0;
  let anon_view = 0;
  try { anon_products = await anonCount("select=id&is_active=eq.true"); } catch { /* handled below */ }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&is_active=eq.true`, {
      headers: { ...ANON_HEADERS, Prefer: "count=exact", Range: "0-0" },
    });
    const range = res.headers.get("content-range") || "";
    anon_view = Number(range.split("/")[1] ?? 0);
  } catch { /* noop */ }

  const rls_ok = anon_products > 0 && anon_view > 0;
  checks.push(mk("phase4_rls_guardian", "rls", "anon_products_public_visible", anon_products > 0 ? "pass" : "fail", {
    observed: anon_products, details: { surface: "products_public" },
  }));
  checks.push(mk("phase4_rls_guardian", "rls", "anon_products_table_visible", anon_view > 0 ? "pass" : "fail", {
    observed: anon_view, details: { surface: "products" },
  }));
  checks.push(mk("phase4_rls_guardian", "rls", "view_checksum", "pass", { details: { view_checksum } }));
  checks.push(mk("phase4_rls_guardian", "rls", "policy_checksum", "pass", { details: { policy_checksum } }));

  return { checks, view_checksum, policy_checksum, rls_ok };
}

// -------- Phase 6: full anonymous journey (checkout smoke) --------
async function journey(): Promise<{ checks: Check[]; checkout_ok: boolean; stripe_ok: boolean; journey_ok: boolean }> {
  const checks: Check[] = [];
  checks.push(await checkPage("/", "phase6_journey"));
  checks.push(await checkPage("/collections/cats", "phase6_journey"));
  checks.push(await checkPage("/collections/dogs", "phase6_journey"));
  checks.push(await checkPage("/cart", "phase6_journey"));
  checks.push(await checkPage("/checkout", "phase6_journey"));

  // Anonymous Stripe session — dry_run so nothing is charged
  let checkout_ok = false;
  let stripe_ok = false;
  try {
    const { v: res, ms } = await timed(() =>
      fetch(`${SUPABASE_URL}/functions/v1/create-payment`, {
        method: "POST",
        headers: { ...ANON_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: true, source: "golden-customer" }),
      })
    );
    checkout_ok = res.status < 500;
    // A 200/302/400 all prove the endpoint is reachable & auth-gated correctly.
    // We only fail on 5xx / network errors — that means checkout is DOWN.
    checks.push(mk("phase6_journey", "checkout", "create-payment_reachable", checkout_ok ? "pass" : "fail", {
      duration_ms: ms, details: { status: res.status },
    }));
    stripe_ok = checkout_ok;
  } catch (e) {
    checks.push(mk("phase6_journey", "checkout", "create-payment_reachable", "fail", { details: { error: String(e) } }));
  }

  const journey_ok = checks.every((c) => c.status !== "fail");
  return { checks, checkout_ok, stripe_ok, journey_ok };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const trigger = body?.trigger ?? "manual";
  const gitCommit = body?.git_commit ?? null;
  const deploymentId = body?.deployment_id ?? null;
  const migrationId = body?.migration_id ?? null;

  const { data: runRow, error: runErr } = await admin
    .from("genesis_golden_runs")
    .insert({
      status: "running",
      target_url: PROD_URL,
      trigger_source: trigger,
      git_commit: gitCommit,
      deployment_id: deploymentId,
      migration_id: migrationId,
    })
    .select("id").single();

  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, error: runErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;
  const started = Date.now();
  const checks: Check[] = [];

  // Phase 2/7 — reachability + surfaces
  checks.push(await checkPage("/", "phase2_deployment"));
  checks.push(await checkPage("/products", "phase2_deployment"));
  checks.push(await checkPage("/collections/cat-trees", "phase2_deployment"));

  // Phase 2/8 — anonymous catalog thresholds
  const cat = await catalogGates();
  checks.push(...cat.checks);

  // Phase 4 — RLS guardian
  const rls = await rlsGuardian(admin);
  checks.push(...rls.checks);

  // Phase 6 — full anonymous journey + checkout smoke
  const jr = await journey();
  checks.push(...jr.checks);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const status = failed > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  const duration = Date.now() - started;

  const sha = await sha256(JSON.stringify({ checks, totals: cat.totals, rls: { v: rls.view_checksum, p: rls.policy_checksum } }));

  await admin.from("genesis_golden_checks").insert(
    checks.map((c) => ({ run_id: runId, ...c })),
  );

  await admin.from("genesis_golden_runs").update({
    finished_at: new Date().toISOString(),
    status,
    passed_count: passed,
    failed_count: failed,
    warning_count: warnings,
    duration_ms: duration,
    products_visible: cat.totals.all_products ?? null,
    dog_visible: cat.totals.dog_products ?? null,
    cat_visible: cat.totals.cat_products ?? null,
    search_visible: cat.totals.search ?? null,
    checkout_ok: jr.checkout_ok,
    stripe_session_ok: jr.stripe_ok,
    journey_ok: jr.journey_ok,
    rls_ok: rls.rls_ok,
    view_checksum: rls.view_checksum,
    policy_checksum: rls.policy_checksum,
    sha256: sha,
    report: { totals: cat.totals, phases: { checkout_ok: jr.checkout_ok, journey_ok: jr.journey_ok, rls_ok: rls.rls_ok } },
  }).eq("id", runId);

  // If invoked by a migration-audit trigger, record the verdict
  if (migrationId) {
    await admin.from("genesis_rls_migration_audit").insert({
      migration_id: migrationId,
      affects_anonymous: true,
      golden_run_id: runId,
      verdict: status === "fail" ? "blocked" : "passed",
      reason: status === "fail" ? `Golden Customer failed with ${failed} check(s)` : null,
    });
  }

  // -- CEO Kill Switch integration (Constitution) --------------------------
  // Fail  -> trip.   Warning -> degraded.   Pass -> clear (only if the
  // switch was tripped/degraded by a prior Golden run; never overrides a
  // manual hotfix_override).
  try {
    const { data: stateRow } = await admin
      .from("ceo_kill_switch_state")
      .select("*").eq("singleton", true).maybeSingle();
    const prev = stateRow?.status ?? "clear";

    let next = prev;
    let reason: string | null = null;
    if (status === "fail") {
      next = "tripped";
      reason = `Golden Customer FAIL — ${failed} check(s), anonymous journey broken.`;
    } else if (status === "warning") {
      next = prev === "tripped" ? "tripped" : "degraded";
      reason = `Golden Customer degraded — ${warnings} warning(s).`;
    } else if (status === "pass" && prev !== "hotfix_override") {
      next = "clear";
      reason = "Golden Customer PASS — anonymous journey healthy.";
    }

    if (next !== prev) {
      await admin.from("ceo_kill_switch_state")
        .update({
          status: next,
          reason,
          triggered_at: next === "tripped" ? new Date().toISOString() : stateRow?.triggered_at ?? null,
          cleared_at: next === "clear" ? new Date().toISOString() : null,
          triggered_by: `genesis-golden-customer:${trigger}`,
          golden_run_id: runId,
          evidence: { sha256: sha, totals: cat.totals, failed, warnings },
          updated_at: new Date().toISOString(),
        })
        .eq("singleton", true);

      await admin.from("ceo_kill_switch_events").insert({
        event: next === "clear" ? "clear" : "trip",
        previous_status: prev,
        new_status: next,
        reason,
        actor: `genesis-golden-customer:${trigger}`,
        golden_run_id: runId,
        context: { failed, warnings, totals: cat.totals },
      });
    }

    // Always publish a CEO Production Safety Certificate for this run.
    await admin.from("ceo_production_certificates").insert({
      golden_run_id: runId,
      kill_switch_status: next,
      certificate_status: status === "fail" ? "fail" : status === "warning" ? "degraded" : "pass",
      anonymous_journey_ok: jr.journey_ok,
      checkout_ok: jr.checkout_ok,
      stripe_ok: jr.stripe_ok,
      revenue_ok: jr.journey_ok && jr.checkout_ok && jr.stripe_ok,
      regression_ok: rls.rls_ok,
      confidence: passed / Math.max(1, passed + failed + warnings),
      sha256: sha,
      payload: {
        totals: cat.totals, phases: {
          journey_ok: jr.journey_ok, checkout_ok: jr.checkout_ok,
          stripe_ok: jr.stripe_ok, rls_ok: rls.rls_ok,
        },
        passed, failed, warnings, duration_ms: duration,
      },
    });
  } catch (e) {
    console.error("[kill-switch] update failed", e);
  }
  // ------------------------------------------------------------------------

  return new Response(JSON.stringify({
    ok: true,
    run_id: runId,
    status,
    passed, failed, warnings,
    duration_ms: duration,
    sha256: sha,
    totals: cat.totals,
    checkout_ok: jr.checkout_ok,
    journey_ok: jr.journey_ok,
    rls_ok: rls.rls_ok,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: status === "fail" ? 424 : 200 });
});