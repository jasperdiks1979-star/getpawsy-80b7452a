// Restores a temporarily raised Pinterest campaign daily budget.
// Only mutates daily_spend_cap, only when the live value still equals the temporary value.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const AD_ACCOUNT_ID = "549770199501";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: unknown[] = [];

  try {
    const { data: jobs, error: jobErr } = await sb
      .from("pinterest_budget_restore_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("restore_at", new Date().toISOString());
    if (jobErr) throw jobErr;

    if (!jobs?.length) {
      return new Response(JSON.stringify({ ok: true, due: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conn } = await sb
      .from("pinterest_connection")
      .select("access_token")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const token = conn?.access_token ?? Deno.env.get("PINTEREST_ACCESS_TOKEN");
    if (!token) throw new Error("no_pinterest_token");

    for (const job of jobs) {
      const base = `https://api.pinterest.com/v5/ad_accounts/${AD_ACCOUNT_ID}/campaigns`;
      const readRes = await fetch(`${base}?campaign_ids=${job.campaign_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const readJson = await readRes.json();
      const campaign = readJson?.items?.[0];

      if (!campaign || campaign.id !== job.campaign_id) {
        await sb.from("pinterest_budget_restore_jobs")
          .update({ status: "failed", note: "campaign_not_found", executed_at: new Date().toISOString() })
          .eq("id", job.id);
        results.push({ job: job.id, action: "campaign_not_found" });
        continue;
      }

      const liveCap = Number(campaign.daily_spend_cap);
      if (liveCap !== Number(job.temp_budget_micro)) {
        await sb.from("pinterest_budget_restore_jobs")
          .update({
            status: "skipped",
            note: `externally_changed: live=${liveCap} expected=${job.temp_budget_micro}`,
            executed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        results.push({ job: job.id, action: "skipped_external_change", liveCap });
        continue;
      }

      const patchRes = await fetch(base, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([{ id: job.campaign_id, daily_spend_cap: Number(job.restore_budget_micro) }]),
      });
      const patchJson = await patchRes.json();
      const ok = patchRes.ok && patchJson?.items?.[0]?.data?.daily_spend_cap === Number(job.restore_budget_micro);

      await sb.from("pinterest_budget_restore_jobs")
        .update({
          status: ok ? "restored" : "failed",
          note: ok ? "restored_to_baseline" : JSON.stringify(patchJson).slice(0, 500),
          executed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      results.push({ job: job.id, action: ok ? "restored" : "failed" });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
