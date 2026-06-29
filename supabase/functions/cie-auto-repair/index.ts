// CIE Auto-Repair — safely repairs tracking/UTM/pixel mapping issues when the
// generated root-cause analysis has confidence >= cie_settings.autorepair_min_confidence
// (default 95). Every action is logged in cie_auto_repairs with before/after state.
//
// Safeguards:
//  - auto_repair_enabled flag must be true
//  - auto_repair_dry_run flag skips writes and only proposes
//  - per-cycle cap (auto_repair_max_per_cycle)
//  - circuit breaker: if >N failures in the past hour, refuse this run
//  - per-row confidence gate (>= autorepair_min_confidence)
//  - admin JWT required; internal cron secret bypass supported
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const cron = Deno.env.get("CIE_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (provided && ((internal && provided === internal) || (cron && provided === cron))) return { ok: true };
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, status: 401, message: "missing bearer" };
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const { data: u, error: ue } = await userClient.auth.getUser();
  if (ue || !u?.user) return { ok: false, status: 401, message: "invalid jwt" };
  const { data: roles } = await admin().from("user_roles").select("role").eq("user_id", u.user.id);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) return { ok: false, status: 403, message: "admin only" };
  return { ok: true };
}

// ------------------ helpers ------------------

type Repair = {
  repair_type: string;
  target: string;
  confidence: number;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  notes?: string;
  apply: () => Promise<void>;
  /** Optional id of an attribution incident to mark resolved when applied. */
  resolves_incident_id?: string;
};

const SRC_ALIASES: Record<string, string> = {
  "pinterest.com": "pinterest", "www.pinterest.com": "pinterest", "pin": "pinterest", "pin.it": "pinterest",
  "tiktok.com": "tiktok", "vt.tiktok.com": "tiktok", "tt": "tiktok",
  "facebook.com": "facebook", "fb": "facebook", "meta": "facebook", "m.facebook.com": "facebook",
  "instagram.com": "instagram", "ig": "instagram",
  "google.com": "google", "www.google.com": "google", "g": "google",
  "youtube.com": "youtube", "yt": "youtube",
};

function normalizeSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  return SRC_ALIASES[v] ?? v;
}

function clickIdToSource(click: Record<string, unknown> | null): { source: string; key: string } | null {
  if (!click) return null;
  if (click.fbclid) return { source: "facebook", key: "fbclid" };
  if (click.ttclid) return { source: "tiktok", key: "ttclid" };
  if (click.gclid) return { source: "google", key: "gclid" };
  if (click.epik || click.pinterest_click_id || click.pin_id) return { source: "pinterest", key: "epik" };
  return null;
}

// ------------------ repair builders ------------------

async function buildUtmNormalizationRepairs(c: ReturnType<typeof admin>, hours: number): Promise<Repair[]> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: rows } = await c
    .from("cie_sessions")
    .select("id, session_id, source, medium, utm")
    .gte("started_at", since)
    .limit(500);
  const repairs: Repair[] = [];
  for (const r of rows ?? []) {
    const raw = (r as any).source as string | null;
    const next = normalizeSource(raw);
    if (!raw || !next || next === raw) continue;
    const before = { source: raw };
    const after = { source: next };
    repairs.push({
      repair_type: "utm_normalize",
      target: `cie_sessions:${(r as any).session_id}`,
      // Deterministic mapping → high confidence
      confidence: 98,
      before_state: before,
      after_state: after,
      notes: `Normalized utm_source ${JSON.stringify(raw)} → ${JSON.stringify(next)}`,
      apply: async () => {
        await c.from("cie_sessions").update({ source: next }).eq("id", (r as any).id);
      },
    });
  }
  return repairs;
}

async function buildAttributionRepairs(c: ReturnType<typeof admin>, hours: number): Promise<Repair[]> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { data: rows } = await c
    .from("cie_sessions")
    .select("id, session_id, source, click_ids")
    .gte("started_at", since)
    .limit(500);
  const sessions = rows ?? [];
  const stale = new Set(["direct", "unknown", "other", "referral", ""]);
  const repairs: Repair[] = [];

  // Map open incidents by session_id so we can resolve them in-line.
  const sids = sessions.map((s: any) => s.session_id).filter(Boolean);
  const incidentsBySid = new Map<string, string>();
  if (sids.length) {
    const { data: incs } = await c
      .from("cie_attribution_incidents")
      .select("id, session_id, status")
      .eq("status", "open")
      .in("session_id", sids);
    for (const i of incs ?? []) incidentsBySid.set((i as any).session_id, (i as any).id);
  }

  for (const r of sessions) {
    const expect = clickIdToSource((r as any).click_ids ?? {});
    const cur = String((r as any).source ?? "").toLowerCase();
    if (!expect) continue;
    if (cur === expect.source) continue;
    if (cur && !stale.has(cur)) continue; // do not overwrite a real attributed channel
    const before = { source: (r as any).source ?? null };
    const after = { source: expect.source, signal: expect.key };
    repairs.push({
      repair_type: "attribution_reclassify",
      target: `cie_sessions:${(r as any).session_id}`,
      confidence: 98, // click-id presence is authoritative
      before_state: before,
      after_state: after,
      notes: `Reclassified session from ${cur || "null"} → ${expect.source} via ${expect.key}`,
      resolves_incident_id: incidentsBySid.get((r as any).session_id),
      apply: async () => {
        await c.from("cie_sessions").update({ source: expect.source }).eq("id", (r as any).id);
        const incId = incidentsBySid.get((r as any).session_id);
        if (incId) {
          await c.from("cie_attribution_incidents")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("id", incId);
        }
      },
    });
  }
  return repairs;
}

async function buildPixelMappingProposals(c: ReturnType<typeof admin>): Promise<Repair[]> {
  // Read-only audit: surfaces pixel/event-mapping gaps as proposals (never auto-applied)
  // so engineers see them in cie_auto_repairs with status='proposed'.
  const { data: rows } = await c
    .from("cie_confidence_scores")
    .select("metric, scope, confidence, rationale")
    .lt("confidence", 90)
    .like("metric", "%");
  const out: Repair[] = [];
  for (const r of rows ?? []) {
    const m = String((r as any).metric);
    if (!/^(ga4|pinterest|tiktok|meta|tracking|pixel|checkout|purchase)/i.test(m)) continue;
    out.push({
      repair_type: "pixel_mapping_audit",
      target: `confidence:${m}:${(r as any).scope ?? "global"}`,
      confidence: 70, // proposals only — must be < threshold so they never auto-apply
      before_state: { confidence: Number((r as any).confidence ?? 0), rationale: (r as any).rationale ?? null },
      after_state: { suggested: "review adapter or pixel mapping" },
      notes: "Low-confidence channel/pixel metric flagged for human review",
      apply: async () => { /* never invoked: confidence < threshold */ },
    });
  }
  return out;
}

// ------------------ orchestrator ------------------

async function runAutoRepair(c: ReturnType<typeof admin>, opts: { hours?: number; force_dry_run?: boolean }) {
  const hours = Math.max(1, Number(opts.hours ?? 24));
  const { data: s } = await c
    .from("cie_settings")
    .select("autorepair_min_confidence, auto_repair_enabled, auto_repair_dry_run, auto_repair_max_per_cycle, auto_repair_circuit_failures_1h")
    .limit(1).maybeSingle();
  const threshold = Number(s?.autorepair_min_confidence ?? 95);
  const enabled = s?.auto_repair_enabled !== false;
  const dryRun = !!opts.force_dry_run || !!s?.auto_repair_dry_run;
  const cap = Math.max(0, Number(s?.auto_repair_max_per_cycle ?? 50));
  const failureCircuit = Math.max(0, Number(s?.auto_repair_circuit_failures_1h ?? 5));

  if (!enabled) {
    return { ok: true, skipped: "auto_repair_disabled", proposed: 0, applied: 0, failed: 0 };
  }

  // Circuit breaker — bail if too many failed repairs in the last hour.
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: recentFailures } = await c
    .from("cie_auto_repairs")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("applied_at", oneHourAgo);
  if ((recentFailures ?? 0) >= failureCircuit) {
    return {
      ok: true,
      skipped: "circuit_breaker_open",
      recent_failures: recentFailures ?? 0,
      proposed: 0, applied: 0, failed: 0,
    };
  }

  const candidates: Repair[] = [
    ...await buildAttributionRepairs(c, hours),
    ...await buildUtmNormalizationRepairs(c, hours),
    ...await buildPixelMappingProposals(c),
  ];

  let applied = 0, proposed = 0, failed = 0, skippedConfidence = 0, skippedCap = 0;
  const summary: Array<Record<string, unknown>> = [];

  for (const r of candidates) {
    const willApply = !dryRun && r.confidence >= threshold && applied < cap;
    if (r.confidence < threshold && !dryRun) skippedConfidence++;
    if (!willApply && !dryRun && r.confidence >= threshold && applied >= cap) skippedCap++;

    let status: "applied" | "proposed" | "failed" = willApply ? "applied" : "proposed";
    let errMsg: string | null = null;
    if (willApply) {
      try {
        await r.apply();
        applied++;
      } catch (e) {
        status = "failed";
        errMsg = (e as Error).message;
        failed++;
      }
    } else {
      proposed++;
    }

    await c.from("cie_auto_repairs").insert({
      repair_type: r.repair_type,
      target: r.target,
      before_state: r.before_state,
      after_state: r.after_state,
      confidence: r.confidence,
      status,
      notes: errMsg ? `${r.notes ?? ""} | error: ${errMsg}` : (r.notes ?? null),
    });

    summary.push({
      type: r.repair_type, target: r.target, confidence: r.confidence, status,
    });
  }

  // Open an incident when failure rate is high in this cycle (governance signal).
  if (failed > 0 && failed >= Math.max(3, Math.floor(candidates.length * 0.2))) {
    await c.from("cie_incidents").insert({
      title: `Auto-repair failures: ${failed} of ${candidates.length}`,
      category: "auto_repair", severity: "high", owner_engine: "cie",
      description: "CIE auto-repair encountered multiple failures in a single cycle.",
      evidence: { failed, candidates: candidates.length, threshold, dry_run: dryRun },
    });
  }

  return {
    ok: true,
    dry_run: dryRun,
    threshold,
    cap,
    candidates: candidates.length,
    applied, proposed, failed,
    skipped_low_confidence: skippedConfidence,
    skipped_cap_reached: skippedCap,
    summary: summary.slice(0, 50),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, message: auth.message }), {
      status: auth.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = await req.json().catch(() => ({}));
  const traceId = crypto.randomUUID();
  try {
    const result = await runAutoRepair(admin(), { hours: body.hours, force_dry_run: body.dry_run });
    return new Response(JSON.stringify({ ok: true, traceId, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});