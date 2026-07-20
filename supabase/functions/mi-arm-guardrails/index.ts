import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// Phase 16 — Auto-pause underperforming hook arms + per-channel daily budget guardrails.
// Rules (overridable via body):
//  - min_trials: arm must have ≥N total trials before it can be paused (default 200)
//  - kill_ctr: arms with expected_ctr < this AND ≥min_trials → paused (default 0.005 = 0.5%)
//  - max_pinterest_per_day: cap queued+scheduled Pinterest pins per UTC day (default 8)
//  - max_tiktok_per_day:    cap queued+scheduled TikTok posts per UTC day (default 6)
//
// Effects (skipped when dry_run=true):
//  - For each losing arm: pinterest_pin_queue + tiktok_post_queue rows in (queued|draft) with that hook → status=paused, priority=low
//  - Persist arm verdicts under mi_tuning_state scope='arm_verdict'
//  - When daily caps exceeded: bump excess (queued|scheduled) items to status='paused' (priority preserved) until under cap, oldest-first kept

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dry_run;
    const minTrials = Number(body?.min_trials ?? 200);
    const killCtr = Number(body?.kill_ctr ?? 0.005);
    const maxPin = Number(body?.max_pinterest_per_day ?? 8);
    const maxTt = Number(body?.max_tiktok_per_day ?? 6);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Load bandit arms
    const { data: arms, error: armsErr } = await supabase
      .from("mi_tuning_state")
      .select("key, value, metadata")
      .eq("scope", "bandit_arm");
    if (armsErr) throw armsErr;

    const verdicts: any[] = [];
    let pinPaused = 0, ttPaused = 0;

    for (const a of arms ?? []) {
      const trials = Number(a.metadata?.trials ?? 0);
      const ctr = Number(a.value ?? 0);
      let verdict: "kill" | "watch" | "keep" = "keep";
      if (trials >= minTrials && ctr < killCtr) verdict = "kill";
      else if (trials >= Math.floor(minTrials / 2) && ctr < killCtr * 1.5) verdict = "watch";

      verdicts.push({ hook: a.key, trials, expected_ctr: ctr, verdict });

      if (verdict === "kill" && !dryRun) {
        const p = await supabase
          .from("pinterest_pin_queue")
          .update({ status: "paused", priority: "low" })
          .in("status", ["queued", "draft"])
          .eq("hook_group", a.key)
          .select("id", { count: "exact", head: true });
        pinPaused += p.count ?? 0;
        const t = await supabase
          .from("tiktok_post_queue")
          .update({ status: "paused", priority: "low" })
          .in("status", ["queued", "draft"])
          .eq("post_variant", a.key)
          .select("id", { count: "exact", head: true });
        ttPaused += t.count ?? 0;
      }
    }

    if (!dryRun && verdicts.length) {
      await supabase.from("mi_tuning_state").upsert(
        verdicts.map((v) => ({
          scope: "arm_verdict",
          key: v.hook,
          value: v.expected_ctr,
          metadata: { verdict: v.verdict, trials: v.trials },
        })),
        { onConflict: "scope,key" },
      );
    }

    // 2) Per-channel daily budget guardrails (UTC day window)
    const startUtc = new Date(); startUtc.setUTCHours(0, 0, 0, 0);
    const endUtc = new Date(startUtc); endUtc.setUTCDate(endUtc.getUTCDate() + 1);

    async function enforceCap(table: string, statuses: string[], cap: number) {
      const { data, error } = await supabase
        .from(table)
        .select("id, scheduled_at, created_at, priority")
        .in("status", statuses)
        .gte("scheduled_at", startUtc.toISOString())
        .lt("scheduled_at", endUtc.toISOString())
        .order("priority", { ascending: false })
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length <= cap) return { total: rows.length, paused: 0 };
      const overflow = rows.slice(cap).map((r: any) => r.id);
      if (!dryRun && overflow.length) {
        await supabase.from(table).update({ status: "paused" }).in("id", overflow);
      }
      return { total: rows.length, paused: overflow.length };
    }

    const pinCap = await enforceCap("pinterest_pin_queue", ["queued", "scheduled"], maxPin);
    const ttCap = await enforceCap("tiktok_post_queue", ["queued", "scheduled"], maxTt);

    return new Response(JSON.stringify({
      ok: true, traceId, dry_run: dryRun,
      verdicts,
      paused: { pinterest_arms: pinPaused, tiktok_arms: ttPaused },
      caps: {
        pinterest: { ...pinCap, max: maxPin },
        tiktok: { ...ttCap, max: maxTt },
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});