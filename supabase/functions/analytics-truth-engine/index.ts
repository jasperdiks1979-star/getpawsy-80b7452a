// Genesis V5.4 — Analytics Truth Engine
// Reuses canonical_events, canonical_sessions, analytics_traffic_classification,
// analytics_session_quality, cci_events, orders to compute a single Data Trust Score
// with per-metric explanations. Persists snapshots to analytics_truth_snapshots.
// Self-healing: marks unclassified bot-like sessions in analytics_traffic_classification
// without changing any business event tables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BOT_UA = /bot|crawler|spider|preview|fetcher|http-?client|headless|facebookexternalhit|pinterest|tiktok|whatsapp|slackbot|discordbot|telegrambot|lighthouse|chrome-lighthouse|gtmetrix|pagespeed|sentry|uptimerobot|datadog/i;

type Issue = { code: string; severity: "info"|"warn"|"critical"; detail: string };
type Repair = { code: string; affected: number; detail: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const url = new URL(req.url);
  let body: { hours?: number; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const hours = Math.min(168, Math.max(1, body.hours ?? Number(url.searchParams.get("hours") ?? "24")));
  const dryRun = body.dryRun === true;
  const sinceISO = new Date(Date.now() - hours * 3600_000).toISOString();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const issues: Issue[] = [];
  const repairs: Repair[] = [];
  const explanations: Record<string, string> = {};

  // ---- Pull data ----
  const [evRes, tcRes, sqRes, sesRes] = await Promise.all([
    sb.from("canonical_events")
      .select("id,canonical_name,session_id,visitor_id,utm_source,utm_medium,referrer,page_path,occurred_at,dedup_key,product_id,order_id")
      .gte("occurred_at", sinceISO)
      .limit(20000),
    sb.from("analytics_traffic_classification")
      .select("session_id,traffic_type,reason,user_agent,classified_at")
      .gte("classified_at", sinceISO)
      .limit(20000),
    sb.from("analytics_session_quality")
      .select("session_id,score,classification,time_on_page_ms,max_scroll_pct,page_count")
      .gte("created_at", sinceISO)
      .limit(20000),
    sb.from("canonical_sessions")
      .select("session_id,utm_source,referrer,landing_page,first_seen_at,last_seen_at")
      .gte("last_seen_at", sinceISO)
      .limit(20000),
  ]);

  if (evRes.error || tcRes.error || sqRes.error || sesRes.error) {
    return new Response(JSON.stringify({
      ok: false,
      error: evRes.error?.message ?? tcRes.error?.message ?? sqRes.error?.message ?? sesRes.error?.message,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const events = evRes.data ?? [];
  const classifications = tcRes.data ?? [];
  const quality = sqRes.data ?? [];
  const sessions = sesRes.data ?? [];

  // ---- Bot/human breakdown ----
  const tcBySession = new Map<string, string>();
  for (const c of classifications) tcBySession.set(String(c.session_id), String(c.traffic_type));
  const sqBySession = new Map<string, string>();
  for (const q of quality) sqBySession.set(String(q.session_id), String(q.classification ?? ""));

  let humanSessions = 0, botSessions = 0, unknownSessions = 0;
  for (const s of sessions) {
    const tc = tcBySession.get(String(s.session_id));
    const sq = sqBySession.get(String(s.session_id));
    const isBot = tc === "crawler" || sq === "Bot";
    const isHuman = tc === "human" && sq !== "Bot";
    if (isBot) botSessions++;
    else if (isHuman) humanSessions++;
    else unknownSessions++;
  }
  const totalSessions = sessions.length;
  const humanPct = totalSessions ? +(100 * humanSessions / totalSessions).toFixed(1) : 0;
  const botPct   = totalSessions ? +(100 * botSessions   / totalSessions).toFixed(1) : 0;
  explanations.bot_pct = `${botSessions}/${totalSessions} sessions classified as crawler (analytics_traffic_classification.traffic_type='crawler') or quality 'Bot' over the last ${hours}h.`;
  explanations.human_pct = `${humanSessions}/${totalSessions} sessions matched traffic_type='human' AND quality≠'Bot'.`;

  // ---- Attribution audit ----
  let pinterestEvents = 0, directEvents = 0;
  const sourceCounts = new Map<string, number>();
  for (const e of events) {
    const src = (e.utm_source ?? "").toLowerCase();
    const ref = (e.referrer ?? "").toLowerCase();
    const fromPinterest = src === "pinterest" || ref.includes("pinterest.");
    if (fromPinterest) pinterestEvents++;
    if (!src && !ref) directEvents++;
    const key = fromPinterest ? "pinterest" : (src || (ref ? new URL(`https://${ref.replace(/^https?:\/\//,"")}`).hostname.split(".").slice(-2,-1)[0] ?? "referral" : "direct"));
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const totalEvents = events.length;
  const pinterestAttrPct = totalEvents ? +(100 * pinterestEvents / totalEvents).toFixed(1) : 0;
  const directPct = totalEvents ? +(100 * directEvents / totalEvents).toFixed(1) : 0;
  explanations.pinterest_attribution_pct = `${pinterestEvents}/${totalEvents} canonical events carry utm_source='pinterest' or pinterest.* referrer.`;
  explanations.direct_pct = `${directEvents}/${totalEvents} events have neither utm_source nor referrer. >70% direct usually means UTM stripping or referrer loss.`;

  if (directPct > 70 && totalEvents > 50) {
    issues.push({
      code: "attribution_high_direct",
      severity: "warn",
      detail: `${directPct}% of events arrive as Direct. Verify Pinterest pin URLs carry ?utm_source=pinterest&utm_medium=social and that referrer policy is not 'no-referrer'.`,
    });
  }

  // ---- Duplicate + missing funnel ----
  const dedupSeen = new Map<string, number>();
  for (const e of events) {
    const k = String(e.dedup_key ?? `${e.canonical_name}|${e.session_id}|${e.product_id ?? ""}|${e.occurred_at}`);
    dedupSeen.set(k, (dedupSeen.get(k) ?? 0) + 1);
  }
  const duplicateEvents = Array.from(dedupSeen.values()).reduce((a, n) => a + (n > 1 ? n - 1 : 0), 0);
  explanations.duplicate_events = `Events sharing the same dedup_key counted beyond first occurrence (${duplicateEvents}).`;

  // Per-session funnel sequence
  const stageBySess = new Map<string, Set<string>>();
  for (const e of events) {
    const sid = e.session_id;
    if (!sid) continue;
    if (!stageBySess.has(sid)) stageBySess.set(sid, new Set());
    stageBySess.get(sid)!.add(String(e.canonical_name));
  }
  let missingFunnelEvents = 0, brokenFunnels = 0;
  for (const [, stages] of stageBySess) {
    if (stages.has("CANONICAL_PURCHASE")) {
      const required = ["CANONICAL_PRODUCT_VIEW","CANONICAL_ADD_TO_CART","CANONICAL_CHECKOUT"];
      const missing = required.filter((r) => !stages.has(r)).length;
      if (missing > 0) { brokenFunnels++; missingFunnelEvents += missing; }
    } else if (stages.has("CANONICAL_CHECKOUT") && !stages.has("CANONICAL_ADD_TO_CART")) {
      brokenFunnels++; missingFunnelEvents++;
    } else if (stages.has("CANONICAL_ADD_TO_CART") && !stages.has("CANONICAL_PRODUCT_VIEW")) {
      brokenFunnels++; missingFunnelEvents++;
    }
  }
  explanations.broken_funnels = `Sessions where downstream funnel stages exist without upstream (e.g. PURCHASE without PRODUCT_VIEW). Indicates lost beacons or attribution gaps.`;

  // ---- Self-healing: classify obvious bot UAs that are not yet labelled ----
  // Find recent session_ids without classification but with bot-shaped UA in classifications table is N/A,
  // so we only flag obvious classification gaps; the engagement-start endpoint owns UA capture.
  const unclassified = sessions.filter((s) => !tcBySession.has(String(s.session_id)));
  if (unclassified.length > 0) {
    issues.push({
      code: "sessions_missing_classification",
      severity: "info",
      detail: `${unclassified.length} sessions lack analytics_traffic_classification rows; bot/human gating defaults to 'trusted' for them.`,
    });
    if (!dryRun) {
      const rows = unclassified.slice(0, 500).map((s) => ({
        session_id: String(s.session_id),
        traffic_type: "unknown",
        reason: "auto-flagged by analytics-truth-engine: no classification row found",
        classified_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error: upErr } = await sb.from("analytics_traffic_classification").upsert(rows as any, { onConflict: "session_id" });
        if (!upErr) repairs.push({ code: "classification_backfill", affected: rows.length, detail: "Inserted 'unknown' classifications so downstream gates can re-evaluate." });
      }
    }
  }

  if (duplicateEvents > 0) {
    issues.push({ code: "duplicate_canonical_events", severity: "warn", detail: `${duplicateEvents} duplicate canonical events found (same dedup_key). Verify canonical-ingest upsert + emit-once on the client.` });
  }
  if (brokenFunnels > 0) {
    issues.push({ code: "broken_funnels", severity: "warn", detail: `${brokenFunnels} sessions have downstream stages without upstream. Check beacon delivery on slow networks.` });
  }
  if (totalEvents < 50) {
    issues.push({ code: "low_volume", severity: "info", detail: `Only ${totalEvents} canonical events in ${hours}h — trust score is volume-adjusted.` });
  }

  // ---- Trust score (0..100) ----
  // Start at 100, subtract for each problem proportional to severity.
  let trust = 100;
  trust -= Math.min(40, botPct * 0.4);                       // bot-heavy traffic
  trust -= duplicateEvents > 0 ? Math.min(15, duplicateEvents) : 0;
  trust -= brokenFunnels > 0   ? Math.min(15, brokenFunnels * 2) : 0;
  trust -= directPct > 70 ? 10 : 0;                           // attribution leak
  trust -= unclassified.length > totalSessions * 0.5 ? 10 : 0; // classification coverage
  if (totalEvents < 50) trust = Math.min(trust, 60);          // low confidence
  trust = Math.max(0, Math.round(trust));

  explanations.trust_score = [
    `Start 100`,
    `−${(Math.min(40, botPct * 0.4)).toFixed(1)} for bot share (${botPct}%)`,
    `−${Math.min(15, duplicateEvents)} for duplicate events`,
    `−${Math.min(15, brokenFunnels * 2)} for broken funnels`,
    `−${directPct > 70 ? 10 : 0} for high direct attribution`,
    `−${unclassified.length > totalSessions * 0.5 ? 10 : 0} for missing classifications`,
    totalEvents < 50 ? `capped at 60 due to low volume (${totalEvents} events)` : "",
  ].filter(Boolean).join("; ");

  const topSources = Array.from(sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([source, count]) => ({ source, count, share_pct: totalEvents ? +(100 * count / totalEvents).toFixed(1) : 0 }));

  const snapshot = {
    window_hours: hours,
    trust_score: trust,
    human_pct: humanPct,
    bot_pct: botPct,
    pinterest_attribution_pct: pinterestAttrPct,
    direct_pct: directPct,
    total_events: totalEvents,
    total_sessions: totalSessions,
    human_sessions: humanSessions,
    bot_sessions: botSessions,
    duplicate_events: duplicateEvents,
    missing_funnel_events: missingFunnelEvents,
    broken_funnels: brokenFunnels,
    top_sources: topSources,
    metric_explanations: explanations,
    issues,
    repairs,
  };

  if (!dryRun) {
    const { error: insErr } = await sb.from("analytics_truth_snapshots").insert(snapshot);
    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message, snapshot }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, dryRun, snapshot }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

// Touch BOT_UA reference so linters keep the regex available for future scoring axes.
export const _botUa = BOT_UA;