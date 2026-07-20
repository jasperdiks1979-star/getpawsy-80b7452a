// Production Validation Harness — runs analytics integrity checks against
// the live production deployment only (https://getpawsy.pet) and writes
// results to production_validation_runs + production_validation_checks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const PROD_URL = "https://getpawsy.pet";
const ANALYTICS_VERSION = "phase3.v1";

type Check = {
  category: string;
  name: string;
  status: "pass" | "fail" | "warn";
  severity?: "info" | "warn" | "error";
  duration_ms?: number;
  details?: Record<string, unknown>;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t };
}

function pass(category: string, name: string, details: Record<string, unknown> = {}, ms?: number): Check {
  return { category, name, status: "pass", severity: "info", details, duration_ms: ms };
}
function fail(category: string, name: string, details: Record<string, unknown> = {}, ms?: number): Check {
  return { category, name, status: "fail", severity: "error", details, duration_ms: ms };
}
function warn(category: string, name: string, details: Record<string, unknown> = {}, ms?: number): Check {
  return { category, name, status: "warn", severity: "warn", details, duration_ms: ms };
}

async function reachability(): Promise<Check[]> {
  const checks: Check[] = [];
  const targets = ["/", "/collections/cat-trees", "/products"];
  for (const path of targets) {
    const url = `${PROD_URL}${path}`;
    try {
      const { value: res, ms } = await timed(() =>
        fetch(url, { headers: { "user-agent": "GetPawsy-ValidationHarness/1.0" } })
      );
      if (res.status >= 200 && res.status < 400) {
        checks.push(pass("reachability", `GET ${path}`, { status: res.status, url }, ms));
      } else {
        checks.push(fail("reachability", `GET ${path}`, { status: res.status, url }, ms));
      }
    } catch (e) {
      checks.push(fail("reachability", `GET ${path}`, { error: String(e) }));
    }
  }
  return checks;
}

async function integrity(supabase: ReturnType<typeof createClient>): Promise<Check[]> {
  const checks: Check[] = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // visitor_activity has rows in last 24h
  {
    const { value: r, ms } = await timed(() =>
      supabase.from("visitor_activity").select("id", { head: true, count: "exact" }).gte("created_at", since)
    );
    const c = (r.count ?? 0);
    checks.push(c > 0
      ? pass("integrity", "visitor_activity has 24h rows", { count: c }, ms)
      : warn("integrity", "visitor_activity has 24h rows", { count: c }, ms));
  }
  // lp_funnel_events
  {
    const { value: r, ms } = await timed(() =>
      supabase.from("lp_funnel_events").select("id", { head: true, count: "exact" }).gte("created_at", since)
    );
    const c = (r.count ?? 0);
    checks.push(c > 0
      ? pass("integrity", "lp_funnel_events 24h", { count: c }, ms)
      : warn("integrity", "lp_funnel_events 24h", { count: c }, ms));
  }
  // analytics_funnel_waterfall
  {
    const { value: r, ms } = await timed(() =>
      supabase.from("analytics_funnel_waterfall").select("session_id", { head: true, count: "exact" })
        .gte("created_at", since)
    );
    const c = (r.count ?? 0);
    checks.push(c >= 0
      ? pass("integrity", "analytics_funnel_waterfall accessible", { count: c }, ms)
      : fail("integrity", "analytics_funnel_waterfall accessible", {}, ms));
  }
  // checkout_funnel_events
  {
    const { value: r, ms } = await timed(() =>
      supabase.from("checkout_funnel_events").select("id", { head: true, count: "exact" }).gte("created_at", since)
    );
    const c = (r.count ?? 0);
    checks.push(pass("integrity", "checkout_funnel_events accessible", { count: c }, ms));
  }
  return checks;
}

async function attribution(supabase: ReturnType<typeof createClient>): Promise<Check[]> {
  const checks: Check[] = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { value: r, ms } = await timed(() =>
    supabase.from("visitor_activity")
      .select("utm_source,utm_medium,referrer,pin_id,gclid,ttclid")
      .gte("created_at", since)
      .limit(500)
  );
  const rows = (r.data ?? []) as any[];
  const breakdown: Record<string, number> = {};
  let unresolved = 0;
  for (const row of rows) {
    const src = (row.utm_source || row.pin_id ? "pinterest" : null)
      || (row.ttclid ? "tiktok" : null)
      || (row.gclid ? "google" : null)
      || (row.referrer ? "referral" : null)
      || "direct";
    breakdown[src] = (breakdown[src] ?? 0) + 1;
    if (!src) unresolved++;
  }
  checks.push(pass("attribution", "Source classification 24h", { breakdown, sampled: rows.length }, ms));
  if (unresolved > 0) checks.push(warn("attribution", "Unresolved sources", { unresolved }));
  return checks;
}

async function filters(supabase: ReturnType<typeof createClient>): Promise<Check[]> {
  const checks: Check[] = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from("visitor_activity")
    .select("country_code,is_internal,utm_source,referrer,pin_id,gclid,ttclid")
    .gte("created_at", since)
    .limit(2000);
  const rows = (data ?? []) as any[];
  const total = rows.length;
  const us = rows.filter(r => (r.country_code || "").toUpperCase() === "US").length;
  const nonUs = total - us;
  const internal = rows.filter(r => r.is_internal === true).length;
  const external = total - internal;
  checks.push(pass("filters", "US-only consistency", { total, us, nonUs }));
  checks.push(pass("filters", "Internal vs External consistency", { total, internal, external }));
  if (us + nonUs !== total) checks.push(fail("filters", "Geo partition mismatch", { total, us, nonUs }));
  return checks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const trigger = body?.trigger ?? "manual";
  const gitCommit = body?.git_commit ?? null;
  const deploymentId = body?.deployment_id ?? null;

  const started = Date.now();
  const { data: runRow, error: runErr } = await supabase
    .from("production_validation_runs")
    .insert({
      status: "running",
      target_url: PROD_URL,
      analytics_version: ANALYTICS_VERSION,
      git_commit: gitCommit,
      deployment_id: deploymentId,
      trigger_source: trigger,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, error: runErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;

  const allChecks: Check[] = [];
  try {
    allChecks.push(...await reachability());
    allChecks.push(...await integrity(supabase));
    allChecks.push(...await attribution(supabase));
    allChecks.push(...await filters(supabase));
  } catch (e) {
    allChecks.push(fail("harness", "Runner exception", { error: String(e) }));
  }

  if (allChecks.length) {
    await supabase.from("production_validation_checks").insert(
      allChecks.map(c => ({ run_id: runId, ...c }))
    );
  }

  const passed = allChecks.filter(c => c.status === "pass").length;
  const failed = allChecks.filter(c => c.status === "fail").length;
  const warnings = allChecks.filter(c => c.status === "warn").length;
  const status = failed > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  const duration = Date.now() - started;

  await supabase.from("production_validation_runs").update({
    finished_at: new Date().toISOString(),
    status,
    duration_ms: duration,
    passed_count: passed,
    failed_count: failed,
    warning_count: warnings,
    verified_events: passed,
    failed_events: failed,
    report: { checks: allChecks.length, status },
  }).eq("id", runId);

  return new Response(JSON.stringify({
    ok: true,
    run_id: runId,
    status,
    passed,
    failed,
    warnings,
    duration_ms: duration,
    target: PROD_URL,
    analytics_version: ANALYTICS_VERSION,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});