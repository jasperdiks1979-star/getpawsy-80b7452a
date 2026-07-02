// Genesis Ω∞ — Channel Intelligence Engine
// Nightly: computes per-channel health from canonical_sessions, runs survival
// simulations, writes certified report. Extends (does not duplicate) existing
// Genesis systems. Reads channel availability from public.channel_intelligence_snapshots-driven UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChannelDef = {
  key: string;
  label: string;
  available: boolean;
  priority: "P0" | "P1" | "P2" | "OFF";
  third_party: string;
  recovery_difficulty: number; // 0=easy 100=hard
  reason?: string;
};

const CHANNELS: ChannelDef[] = [
  { key: "google_ads",        label: "Google Ads",        available: false, priority: "OFF", third_party: "Google Ads",   recovery_difficulty: 95, reason: "Account permanently suspended" },
  { key: "meta_ads",          label: "Meta Ads",          available: false, priority: "OFF", third_party: "Meta",         recovery_difficulty: 70, reason: "Not activated — organic-first" },
  { key: "pinterest_ads",     label: "Pinterest Ads",     available: false, priority: "OFF", third_party: "Pinterest",    recovery_difficulty: 40, reason: "Not activated — organic-first" },
  { key: "seo_google",        label: "Google Organic",    available: true,  priority: "P0",  third_party: "Google Search", recovery_difficulty: 80 },
  { key: "seo_bing",          label: "Bing Organic",      available: true,  priority: "P1",  third_party: "Bing",         recovery_difficulty: 70 },
  { key: "seo_duckduckgo",    label: "DuckDuckGo",        available: true,  priority: "P2",  third_party: "DuckDuckGo",   recovery_difficulty: 60 },
  { key: "pinterest_organic", label: "Pinterest Organic", available: true,  priority: "P0",  third_party: "Pinterest",    recovery_difficulty: 55 },
  { key: "tiktok_organic",    label: "TikTok Organic",    available: true,  priority: "P1",  third_party: "TikTok",       recovery_difficulty: 60 },
  { key: "instagram_organic", label: "Instagram Organic", available: true,  priority: "P1",  third_party: "Meta",         recovery_difficulty: 55 },
  { key: "facebook_organic",  label: "Facebook Organic",  available: true,  priority: "P2",  third_party: "Meta",         recovery_difficulty: 55 },
  { key: "reddit",            label: "Reddit",            available: true,  priority: "P2",  third_party: "Reddit",       recovery_difficulty: 50 },
  { key: "youtube",           label: "YouTube",           available: true,  priority: "P2",  third_party: "Google",       recovery_difficulty: 65 },
  { key: "email",             label: "Email / Newsletter",available: true,  priority: "P0",  third_party: "Resend",       recovery_difficulty: 20 },
  { key: "referral",          label: "Referral",          available: true,  priority: "P1",  third_party: "None",         recovery_difficulty: 30 },
  { key: "affiliate",         label: "Affiliate",         available: true,  priority: "P1",  third_party: "Partners",     recovery_difficulty: 40 },
  { key: "influencer",        label: "Influencer",        available: true,  priority: "P2",  third_party: "Creators",     recovery_difficulty: 50 },
  { key: "direct",            label: "Direct",            available: true,  priority: "P1",  third_party: "None",         recovery_difficulty: 10 },
  { key: "repeat_customers",  label: "Repeat Customers",  available: true,  priority: "P0",  third_party: "None",         recovery_difficulty: 15 },
];

// Map classifier output → our channel keys
function mapClassified(c: string | null): string {
  if (!c) return "unknown";
  const k = c.toLowerCase();
  if (k.startsWith("google") && k.includes("ad")) return "google_ads";
  if (k === "google" || k === "google_organic" || k === "seo_google") return "seo_google";
  if (k === "bing" || k === "seo_bing") return "seo_bing";
  if (k === "duckduckgo") return "seo_duckduckgo";
  if (k.includes("pinterest") && k.includes("ad")) return "pinterest_ads";
  if (k.includes("pinterest")) return "pinterest_organic";
  if (k.includes("tiktok")) return "tiktok_organic";
  if (k.includes("instagram")) return "instagram_organic";
  if (k.includes("facebook") || k === "meta") return "facebook_organic";
  if (k === "reddit") return "reddit";
  if (k === "youtube") return "youtube";
  if (k === "email" || k === "newsletter") return "email";
  if (k === "referral") return "referral";
  if (k === "affiliate") return "affiliate";
  if (k === "direct") return "direct";
  return k;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Aggregate 30-day channel signals from canonical_sessions + orders
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: sessions } = await supabase
      .from("canonical_sessions")
      .select("classified_channel, order_id")
      .gte("first_seen_at", since);

    const rows = sessions ?? [];
    const orderIds = rows.map((r: any) => r.order_id).filter(Boolean);
    let revenueByOrder: Record<string, number> = {};
    if (orderIds.length) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total_amount")
        .in("id", orderIds);
      for (const o of orders ?? []) revenueByOrder[o.id] = Number(o.total_amount || 0);
    }

    const agg: Record<string, { v: number; p: number; r: number }> = {};
    for (const s of rows) {
      const k = mapClassified(s.classified_channel);
      agg[k] ??= { v: 0, p: 0, r: 0 };
      agg[k].v += 1;
      if (s.order_id) {
        agg[k].p += 1;
        agg[k].r += revenueByOrder[s.order_id] || 0;
      }
    }

    const totalV = Object.values(agg).reduce((a, b) => a + b.v, 0) || 1;
    const totalR = Object.values(agg).reduce((a, b) => a + b.r, 0) || 1;
    const totalP = Object.values(agg).reduce((a, b) => a + b.p, 0) || 1;

    // 2) Build snapshots for every registered channel
    const captured_at = new Date().toISOString();
    const snapshots = CHANNELS.map((c) => {
      const a = agg[c.key] || { v: 0, p: 0, r: 0 };
      const visitor_share = a.v / totalV;
      const revenue_share = a.r / totalR;
      const purchase_share = a.p / totalP;
      const conv = a.v > 0 ? a.p / a.v : 0;
      // Status
      let status = "UNKNOWN";
      let reason = c.reason ?? null;
      if (!c.available) { status = "UNAVAILABLE"; }
      else if (a.v === 0) { status = "DEGRADED"; reason = reason || "No traffic in 30d"; }
      else if (a.v < 5) { status = "LIMITED"; reason = reason || "Very low traffic volume"; }
      else { status = "ACTIVE"; }
      // Health: available + traffic + conversion evidence
      let health = 0;
      if (c.available) {
        health = Math.round(
          40 * Math.min(1, a.v / 50) +      // traffic weight
          30 * Math.min(1, conv * 20) +      // conversion weight
          30 * Math.min(1, a.r / 500)        // revenue weight
        );
      }
      const trust = c.available ? Math.min(100, 60 + Math.round(revenue_share * 100)) : 0;
      const dependency = Math.round(revenue_share * 60 + visitor_share * 40) * 1; // 0-100 scaled
      const spof = Math.min(100, Math.round(revenue_share * 100 * (c.recovery_difficulty / 100 + 0.5)));
      return {
        captured_at,
        channel_key: c.key,
        channel_label: c.label,
        available: c.available,
        status,
        status_reason: reason,
        priority: c.priority,
        visitors_30d: a.v,
        purchases_30d: a.p,
        revenue_30d_usd: Number(a.r.toFixed(2)),
        visitor_share: Number(visitor_share.toFixed(4)),
        revenue_share: Number(revenue_share.toFixed(4)),
        purchase_share: Number(purchase_share.toFixed(4)),
        conversion_rate: Number(conv.toFixed(4)),
        health_score: health,
        trust_score: trust,
        dependency_score: Math.min(100, dependency),
        spof_score: spof,
        recovery_difficulty: c.recovery_difficulty,
        third_party_dependency: c.third_party,
        api_status: c.available ? "reachable" : "n/a",
        owner: "Genesis",
        confidence: a.v > 20 ? 0.95 : a.v > 0 ? 0.75 : 0.5,
      };
    });

    await supabase.from("channel_intelligence_snapshots").insert(snapshots);

    // 3) Survival simulations
    const scenarios = ["seo_google", "pinterest_organic", "email", "direct", "tiktok_organic"];
    const sims = scenarios.map((k) => {
      const s = snapshots.find((x) => x.channel_key === k);
      const loss_pct = s?.revenue_share ?? 0;
      const loss_usd = (s?.revenue_30d_usd ?? 0);
      const others = snapshots
        .filter((x) => x.channel_key !== k && x.available)
        .sort((a, b) => (b.health_score * (1 - b.dependency_score / 100)) - (a.health_score * (1 - a.dependency_score / 100)));
      const alt = others[0]?.channel_label ?? "SEO";
      return {
        scenario: `${s?.channel_label ?? k} disappears overnight`,
        channel_key: k,
        expected_revenue_loss_usd: Number(loss_usd.toFixed(2)),
        expected_revenue_loss_pct: Number(loss_pct.toFixed(4)),
        business_health_loss: Math.round(loss_pct * 100 + (s?.recovery_difficulty ?? 50) / 5),
        operational_impact:
          loss_pct > 0.4 ? "Severe — single-point-of-failure exposure" :
          loss_pct > 0.15 ? "Moderate — revenue dip, recoverable in 30-60d" :
          "Low — diversified alternatives absorb load",
        recovery_time_days: Math.round((s?.recovery_difficulty ?? 50) * (loss_pct + 0.3) * 2),
        best_alternative: alt,
        recommended_actions: [
          `Redirect AI credits and engineering to ${alt}`,
          "Freeze roadmap items depending on lost channel",
          "Trigger Recovery Center playbook for affected products",
        ],
        confidence: 0.85,
      };
    });
    await supabase.from("channel_survival_simulations").insert(sims);

    // 4) Portfolio metrics & report
    const shares = snapshots.map((s) => s.revenue_share);
    const hhi = shares.reduce((a, b) => a + b * b, 0); // 0..1
    const diversification = Math.round((1 - hhi) * 100);
    const topSpof = [...snapshots].sort((a, b) => b.spof_score - a.spof_score)[0];
    const activeCount = snapshots.filter((s) => s.available).length;
    const unavailCount = snapshots.filter((s) => !s.available).length;

    const topActions = [
      { rank: 1, action: `Increase SEO investment — highest resilient ROI (recovery_difficulty ${CHANNELS.find(c=>c.key==='seo_google')?.recovery_difficulty})`, expected_impact: "High" },
      { rank: 2, action: "Grow email list — lowest recovery difficulty, owned channel", expected_impact: "High" },
      { rank: 3, action: `Reduce dependency on ${topSpof.channel_label} (SPOF ${topSpof.spof_score})`, expected_impact: "Critical" },
      { rank: 4, action: "Diversify social: TikTok + Instagram organic", expected_impact: "Medium" },
      { rank: 5, action: "Activate affiliate + referral programs", expected_impact: "Medium" },
    ];

    const summary = {
      diversification_score: diversification,
      active_channels: activeCount,
      unavailable_channels: unavailCount,
      top_spof_channel: topSpof.channel_label,
      top_spof_revenue_pct: topSpof.revenue_share,
      total_revenue_30d: Number(totalR.toFixed(2)),
      total_visitors_30d: totalV,
      channels: snapshots.map((s) => ({
        key: s.channel_key, label: s.channel_label, status: s.status,
        health: s.health_score, dep: s.dependency_score, spof: s.spof_score,
        rev_share: s.revenue_share, visitors: s.visitors_30d,
      })),
    };

    const md = [
      `# CHANNEL INTELLIGENCE CERTIFICATION`,
      `Generated: ${captured_at}`,
      ``,
      `## Portfolio`,
      `- Diversification score: **${diversification}/100**`,
      `- Active channels: ${activeCount}  ·  Unavailable: ${unavailCount}`,
      `- Top single-point-of-failure: **${topSpof.channel_label}** (SPOF ${topSpof.spof_score}, ${(topSpof.revenue_share*100).toFixed(1)}% revenue share)`,
      ``,
      `## Channel Health`,
      ...snapshots.map((s) =>
        `- ${s.channel_label}: ${s.status} · health ${s.health_score} · dep ${s.dependency_score} · SPOF ${s.spof_score} · $${s.revenue_30d_usd} · ${s.visitors_30d} visitors`),
      ``,
      `## Top Actions`,
      ...topActions.map((a) => `${a.rank}. ${a.action} — impact: ${a.expected_impact}`),
    ].join("\n");

    const sha = await sha256Hex(md);
    const { data: report } = await supabase
      .from("channel_intelligence_reports")
      .insert({
        diversification_score: diversification,
        top_spof_channel: topSpof.channel_label,
        top_spof_revenue_pct: topSpof.revenue_share,
        active_channels: activeCount,
        unavailable_channels: unavailCount,
        summary,
        top_actions: topActions,
        sha256: sha,
        markdown: md,
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ ok: true, report_id: report?.id, sha256: sha, diversification, snapshots: snapshots.length, sims: sims.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});