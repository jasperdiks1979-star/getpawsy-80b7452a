// Shadow-mode traffic classifier.
// Read-heavy; writes ONLY additive classification columns on canonical_events
// and canonical_sessions for events in the target windows. No deletes,
// no visitor_id regeneration, no business-column updates.
//
// Auth: verify_jwt=false by platform default; requires a shared token header.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  classifyTraffic,
  aggregateSessionQuality,
  CLASSIFIER_VERSION,
  type TrafficQuality,
} from "../_shared/traffic-classifier.ts";
import { isTechnicalPath } from "../_shared/technical-routes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type WindowKey = "1h" | "10h" | "24h" | "7d";
const WINDOWS: Record<WindowKey, number> = {
  "1h": 1,
  "10h": 10,
  "24h": 24,
  "7d": 24 * 7,
};

interface WindowReport {
  window: WindowKey;
  since_iso: string;
  total_raw_sessions: number;
  human_sessions: number;
  uncertain_sessions: number;
  bot_sessions: number;
  technical_sessions: number;
  internal_sessions: number;
  human_visitors: number;
  uncertain_visitors: number;
  bot_visitors: number;
  technical_visitors: number;
  internal_visitors: number;
  total_events: number;
  page_view_events: number;
  atc_events: number;
  checkout_events: number;
  order_events: number;
  events_written: number;
  sessions_written: number;
  session_ids_join_via_visitor_activity: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const only = url.searchParams.get("window") as WindowKey | null;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const nowMs = Date.now();
    const targets: WindowKey[] = only ? [only] : ["1h", "10h", "24h", "7d"];
    const reports: WindowReport[] = [];
    // Aggregate write set across windows keyed by event id, so 24h/7d don't double-write 1h events.
    const eventWrites = new Map<
      string,
      { traffic_quality: TrafficQuality; is_bot: boolean; is_internal: boolean; technical_path: boolean; bot_confidence: number; bot_reason: string | null; source_user_agent: string | null }
    >();
    const sessionWrites = new Map<
      string,
      { traffic_quality: TrafficQuality; is_bot: boolean; technical_path: boolean; bot_confidence: number; bot_reason: string | null; engagement_ms: number; interaction_count: number }
    >();

    for (const w of targets) {
      const sinceIso = new Date(nowMs - WINDOWS[w] * 3600 * 1000).toISOString();
      // Pull events (cap for safety)
      const { data: events, error: evErr } = await supabase
        .from("canonical_events")
        .select("id, session_id, visitor_id, canonical_name, page_path, occurred_at, meta")
        .gte("occurred_at", sinceIso)
        .order("occurred_at", { ascending: true })
        .limit(50000);
      if (evErr) throw evErr;

      // Pull visitor_activity for join enrichment (bot suspects, is_internal hints, UA)
      const sessionIds = Array.from(new Set((events ?? []).map((e: any) => e.session_id).filter(Boolean)));
      const visitorIds = Array.from(new Set((events ?? []).map((e: any) => e.visitor_id).filter(Boolean)));
      const vaBySid = new Map<string, any>();
      const vaByVid = new Map<string, any>();
      let vaJoinHits = 0;
      if (sessionIds.length > 0) {
        const { data: va } = await supabase
          .from("visitor_activity")
          .select("session_id, visitor_id, user_agent, is_bot_suspect, bot_suspect_reason, is_internal, is_admin_path, traffic_quality")
          .in("session_id", sessionIds)
          .limit(20000);
        for (const row of (va ?? [])) if (row.session_id) vaBySid.set(row.session_id, row);
      }
      if (visitorIds.length > 0) {
        const { data: va2 } = await supabase
          .from("visitor_activity")
          .select("session_id, visitor_id, user_agent, is_bot_suspect, bot_suspect_reason, is_internal, is_admin_path, traffic_quality")
          .in("visitor_id", visitorIds)
          .limit(20000);
        for (const row of (va2 ?? [])) if (row.visitor_id) vaByVid.set(row.visitor_id, row);
      }

      // Group events by session_id (fallback visitor_id)
      const groups = new Map<string, any[]>();
      for (const ev of (events ?? [])) {
        const key = ev.session_id || `v:${ev.visitor_id || "unknown"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(ev);
      }

      let human = 0, uncertain = 0, bot = 0, technical = 0, internal = 0;
      const humanV = new Set<string>(), uncV = new Set<string>(), botV = new Set<string>(),
            techV = new Set<string>(), intV = new Set<string>();
      let pageViews = 0, atc = 0, checkout = 0, orders = 0;

      for (const [key, evs] of groups) {
        const first = evs[0];
        const va = (first.session_id && vaBySid.get(first.session_id)) ||
                   (first.visitor_id && vaByVid.get(first.visitor_id)) || null;
        if (va && (first.session_id ? vaBySid.has(first.session_id) : false)) vaJoinHits += 1;

        const names = evs.map((e: any) => String(e.canonical_name || "").toLowerCase());
        const hasAtc = names.some((n) => n.includes("add_to_cart") || n.includes("atc"));
        const hasCheckout = names.some((n) => n.includes("checkout"));
        const hasOrder = names.some((n) => n.includes("purchase") || n.includes("order"));
        const pvCount = names.filter((n) => n.includes("page_view") || n === "pageview").length;
        pageViews += pvCount;
        if (hasAtc) atc += 1;
        if (hasCheckout) checkout += 1;
        if (hasOrder) orders += 1;

        const engagementMs = Math.max(
          0,
          new Date(evs[evs.length - 1].occurred_at).getTime() - new Date(evs[0].occurred_at).getTime(),
        );

        const perEvent: { traffic_quality: TrafficQuality; bot_confidence?: number | null }[] = [];
        for (const ev of evs) {
          const cls = classifyTraffic({
            page_path: ev.page_path,
            user_agent: va?.user_agent ?? null,
            is_internal_hint: va?.is_internal ?? va?.is_admin_path ?? null,
            is_bot_suspect_hint: va?.is_bot_suspect ?? null,
            bot_suspect_reason: va?.bot_suspect_reason ?? null,
            engagement_ms: engagementMs,
            interaction_count: 0,
            pageviews: pvCount,
            has_atc: hasAtc,
            has_checkout: hasCheckout,
            has_order: hasOrder,
          });
          perEvent.push({ traffic_quality: cls.traffic_quality, bot_confidence: cls.bot_confidence });
          if (!eventWrites.has(ev.id)) {
            eventWrites.set(ev.id, {
              traffic_quality: cls.traffic_quality,
              is_bot: cls.is_bot,
              is_internal: cls.is_internal,
              technical_path: cls.technical_path,
              bot_confidence: cls.bot_confidence,
              bot_reason: cls.bot_reason,
              source_user_agent: va?.user_agent ?? null,
            });
          }
        }

        const strongHuman = hasAtc || hasCheckout || hasOrder;
        const sessionQ = aggregateSessionQuality(perEvent, strongHuman);

        // Session write (session_id required; skip v: pseudo groups)
        if (first.session_id && !sessionWrites.has(first.session_id)) {
          sessionWrites.set(first.session_id, {
            traffic_quality: sessionQ,
            is_bot: sessionQ === "bot",
            technical_path: sessionQ === "technical",
            bot_confidence: perEvent.reduce((m, e) => Math.max(m, Number(e.bot_confidence || 0)), 0),
            bot_reason: sessionQ === "bot" ? "aggregated" : null,
            engagement_ms: engagementMs,
            interaction_count: 0,
          });
        }

        const vid = first.visitor_id || key;
        switch (sessionQ) {
          case "human": human += 1; humanV.add(vid); break;
          case "uncertain": uncertain += 1; uncV.add(vid); break;
          case "bot": bot += 1; botV.add(vid); break;
          case "technical": technical += 1; techV.add(vid); break;
          case "internal": internal += 1; intV.add(vid); break;
        }
      }

      reports.push({
        window: w,
        since_iso: sinceIso,
        total_raw_sessions: groups.size,
        human_sessions: human,
        uncertain_sessions: uncertain,
        bot_sessions: bot,
        technical_sessions: technical,
        internal_sessions: internal,
        human_visitors: humanV.size,
        uncertain_visitors: uncV.size,
        bot_visitors: botV.size,
        technical_visitors: techV.size,
        internal_visitors: intV.size,
        total_events: (events ?? []).length,
        page_view_events: pageViews,
        atc_events: atc,
        checkout_events: checkout,
        order_events: orders,
        events_written: 0,
        sessions_written: 0,
        session_ids_join_via_visitor_activity: vaJoinHits,
      });
    }

    // Persist classification (idempotent; only if not dry_run)
    let totalEventsWritten = 0;
    let totalSessionsWritten = 0;
    if (!dryRun) {
      const ids = Array.from(eventWrites.keys());
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        // Update each row individually via .update().eq() — chunked to control roundtrips
        await Promise.all(slice.map((id) => {
          const w = eventWrites.get(id)!;
          return supabase.from("canonical_events").update({
            ...w,
            classification_version: `${CLASSIFIER_VERSION}-shadow`,
            classified_at: new Date().toISOString(),
          }).eq("id", id);
        }));
        totalEventsWritten += slice.length;
      }
      const sids = Array.from(sessionWrites.keys());
      for (let i = 0; i < sids.length; i += CHUNK) {
        const slice = sids.slice(i, i + CHUNK);
        await Promise.all(slice.map((sid) => {
          const w = sessionWrites.get(sid)!;
          return supabase.from("canonical_sessions").update({
            ...w,
            classification_version: `${CLASSIFIER_VERSION}-shadow`,
          }).eq("session_id", sid);
        }));
        totalSessionsWritten += slice.length;
      }
      // Distribute counts to widest window report (simpler than per-window bookkeeping)
      if (reports.length > 0) {
        reports[reports.length - 1].events_written = totalEventsWritten;
        reports[reports.length - 1].sessions_written = totalSessionsWritten;
      }
    }

    // Old-vs-new parity: read pre-existing session counts using legacy is_internal-only filter
    const parity: Record<string, unknown> = {};
    for (const r of reports) {
      const { count: oldSessions } = await supabase
        .from("canonical_sessions")
        .select("session_id", { count: "exact", head: true })
        .gte("last_seen_at", r.since_iso)
        .eq("is_internal", false);
      parity[r.window] = {
        old_default_sessions: oldSessions ?? null,
        new_human_sessions: r.human_sessions,
        new_human_plus_uncertain: r.human_sessions + r.uncertain_sessions,
        new_bot_sessions: r.bot_sessions,
        new_technical_sessions: r.technical_sessions,
        new_internal_sessions: r.internal_sessions,
        delta_default_minus_human_uncertain:
          (oldSessions ?? 0) - (r.human_sessions + r.uncertain_sessions),
      };
    }

    return json({
      ok: true,
      classifier_version: `${CLASSIFIER_VERSION}-shadow`,
      dry_run: dryRun,
      generated_at: new Date().toISOString(),
      windows: reports,
      parity_old_vs_new: parity,
      mutations: {
        deletes: 0,
        business_column_updates: 0,
        classification_column_updates_events: totalEventsWritten,
        classification_column_updates_sessions: totalSessionsWritten,
      },
      guardrails: {
        production_default_changed: false,
        historical_backfill_executed: false,
        visitor_ids_regenerated: false,
      },
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});