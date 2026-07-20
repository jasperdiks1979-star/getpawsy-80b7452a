// Channel Reallocation Engine
// When channels are marked unavailable (CHANNEL_AVAILABILITY or DB flag),
// redistribute daily_budget/share_pct of unavailable channels across healthy
// available channels weighted by recent health score, mark orphaned
// orchestrator recommendations obsolete, and write a full audit row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

type Budget = {
  channel: string;
  daily_budget: number;
  allocated: number;
  share_pct: number;
  autopilot: boolean;
  meta: Record<string, unknown> | null;
};

// Mirror of src/config/channel-availability.ts (edge runtime cannot import src)
const UNAVAILABLE_DEFAULT = new Set<string>([
  "google_ads",
  "meta_ads",
  "pinterest_ads",
]);

// Map DB channel keys -> availability config keys (best-effort)
const CHANNEL_ALIAS: Record<string, string> = {
  pinterest: "pinterest_organic",
  tiktok: "tiktok_organic",
  instagram: "instagram_organic",
  facebook: "facebook_organic",
  google: "seo_google",
  bing: "seo_bing",
  seo: "seo_google",
};

function normalize(ch: string): string {
  return CHANNEL_ALIAS[ch] ?? ch;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { dry_run?: boolean; trigger_reason?: string; unavailable_override?: string[] } = {};
  try { body = await req.json(); } catch { /* GET */ }
  const dryRun = !!body.dry_run;
  const trigger = body.trigger_reason ?? "manual_run";

  // 1. Resolve unavailable set
  const unavailable = new Set<string>([...UNAVAILABLE_DEFAULT, ...(body.unavailable_override ?? [])]);

  // 2. Fetch current budget rows
  const { data: budgets, error: bErr } = await supabase
    .from("growth_channel_budget")
    .select("*");
  if (bErr) {
    return new Response(JSON.stringify({ error: bErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const rows = (budgets ?? []) as Budget[];

  const budgetBefore: Record<string, number> = {};
  const shareBefore: Record<string, number> = {};
  for (const r of rows) {
    budgetBefore[r.channel] = Number(r.daily_budget) || 0;
    shareBefore[r.channel] = Number(r.share_pct) || 0;
  }

  // 3. Split available vs. unavailable
  const unavailableRows = rows.filter((r) => unavailable.has(normalize(r.channel)) || unavailable.has(r.channel));
  const availableRows = rows.filter((r) => !unavailableRows.includes(r));

  const freedBudget = unavailableRows.reduce((s, r) => s + (Number(r.daily_budget) || 0), 0);
  const freedShare = unavailableRows.reduce((s, r) => s + (Number(r.share_pct) || 0), 0);

  // 4. Health-weighted redistribution
  const { data: snaps } = await supabase
    .from("channel_intelligence_snapshots")
    .select("channel, health_score, snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(200);

  const healthByChannel = new Map<string, number>();
  for (const s of snaps ?? []) {
    if (!healthByChannel.has(s.channel)) {
      healthByChannel.set(s.channel, Math.max(1, Number(s.health_score) || 50));
    }
  }

  const weights = availableRows.map((r) => ({
    row: r,
    w: healthByChannel.get(r.channel) ?? healthByChannel.get(normalize(r.channel)) ?? 50,
  }));
  const totalW = weights.reduce((s, x) => s + x.w, 0) || 1;

  const reallocFrom: Record<string, { daily_budget: number; share_pct: number }> = {};
  for (const u of unavailableRows) {
    reallocFrom[u.channel] = { daily_budget: Number(u.daily_budget) || 0, share_pct: Number(u.share_pct) || 0 };
  }
  const reallocTo: Record<string, { daily_budget: number; share_pct: number }> = {};
  const updates: Array<Partial<Budget> & { channel: string }> = [];

  for (const { row, w } of weights) {
    const addBudget = (w / totalW) * freedBudget;
    const addShare = (w / totalW) * freedShare;
    const newBudget = Math.round(((Number(row.daily_budget) || 0) + addBudget) * 100) / 100;
    const newShare = Math.round(((Number(row.share_pct) || 0) + addShare) * 100) / 100;
    reallocTo[row.channel] = { daily_budget: addBudget, share_pct: addShare };
    updates.push({
      channel: row.channel,
      daily_budget: newBudget,
      share_pct: newShare,
      meta: {
        ...(row.meta ?? {}),
        last_reallocation: new Date().toISOString(),
        reallocation_reason: trigger,
        health_weight: w,
      },
      last_allocation_at: new Date().toISOString() as unknown as never,
    });
  }

  // Zero-out unavailable rows
  for (const u of unavailableRows) {
    updates.push({
      channel: u.channel,
      daily_budget: 0,
      share_pct: 0,
      autopilot: false,
      meta: {
        ...(u.meta ?? {}),
        unavailable: true,
        zeroed_at: new Date().toISOString(),
        zeroed_reason: trigger,
      },
    });
  }

  // 5. Apply budget updates
  const budgetAfter: Record<string, number> = { ...budgetBefore };
  if (!dryRun) {
    for (const u of updates) {
      const { error } = await supabase
        .from("growth_channel_budget")
        .update({ daily_budget: u.daily_budget, share_pct: u.share_pct, autopilot: u.autopilot, meta: u.meta })
        .eq("channel", u.channel);
      if (!error) budgetAfter[u.channel] = Number(u.daily_budget) || 0;
    }
  } else {
    for (const u of updates) budgetAfter[u.channel] = Number(u.daily_budget) || 0;
  }

  // 6. Mark orphaned orchestrator recommendations obsolete + rescore
  const unavailableList = [...unavailable];
  const orLike = unavailableList.map((c) => `source.ilike.%${c}%,category.ilike.%${c}%,title.ilike.%${c}%`).join(",");

  let obsoleted = 0;
  let rescored = 0;
  if (unavailableList.length && !dryRun) {
    const { data: orphans } = await supabase
      .from("growth_orchestrator_recommendations")
      .select("id, score")
      .or(orLike)
      .eq("obsolete", false)
      .limit(1000);
    const ids = (orphans ?? []).map((o) => o.id);
    if (ids.length) {
      await supabase
        .from("growth_orchestrator_recommendations")
        .update({ obsolete: true })
        .in("id", ids);
      obsoleted = ids.length;
    }

    // Rescore surviving recs: +5% boost for available-channel recs to reflect the freed capacity
    const { data: survivors } = await supabase
      .from("growth_orchestrator_recommendations")
      .select("id, score, rank")
      .eq("obsolete", false)
      .order("score", { ascending: false })
      .limit(500);
    if (survivors?.length) {
      const boosted = survivors.map((s, idx) => ({
        id: s.id,
        score: Math.round(((Number(s.score) || 0) * 1.05) * 100) / 100,
        rank: idx + 1,
      }));
      for (const b of boosted) {
        await supabase.from("growth_orchestrator_recommendations")
          .update({ score: b.score, rank: b.rank }).eq("id", b.id);
      }
      rescored = boosted.length;
    }
  }

  // 7. Audit
  const rationale =
    unavailableRows.length === 0
      ? "No channels currently unavailable in budget table; ran audit sweep."
      : `Freed $${freedBudget.toFixed(2)}/day and ${freedShare.toFixed(1)}% share from ${unavailableRows.map((r) => r.channel).join(", ")}. ` +
        `Redistributed across ${weights.length} available channel(s) weighted by 30-day health score (total weight ${totalW.toFixed(1)}). ` +
        `Obsoleted ${obsoleted} orphan recommendation(s); rescored ${rescored} survivor(s) with +5% capacity boost.`;

  const { data: eventRow, error: evErr } = await supabase
    .from("channel_reallocation_events")
    .insert({
      trigger_reason: trigger,
      unavailable_channels: unavailableList,
      reallocated_from: reallocFrom,
      reallocated_to: reallocTo,
      budget_before: budgetBefore,
      budget_after: budgetAfter,
      recommendations_obsoleted: obsoleted,
      recommendations_rescored: rescored,
      rationale,
      method: "health_weighted",
      dry_run: dryRun,
    })
    .select()
    .single();

  return new Response(
    JSON.stringify({
      ok: !evErr,
      dry_run: dryRun,
      event: eventRow,
      freed_budget: freedBudget,
      freed_share: freedShare,
      unavailable: unavailableList,
      obsoleted,
      rescored,
      rationale,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});