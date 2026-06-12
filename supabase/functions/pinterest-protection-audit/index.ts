// Pinterest Performance Protection Audit
// Classifies every posted pin into SAFE_TO_REMOVE / REPLACE_FIRST / KEEP / UNKNOWN_NO_ANALYTICS / REVIEW
// BEFORE any cleanup runs. Persists snapshot to pinterest_protection_audit_runs + _pins so the
// cleanup engine can refuse to delete a pin that still generates traffic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PinRow = {
  id: string;
  pinterest_pin_id: string | null;
  product_slug: string | null;
  board_name: string | null;
  destination_link: string | null;
  overlay_text: string | null;
  posted_at: string | null;
};

type AggRow = {
  pin_id: string;
  impressions: number;
  outbound_clicks: number;
  saves: number;
  pin_clicks: number;
};

type Bucket =
  | "SAFE_TO_REMOVE"
  | "REPLACE_FIRST"
  | "KEEP"
  | "UNKNOWN_NO_ANALYTICS"
  | "REVIEW";

function classify(impr: number, clicks: number, saves: number, hasAnalytics: boolean): Bucket {
  // KEEP — high performers (NEVER delete)
  if (clicks >= 3 || saves >= 10) return "KEEP";
  if (impr >= 1000 && impr > 0 && clicks / impr >= 0.012) return "KEEP";

  // REPLACE_FIRST — pin has reach + engagement: must publish replacement before archive
  if (impr > 100 && (clicks > 0 || saves > 0)) return "REPLACE_FIRST";

  // UNKNOWN — no analytics yet, do NOT remove
  if (!hasAnalytics) return "UNKNOWN_NO_ANALYTICS";

  // SAFE_TO_REMOVE — explicit thresholds from the spec
  if (impr < 100 && clicks === 0 && saves === 0) return "SAFE_TO_REMOVE";

  return "REVIEW";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) create run row
  const { data: runRow, error: runErr } = await supabase
    .from("pinterest_protection_audit_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return new Response(JSON.stringify({ ok: false, error: runErr?.message ?? "run insert failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id as string;

  try {
    // 2) load every posted pin (paged)
    const pins: PinRow[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pinterest_pin_queue")
        .select("id, pinterest_pin_id, product_slug, board_name, destination_link, overlay_text, posted_at")
        .not("pinterest_pin_id", "is", null)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = (data || []) as PinRow[];
      pins.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    // 3) aggregate analytics
    const aggMap = new Map<string, AggRow>();
    let aFrom = 0;
    while (true) {
      const { data, error } = await supabase
        .from("pinterest_analytics_daily")
        .select("pin_id, impressions, outbound_clicks, saves, pin_clicks")
        .range(aFrom, aFrom + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      for (const r of batch as any[]) {
        const cur = aggMap.get(r.pin_id) ?? {
          pin_id: r.pin_id, impressions: 0, outbound_clicks: 0, saves: 0, pin_clicks: 0,
        };
        cur.impressions += Number(r.impressions ?? 0);
        cur.outbound_clicks += Number(r.outbound_clicks ?? 0);
        cur.saves += Number(r.saves ?? 0);
        cur.pin_clicks += Number(r.pin_clicks ?? 0);
        aggMap.set(r.pin_id, cur);
      }
      if (batch.length < pageSize) break;
      aFrom += pageSize;
    }

    // 4) classify + collect rows
    const now = Date.now();
    const counts: Record<Bucket, number> = {
      SAFE_TO_REMOVE: 0, REPLACE_FIRST: 0, KEEP: 0, UNKNOWN_NO_ANALYTICS: 0, REVIEW: 0,
    };
    let implRisk = 0, clickRisk = 0, saveRisk = 0;

    const rows = pins.map((p) => {
      const agg = p.pinterest_pin_id ? aggMap.get(p.pinterest_pin_id) : undefined;
      const impr = agg?.impressions ?? 0;
      const clicks = agg?.outbound_clicks ?? 0;
      const saves = agg?.saves ?? 0;
      const totalEng = (agg?.pin_clicks ?? 0) + saves + clicks;
      const ctr = impr > 0 ? clicks / impr : null;
      const eng = impr > 0 ? totalEng / impr : null;
      const ageDays = p.posted_at
        ? Math.floor((now - new Date(p.posted_at).getTime()) / 86400000)
        : null;
      const bucket = classify(impr, clicks, saves, !!agg);
      counts[bucket] += 1;
      // Estimated traffic impact = REPLACE_FIRST + KEEP (anything we'd lose if cleanup acted recklessly)
      if (bucket === "REPLACE_FIRST" || bucket === "KEEP") {
        implRisk += impr; clickRisk += clicks; saveRisk += saves;
      }
      return {
        run_id: runId,
        queue_id: p.id,
        pinterest_pin_id: p.pinterest_pin_id,
        bucket,
        product_slug: p.product_slug,
        board_name: p.board_name,
        destination_link: p.destination_link,
        overlay_text: p.overlay_text,
        impressions: impr,
        outbound_clicks: clicks,
        saves,
        ctr,
        engagement_rate: eng,
        age_days: ageDays,
        has_analytics: !!agg,
      };
    });

    // 5) write per-pin rows in chunks
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("pinterest_protection_audit_pins").insert(chunk);
      if (error) throw error;
    }

    // 6) finalize run
    await supabase.from("pinterest_protection_audit_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      pins_audited: pins.length,
      safe_to_remove_count: counts.SAFE_TO_REMOVE,
      replace_first_count: counts.REPLACE_FIRST,
      keep_count: counts.KEEP,
      unknown_count: counts.UNKNOWN_NO_ANALYTICS,
      review_count: counts.REVIEW,
      estimated_impressions_at_risk: implRisk,
      estimated_clicks_at_risk: clickRisk,
      estimated_saves_at_risk: saveRisk,
      notes: {
        rule: {
          SAFE_TO_REMOVE: "impressions<100 AND clicks=0 AND saves=0 AND has_analytics",
          REPLACE_FIRST: "impressions>100 AND (clicks>0 OR saves>0) (publish replacement, wait indexed, then archive)",
          KEEP: "clicks>=3 OR saves>=10 OR (impressions>=1000 AND CTR>=1.2%)",
          UNKNOWN_NO_ANALYTICS: "no pinterest_analytics_daily rows — do NOT remove",
        },
      },
    }).eq("id", runId);

    return new Response(JSON.stringify({
      ok: true,
      run_id: runId,
      pins_audited: pins.length,
      groups: counts,
      estimated_traffic_impact_if_naively_deleted: {
        impressions: implRisk,
        outbound_clicks: clickRisk,
        saves: saveRisk,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("pinterest_protection_audit_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      notes: { error: msg },
    }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: msg, run_id: runId }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});