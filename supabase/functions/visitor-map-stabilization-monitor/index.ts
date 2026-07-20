// Visitor World Map Pro — hourly stabilization monitor.
// Runs a battery of read-only checks and appends one row to
// public.stabilization_runs. Never mutates KPI definitions or map behavior.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

type CheckResult = {
  name: string;
  status: "pass" | "warn" | "fail" | "skip";
  detail?: string;
  data?: Record<string, unknown>;
};

type Incident = {
  check: string;
  metric: string;
  source: string;
  timeframe: string;
  filter: string;
  expected?: number | string | null;
  actual?: number | string | null;
  note?: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function safe<T>(fn: () => Promise<T>): Promise<T | { __error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { __error: (e as Error).message ?? String(e) };
  }
}

async function runCanonicalParity(
  timeRange: string,
): Promise<{ check: CheckResult; canonical: Record<string, unknown> | null }> {
  const r = await safe(async () => {
    const { data, error } = await admin.functions.invoke("analytics-canonical", {
      body: { timeRange },
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  });
  if ("__error" in r) {
    return {
      canonical: null,
      check: {
        name: `canonical:${timeRange}`,
        status: "fail",
        detail: r.__error,
      },
    };
  }
  return {
    canonical: r,
    check: {
      name: `canonical:${timeRange}`,
      status: "pass",
      data: {
        sessions: (r as any).sessions ?? null,
        atc: (r as any).atc ?? (r as any).addToCarts ?? null,
        checkout: (r as any).checkout ?? (r as any).checkouts ?? null,
        purchases: (r as any).purchases ?? null,
        revenue: (r as any).revenue ?? null,
        sessions_with_geo: (r as any).sessions_with_geo ?? null,
      },
    },
  };
}

async function runLiveGeo(): Promise<CheckResult> {
  const sinceIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("visitor_activity")
    .select("id", { count: "exact", head: true })
    .gte("last_seen_at", sinceIso)
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  if (error) {
    return { name: "live:geo_sessions_5m", status: "fail", detail: error.message };
  }
  return {
    name: "live:geo_sessions_5m",
    status: "pass",
    data: { active_geo_sessions: count ?? 0 },
  };
}

function diffMetric(
  a: unknown,
  b: unknown,
  tolerance = 0,
): { ok: boolean; delta: number | null } {
  if (a == null || b == null) return { ok: false, delta: null };
  const an = Number(a);
  const bn = Number(b);
  if (Number.isNaN(an) || Number.isNaN(bn)) return { ok: false, delta: null };
  const delta = Math.abs(an - bn);
  return { ok: delta <= tolerance, delta };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const started = Date.now();
  const checks: CheckResult[] = [];
  const incidents: Incident[] = [];
  const metrics: Record<string, unknown> = {};

  // 1. analytics-canonical availability across a few reference windows
  const windows = ["24h", "7d", "30d"] as const;
  const canonicalByWindow: Record<string, Record<string, unknown> | null> = {};
  for (const w of windows) {
    const { check, canonical } = await runCanonicalParity(w);
    checks.push(check);
    canonicalByWindow[w] = canonical;
    if (check.status !== "pass") {
      incidents.push({
        check: check.name,
        metric: "availability",
        source: "analytics-canonical",
        timeframe: w,
        filter: "none",
        note: check.detail ?? "invoke failed",
      });
    }
  }
  metrics.canonical = canonicalByWindow;

  // 2. Live geo sessions
  const liveCheck = await runLiveGeo();
  checks.push(liveCheck);
  metrics.live = liveCheck.data ?? {};
  if (liveCheck.status !== "pass") {
    incidents.push({
      check: liveCheck.name,
      metric: "active_geo_sessions",
      source: "visitor_activity",
      timeframe: "5m",
      filter: "lat/lng not null",
      note: liveCheck.detail,
    });
  }

  // 3. Marker count vs sessions_with_geo (24h canonical vs live sample)
  const c24 = canonicalByWindow["24h"] as any;
  if (c24?.sessions_with_geo != null) {
    // Compare canonical sessions_with_geo(24h) to raw distinct session_ids
    // with geo in the last 24h. We treat >5% deviation as a warn, >10% as fail.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: rows, error } = await admin
      .from("visitor_activity")
      .select("session_id")
      .gte("created_at", since)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(50000);
    if (error) {
      checks.push({
        name: "marker:sessions_with_geo_parity",
        status: "fail",
        detail: error.message,
      });
      incidents.push({
        check: "marker:sessions_with_geo_parity",
        metric: "sessions_with_geo",
        source: "visitor_activity",
        timeframe: "24h",
        filter: "lat/lng not null",
        note: error.message,
      });
    } else {
      const distinct = new Set((rows ?? []).map((r) => r.session_id)).size;
      const canonicalN = Number(c24.sessions_with_geo);
      const denom = Math.max(canonicalN, 1);
      const pct = Math.abs(distinct - canonicalN) / denom;
      const status: CheckResult["status"] =
        pct <= 0.05 ? "pass" : pct <= 0.10 ? "warn" : "fail";
      checks.push({
        name: "marker:sessions_with_geo_parity",
        status,
        data: { raw_distinct: distinct, canonical: canonicalN, pct_delta: pct },
      });
      if (status !== "pass") {
        incidents.push({
          check: "marker:sessions_with_geo_parity",
          metric: "sessions_with_geo",
          source: "analytics-canonical vs visitor_activity",
          timeframe: "24h",
          filter: "lat/lng not null",
          expected: canonicalN,
          actual: distinct,
          note: `pct_delta=${pct.toFixed(4)}`,
        });
      }
    }
  } else {
    checks.push({
      name: "marker:sessions_with_geo_parity",
      status: "skip",
      detail: "canonical.sessions_with_geo missing",
    });
  }

  // 4. ATC / checkout / purchase / revenue parity between canonical windows
  // (canonical is the single source of truth — Map/CSV/Summary all read from
  // it, so we assert internal self-consistency: 24h <= 7d <= 30d monotonic).
  const monoKeys = ["atc", "checkout", "purchases", "revenue", "sessions"];
  for (const k of monoKeys) {
    const v24 = Number((canonicalByWindow["24h"] as any)?.[k]);
    const v7 = Number((canonicalByWindow["7d"] as any)?.[k]);
    const v30 = Number((canonicalByWindow["30d"] as any)?.[k]);
    if ([v24, v7, v30].some((n) => Number.isNaN(n))) {
      checks.push({
        name: `parity:${k}_monotonic`,
        status: "skip",
        detail: "missing values in canonical response",
      });
      continue;
    }
    const ok = v24 <= v7 && v7 <= v30;
    checks.push({
      name: `parity:${k}_monotonic`,
      status: ok ? "pass" : "fail",
      data: { v24, v7, v30 },
    });
    if (!ok) {
      incidents.push({
        check: `parity:${k}_monotonic`,
        metric: k,
        source: "analytics-canonical",
        timeframe: "24h/7d/30d",
        filter: "none",
        note: `expected 24h<=7d<=30d, got ${v24}/${v7}/${v30}`,
      });
    }
  }

  // 5. Mapbox render/source errors — not testable server-side. Recorded as skip.
  checks.push({
    name: "mapbox:render_errors",
    status: "skip",
    detail: "server-side monitor cannot execute Mapbox GL",
  });
  // 6. React query cache drift — not testable server-side.
  checks.push({
    name: "react:query_cache_drift",
    status: "skip",
    detail: "server-side monitor cannot inspect client cache",
  });

  // Aggregate status
  const worst: CheckResult["status"] = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass";

  const runRow = {
    monitor: "visitor-world-map-pro",
    status: worst,
    duration_ms: Date.now() - started,
    checks,
    incidents,
    metrics,
  };

  const { data: inserted, error: insertError } = await admin
    .from("stabilization_runs")
    .insert(runRow)
    .select("id, ran_at, status")
    .maybeSingle();

  if (insertError) {
    return new Response(
      JSON.stringify({ ok: false, error: insertError.message, run: runRow }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, run: inserted, incidents_count: incidents.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});