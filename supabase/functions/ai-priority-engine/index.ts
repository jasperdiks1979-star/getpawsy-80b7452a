import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false as const, status: 401, message: "Missing auth" };
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return { ok: false as const, status: 401, message: "Invalid token" };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleData } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleData) return { ok: false as const, status: 403, message: "Admin only" };
  return { ok: true as const, admin, user };
}

/**
 * Priority score formula
 *   score = (revenueImpact_normalized * 0.45)
 *         + (confidence * 0.20)
 *         + (trafficSize_normalized * 0.20)
 *         + ((6 - difficulty)/5 * 0.15)   // easier = higher
 */
function priorityScore(opts: {
  expected_revenue_impact: number;
  confidence: number;
  traffic_size: number;
  difficulty: number;
  maxRevenue: number;
  maxTraffic: number;
}) {
  const rev = opts.maxRevenue > 0 ? opts.expected_revenue_impact / opts.maxRevenue : 0;
  const traf = opts.maxTraffic > 0 ? opts.traffic_size / opts.maxTraffic : 0;
  const diff = Math.max(0, Math.min(1, (6 - (opts.difficulty || 3)) / 5));
  const conf = Math.max(0, Math.min(1, opts.confidence || 0));
  return Math.round((rev * 0.45 + conf * 0.2 + traf * 0.2 + diff * 0.15) * 1000) / 10;
}

type Candidate = {
  source_kind: string;
  source_ref: string | null;
  category: string;
  title: string;
  summary: string;
  recommended_action: string;
  expected_revenue_impact: number;
  confidence: number;
  difficulty: number;
  traffic_size: number;
  evidence: Record<string, unknown>;
  dedupe_key: string;
};

async function gatherCandidates(admin: ReturnType<typeof createClient>): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Pull recent insights
  const { data: insights } = await admin
    .from("ai_revenue_insights")
    .select("id,scope,scope_ref,insight_type,severity,title,body,evidence,generated_at")
    .gte("generated_at", sinceIso)
    .is("dismissed_at", null)
    .limit(50);

  for (const ins of insights ?? []) {
    const ev = (ins.evidence ?? {}) as Record<string, unknown>;
    const revImpact = Number((ev.expected_revenue_30d as number) ?? 0);
    const traffic = Number((ev.sessions as number) ?? 0);
    const sevWeight = ins.severity === "critical" ? 0.9 : ins.severity === "warn" ? 0.7 : 0.5;
    const itype = (ins as { insight_type?: string }).insight_type ?? "";
    let cat: string;
    if (itype === "conversion_friction") {
      cat = "friction";
    } else if (itype === "conversion_potential_score") {
      const label = String((ev.label as string) ?? "");
      cat =
        label === "breakout" || label === "ad_scale_candidate" || label === "homepage_candidate"
          ? "winner"
          : label === "weak" || label === "dead_traffic_magnet"
            ? "loser"
            : "winner";
    } else {
      cat = ins.scope === "product" ? (revImpact >= 0 ? "winner" : "loser") : "anomaly";
    }
    candidates.push({
      source_kind: "insight",
      source_ref: ins.id,
      category: cat,
      title: ins.title || "AI insight",
      summary: ins.body || "",
      recommended_action: (ev.recommendations as string) || "Review insight evidence",
      expected_revenue_impact: Math.max(0, revImpact),
      confidence: sevWeight,
      difficulty: 3,
      traffic_size: traffic,
      evidence: ev,
      dedupe_key: `insight:${ins.id}`,
    });
  }

  // 2. Pull creative drafts (queued only)
  const { data: creatives } = await admin
    .from("ai_creative_drafts")
    .select("id,kind,status,evidence,quality_score,title:variants,generated_at")
    .in("status", ["suggested", "approved"])
    .gte("generated_at", sinceIso)
    .limit(30);

  for (const c of creatives ?? []) {
    const ev = (c.evidence ?? {}) as Record<string, unknown>;
    candidates.push({
      source_kind: "creative",
      source_ref: c.id,
      category: "creative",
      title: `Creative draft: ${c.kind}`,
      summary: `Quality ${c.quality_score ?? 0}. Review variants before publishing.`,
      recommended_action: "Review and approve creative draft",
      expected_revenue_impact: Number((ev.expected_revenue_30d as number) ?? 250),
      confidence: Math.max(0.3, Math.min(1, Number(c.quality_score ?? 0.5))),
      difficulty: 2,
      traffic_size: Number((ev.sessions as number) ?? 0),
      evidence: ev,
      dedupe_key: `creative:${c.id}`,
    });
  }

  // 3. Pull SEO drafts
  const { data: seo } = await admin
    .from("ai_seo_drafts")
    .select("id,kind,affected_url,priority,expected_seo_impact,evidence,status,generated_at")
    .in("status", ["suggested", "approved"])
    .gte("generated_at", sinceIso)
    .limit(30);

  for (const s of seo ?? []) {
    const ev = (s.evidence ?? {}) as Record<string, unknown>;
    const prio = String(s.priority ?? "medium");
    const diff = prio === "high" ? 2 : prio === "low" ? 4 : 3;
    candidates.push({
      source_kind: "seo",
      source_ref: s.id,
      category: "seo",
      title: `SEO opportunity: ${s.kind}`,
      summary: `${s.affected_url || "site-wide"} — ${prio} priority`,
      recommended_action: "Review SEO draft and apply",
      expected_revenue_impact: Number((s.expected_seo_impact as number) ?? 0),
      confidence: prio === "high" ? 0.75 : 0.55,
      difficulty: diff,
      traffic_size: Number((ev.sessions as number) ?? 0),
      evidence: ev,
      dedupe_key: `seo:${s.id}`,
    });
  }

  // 4. Traffic quality warnings — pull bot-heavy sources from last 7d
  const { data: trafficRows } = await admin
    .from("sessions")
    .select("utm_source,quality_class")
    .gte("started_at", sinceIso)
    .limit(5000);

  if (trafficRows && trafficRows.length > 0) {
    const bySrc = new Map<string, { total: number; bad: number }>();
    for (const r of trafficRows as Array<{ utm_source: string | null; quality_class: string | null }>) {
      const src = r.utm_source || "direct";
      const cur = bySrc.get(src) ?? { total: 0, bad: 0 };
      cur.total += 1;
      if (r.quality_class === "likely_bot" || r.quality_class === "crawler" || r.quality_class === "suspicious") {
        cur.bad += 1;
      }
      bySrc.set(src, cur);
    }
    for (const [src, v] of bySrc) {
      if (v.total < 50) continue;
      const ratio = v.bad / v.total;
      if (ratio < 0.35) continue;
      candidates.push({
        source_kind: "traffic",
        source_ref: src,
        category: "traffic",
        title: `Low-quality traffic from ${src}`,
        summary: `${Math.round(ratio * 100)}% of ${v.total} sessions classified as bot/crawler/suspicious`,
        recommended_action: "Review UTM campaigns, exclude bot IPs, tighten ad targeting",
        expected_revenue_impact: 0,
        confidence: Math.min(0.95, ratio + 0.2),
        difficulty: 2,
        traffic_size: v.total,
        evidence: { source: src, total: v.total, suspicious: v.bad, ratio },
        dedupe_key: `traffic:${src}`,
      });
    }
  }

  return candidates;
}

async function rebuildQueue(admin: ReturnType<typeof createClient>) {
  const candidates = await gatherCandidates(admin);
  if (candidates.length === 0) return { inserted: 0, updated: 0 };

  const maxRevenue = Math.max(1, ...candidates.map((c) => c.expected_revenue_impact));
  const maxTraffic = Math.max(1, ...candidates.map((c) => c.traffic_size));

  const rows = candidates.map((c) => ({
    ...c,
    priority_score: priorityScore({
      expected_revenue_impact: c.expected_revenue_impact,
      confidence: c.confidence,
      traffic_size: c.traffic_size,
      difficulty: c.difficulty,
      maxRevenue,
      maxTraffic,
    }),
    status: "pending",
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Upsert on dedupe_key — keep existing status if already approved/dismissed
  const { data: existing } = await admin
    .from("ai_priority_queue")
    .select("id,dedupe_key,status")
    .in("dedupe_key", rows.map((r) => r.dedupe_key));

  const existingMap = new Map((existing ?? []).map((e: any) => [e.dedupe_key, e]));
  const toInsert: any[] = [];
  const toUpdate: any[] = [];

  for (const r of rows) {
    const ex = existingMap.get(r.dedupe_key);
    if (!ex) {
      toInsert.push(r);
    } else if (ex.status === "pending" || ex.status === "snoozed") {
      toUpdate.push({ id: ex.id, ...r, status: ex.status });
    }
  }

  let inserted = 0;
  let updated = 0;
  if (toInsert.length) {
    const { error } = await admin.from("ai_priority_queue").insert(toInsert);
    if (!error) inserted = toInsert.length;
  }
  for (const u of toUpdate) {
    const { id, ...rest } = u;
    const { error } = await admin.from("ai_priority_queue").update(rest).eq("id", id);
    if (!error) updated += 1;
  }

  return { inserted, updated, total_candidates: candidates.length };
}

async function buildSnapshot(admin: ReturnType<typeof createClient>, windowDays = 7) {
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Traffic quality breakdown
  const { data: sessions } = await admin
    .from("sessions")
    .select("quality_class,utm_source,traffic_quality_score")
    .gte("started_at", sinceIso)
    .limit(10000);

  const totalSessions = sessions?.length ?? 0;
  const qualityBuckets: Record<string, number> = { real_human: 0, suspicious: 0, crawler: 0, likely_bot: 0, unknown: 0 };
  const bySource: Record<string, number> = {};
  for (const s of sessions ?? []) {
    const q = (s as any).quality_class || "unknown";
    qualityBuckets[q] = (qualityBuckets[q] ?? 0) + 1;
    const src = (s as any).utm_source || "direct";
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  const topSources = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([source, sessions]) => ({ source, sessions }));

  // Pull top queue items
  const { data: queue } = await admin
    .from("ai_priority_queue")
    .select("category,title,priority_score,expected_revenue_impact,evidence")
    .eq("status", "pending")
    .order("priority_score", { ascending: false })
    .limit(50);

  const winners = (queue ?? []).filter((q: any) => q.category === "winner").slice(0, 5);
  const losers = (queue ?? []).filter((q: any) => q.category === "loser").slice(0, 5);
  const anomalies = (queue ?? []).filter((q: any) => q.category === "anomaly" || q.category === "traffic").slice(0, 5);

  // Revenue health (simple aggregate)
  const revenue_health = {
    total_sessions: totalSessions,
    real_human_pct: totalSessions ? Math.round((qualityBuckets.real_human / totalSessions) * 100) : 0,
    queue_total: (queue ?? []).length,
    expected_revenue_30d: (queue ?? []).reduce((s: number, q: any) => s + Number(q.expected_revenue_impact || 0), 0),
  };

  const traffic_quality = { breakdown: qualityBuckets, total: totalSessions };

  // Optional AI summary
  let ai_summary = "Snapshot generated from queue + sessions.";
  if (LOVABLE_API_KEY) {
    try {
      const ctx = { revenue_health, traffic_quality, top_sources: topSources, winners, losers, anomalies };
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a CEO advisor for an ecommerce store. Reply with 3 short bullet points (max 60 words total). No fluff." },
            { role: "user", content: `Summarize this week's commerce health and what to act on first.\n\n${JSON.stringify(ctx).slice(0, 6000)}` },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        ai_summary = j?.choices?.[0]?.message?.content ?? ai_summary;
      }
    } catch (e) {
      console.error("ai summary failed", e);
    }
  }

  const snapshot = {
    snapshot_date: new Date().toISOString().slice(0, 10),
    window_days: windowDays,
    revenue_health,
    traffic_quality,
    winners,
    losers,
    top_sources: topSources,
    anomalies,
    ai_summary,
    generated_by: "manual",
  };

  const { data, error } = await admin.from("ai_executive_snapshots").insert(snapshot).select().single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "rebuild_queue");

    if (action === "rebuild_queue") {
      const result = await rebuildQueue(auth.admin);
      return json({ ok: true, ...result });
    }

    if (action === "snapshot") {
      const snap = await buildSnapshot(auth.admin, Number(body.window_days) || 7);
      return json({ ok: true, snapshot: snap });
    }

    if (action === "update_status") {
      const { id, status, snooze_until } = body;
      if (!id || !status) return json({ error: "id and status required" }, 400);
      const update: Record<string, unknown> = { status };
      if (snooze_until) update.snooze_until = snooze_until;
      const { error } = await auth.admin.from("ai_priority_queue").update(update).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("ai-priority-engine error", e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});