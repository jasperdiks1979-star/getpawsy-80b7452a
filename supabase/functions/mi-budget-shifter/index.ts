import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Phase 18 — Auto-budget shifter.
// Reallocates daily caps between Pinterest and TikTok based on marginal ROAS.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const totalCap = Number(body.total_cap ?? 14);
    const minPerChannel = Number(body.min_per_channel ?? 2);
    const windowDays = Number(body.window_days ?? 14);
    const dryRun = Boolean(body.dry_run ?? false);
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

    const { data: rev } = await sb
      .from("mi_arm_revenue")
      .select("channel,revenue,est_spend,conversions")
      .gte("computed_at", since);

    const agg: Record<string, { rev: number; spend: number; conv: number }> = {
      pinterest: { rev: 0, spend: 0, conv: 0 },
      tiktok: { rev: 0, spend: 0, conv: 0 },
    };
    for (const r of rev ?? []) {
      const k = (r as any).channel as string;
      if (!agg[k]) continue;
      agg[k].rev += Number((r as any).revenue ?? 0);
      agg[k].spend += Number((r as any).est_spend ?? 0);
      agg[k].conv += Number((r as any).conversions ?? 0);
    }
    const roas = (k: string) => (agg[k].spend > 0 ? agg[k].rev / agg[k].spend : 0);
    const pinR = roas("pinterest");
    const ttR = roas("tiktok");

    const wPin = Math.log(1 + Math.max(0, pinR)) + 0.1;
    const wTt = Math.log(1 + Math.max(0, ttR)) + 0.1;
    const pinShare = wPin / (wPin + wTt);

    let pinCap = Math.round(totalCap * pinShare);
    let ttCap = totalCap - pinCap;
    if (pinCap < minPerChannel) { pinCap = minPerChannel; ttCap = totalCap - pinCap; }
    if (ttCap < minPerChannel)  { ttCap = minPerChannel;  pinCap = totalCap - ttCap; }

    const verdict = {
      pinterest: { roas: Number(pinR.toFixed(3)), cap: pinCap, share: Number((pinCap / totalCap).toFixed(3)) },
      tiktok:    { roas: Number(ttR.toFixed(3)),  cap: ttCap,  share: Number((ttCap / totalCap).toFixed(3)) },
      total_cap: totalCap,
      window_days: windowDays,
      computed_at: new Date().toISOString(),
    };

    if (!dryRun) {
      await sb.from("mi_tuning_state").upsert({
        scope: "budget_split", key: "daily", value: verdict as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: "scope,key" });
    }

    return new Response(JSON.stringify({ ok: true, traceId, verdict, dry_run: dryRun }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
