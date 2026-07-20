import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { classifyTrafficSource, type TSIInput } from "./classifier.ts";

/**
 * Genesis V3.3 — Traffic Source Intelligence backfill / live enrichment.
 *
 * Reads canonical_sessions, runs the deterministic classifier against each
 * row using prior-session continuity, and upserts the result into
 * tsi_session_enrichment. Never mutates canonical_sessions itself.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ATTRIBUTION_WINDOW_MIN = 60 * 24 * 7; // 7 days

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 1000), 5000);
    const sinceDays = Number(body.since_days ?? 30);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const sinceIso = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    const { data: sessions, error } = await sb
      .from("canonical_sessions")
      .select("session_id, visitor_id, referrer, landing_page, utm_source, utm_medium, utm_campaign, country, device, browser, os, first_seen_at")
      .gte("first_seen_at", sinceIso)
      .order("first_seen_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    // Build per-visitor history for recovery
    const byVisitor = new Map<string, Array<typeof sessions[number]>>();
    for (const s of sessions || []) {
      const k = s.visitor_id || s.session_id;
      if (!byVisitor.has(k)) byVisitor.set(k, []);
      byVisitor.get(k)!.push(s);
    }

    const rows: Record<string, unknown>[] = [];
    for (const s of sessions || []) {
      const k = s.visitor_id || s.session_id;
      const history = byVisitor.get(k) || [];
      const prior = history.filter((h) => h.first_seen_at < s.first_seen_at)
        .sort((a, b) => (a.first_seen_at < b.first_seen_at ? 1 : -1))[0];
      let previous_session: TSIInput["previous_session"] = null;
      if (prior) {
        const minutes = Math.round((new Date(s.first_seen_at).getTime() - new Date(prior.first_seen_at).getTime()) / 60000);
        if (minutes <= ATTRIBUTION_WINDOW_MIN) {
          previous_session = {
            utm_source: prior.utm_source,
            utm_medium: prior.utm_medium,
            referrer: prior.referrer,
            minutes_ago: minutes,
          };
        }
      }

      const result = classifyTrafficSource({
        session_id: s.session_id,
        visitor_id: s.visitor_id,
        referrer: s.referrer,
        landing_page: s.landing_page,
        utm_source: s.utm_source,
        utm_medium: s.utm_medium,
        utm_campaign: s.utm_campaign,
        country: s.country,
        device: s.device,
        browser: s.browser,
        os: s.os,
        previous_session,
      });

      rows.push({
        session_id: s.session_id,
        original_source: s.utm_source,
        original_medium: s.utm_medium,
        recovered_source: result.recovered_source,
        classification: result.classification,
        bucket: result.bucket,
        confidence: result.confidence,
        reason: result.reason,
        evidence: result.evidence,
        is_recovered: result.is_recovered,
        is_bot: result.is_bot,
        is_internal: result.is_internal,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error: upErr } = await sb
        .from("tsi_session_enrichment")
        .upsert(rows, { onConflict: "session_id" });
      if (upErr) throw upErr;
    }

    return new Response(JSON.stringify({ ok: true, classified: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});