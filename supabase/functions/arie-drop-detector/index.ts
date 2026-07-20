import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const win24 = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
  const win14d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();

  const segments: { key: string; column: string }[] = [
    { key: "source", column: "source" },
    { key: "device", column: "device" },
    { key: "country", column: "country" },
  ];

  const incidents: any[] = [];

  for (const seg of segments) {
    const { data: recent } = await supabase
      .from("arie_sessions")
      .select(`${seg.column},stages_reached,revenue_cents`)
      .gte("last_touch", win24);
    const { data: baseline } = await supabase
      .from("arie_sessions")
      .select(`${seg.column},stages_reached,revenue_cents`)
      .gte("last_touch", win14d)
      .lt("last_touch", win24);

    const cvr = (rows: any[]) => {
      const groups = new Map<string, { total: number; purchases: number; rev: number }>();
      for (const r of rows ?? []) {
        const k = (r as any)[seg.column] || "unknown";
        const g = groups.get(k) || { total: 0, purchases: 0, rev: 0 };
        g.total += 1;
        if ((r.stages_reached || []).includes("purchase")) g.purchases += 1;
        g.rev += r.revenue_cents || 0;
        groups.set(k, g);
      }
      return groups;
    };

    const recentG = cvr(recent || []);
    const baseG = cvr(baseline || []);

    for (const [k, r] of recentG) {
      const b = baseG.get(k);
      if (!b || b.total < 50 || r.total < 20) continue;
      const rRate = r.purchases / r.total;
      const bRate = b.purchases / b.total;
      if (bRate === 0) continue;
      const dropPct = ((rRate - bRate) / bRate) * 100;
      if (dropPct <= -25) {
        const lostSessions = Math.max(0, Math.round((bRate - rRate) * r.total));
        const aov = r.purchases ? r.rev / r.purchases : b.rev / Math.max(b.purchases, 1);
        incidents.push({
          type: "conversion_drop",
          severity: dropPct <= -50 ? "high" : "medium",
          confidence: Math.min(0.95, 0.6 + r.total / 1000),
          affected_revenue_cents: Math.round(lostSessions * aov),
          affected_sessions: r.total,
          root_cause: `${seg.key}=${k} CVR ${(rRate * 100).toFixed(2)}% vs baseline ${(bRate * 100).toFixed(2)}% (Δ ${dropPct.toFixed(1)}%)`,
          suggested_repair: "investigate_segment",
          segment: { [seg.key]: k, recent_sessions: r.total, baseline_sessions: b.total },
          details: { recent_cvr: rRate, baseline_cvr: bRate, drop_pct: dropPct },
        });
      }
    }
  }

  if (incidents.length) await supabase.from("arie_incidents").insert(incidents);

  return new Response(JSON.stringify({ ok: true, incidents: incidents.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});