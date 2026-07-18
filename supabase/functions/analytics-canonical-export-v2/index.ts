// Phase 4B admin canary CSV/Markdown export.
// Gated: caller must be admin AND canonical_traffic_quality_v2.enabled=true.
// Read-only. Never modifies rows.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkCanonicalV2Gate } from "../_shared/canonicalV2Flag.ts";
import {
  aggregateBuckets,
  totalsFromAggregate,
  classificationCoverage,
  classifyRow,
  type ClassifiableRow,
} from "../_shared/canonicalV2Buckets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PERIOD_HOURS: Record<string, number> = { "1h": 1, "10h": 10, "24h": 24, "7d": 24 * 7 };

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await checkCanonicalV2Gate(req);
  if (!gate.allowV2) {
    return new Response(JSON.stringify({ ok: false, error: "canary_disabled_or_not_admin", gate }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") || "csv").toLowerCase();
  const period = (url.searchParams.get("period") || "24h").toLowerCase();
  const hours = PERIOD_HOURS[period];
  if (!hours) {
    return new Response(JSON.stringify({ ok: false, error: "bad_period" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const until = new Date().toISOString();

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await supabase
    .from("canonical_events")
    .select("session_id,visitor_id,occurred_at,ingested_at,page_path,is_internal,technical_path,is_bot,bot_confidence,bot_reason,traffic_quality,classification_version")
    .gte("occurred_at", since)
    .lte("occurred_at", until)
    .order("occurred_at", { ascending: false })
    .limit(50000);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const rows = (data ?? []) as (ClassifiableRow & { page_path?: string; bot_reason?: string })[];

  if (format === "csv") {
    const header = [
      "session_id","visitor_id","occurred_at","page_path","traffic_quality",
      "is_bot","bot_reason","bot_confidence","is_internal","technical_path",
      "classification_version","bucket","engagement_ms","interaction_count",
    ];
    const out = [header.join(",")];
    for (const r of rows) {
      const bucket = classifyRow(r, gate.phase4aCutoffIso);
      out.push([
        r.session_id, r.visitor_id, r.occurred_at, (r as any).page_path,
        r.traffic_quality, r.is_bot, (r as any).bot_reason, r.bot_confidence,
        r.is_internal, r.technical_path, r.classification_version, bucket,
        "", "",
      ].map(csvEscape).join(","));
    }
    return new Response(out.join("\n"), {
      headers: { ...corsHeaders, "Content-Type": "text/csv" },
    });
  }

  // markdown
  const agg = aggregateBuckets(rows, gate.phase4aCutoffIso);
  const t = totalsFromAggregate(agg);
  const cov = classificationCoverage(agg);
  const md = [
    `# Canonical Traffic Quality v2 — ${period}`,
    ``,
    `Window: ${since} → ${until}`,
    `Classification version: v2.phase4a  ·  Coverage: ${cov}%`,
    ``,
    `| Bucket | Sessions | Visitors |`,
    `|---|---:|---:|`,
    `| human | ${t.human_sessions} | ${t.human_visitors} |`,
    `| uncertain | ${t.uncertain_sessions} | ${t.uncertain_visitors} |`,
    `| crawler | ${t.crawler_sessions} | ${t.crawler_visitors} |`,
    `| bot | ${t.bot_sessions} | ${t.bot_visitors} |`,
    `| technical | ${t.technical_sessions} | ${t.technical_visitors} |`,
    `| internal | ${t.internal_sessions} | ${t.internal_visitors} |`,
    `| legacy_unclassified | ${t.legacy_unclassified_sessions} | ${t.legacy_unclassified_visitors} |`,
    `| **commercial (human+uncertain)** | **${t.commercial_sessions}** | **${t.commercial_visitors}** |`,
    `| **raw** | **${t.raw_sessions}** | **${t.raw_visitors}** |`,
  ].join("\n");
  return new Response(md, { headers: { ...corsHeaders, "Content-Type": "text/markdown" } });
});