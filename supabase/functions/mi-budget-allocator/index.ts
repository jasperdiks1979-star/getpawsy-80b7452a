import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Re-allocates pinterest_pin_queue priority based on hook-family multipliers
// from mi_tuning_state. Only touches items still in 'queued' or 'draft'.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun: boolean = !!body?.dry_run;

    // Load multipliers
    const { data: state } = await supabase
      .from("mi_tuning_state")
      .select("scope, key, value")
      .eq("scope", "hook_family");
    const mults: Record<string, number> = {};
    for (const s of state ?? []) mults[s.key.toLowerCase()] = Number(s.value);

    // Load pending queue items
    const { data: items } = await supabase
      .from("pinterest_pin_queue")
      .select("id, hook_group, priority, status")
      .in("status", ["queued", "draft"])
      .limit(500);

    const itemList = items ?? [];
    let highCount = 0, mediumCount = 0, lowCount = 0;
    const updates: { id: string; priority: string }[] = [];

    for (const it of itemList) {
      const fam = (it.hook_group || "unknown").toLowerCase();
      const m = mults[fam] ?? 1;
      let priority = "medium";
      if (m >= 1.15) { priority = "high"; highCount++; }
      else if (m <= 0.85) { priority = "low"; lowCount++; }
      else { mediumCount++; }
      if (priority !== it.priority) updates.push({ id: it.id, priority });
    }

    if (!dryRun && updates.length) {
      // Run sequentially, small dataset
      for (const u of updates) {
        await supabase.from("pinterest_pin_queue").update({ priority: u.priority }).eq("id", u.id);
      }
    }

    return new Response(JSON.stringify({
      ok: true, dry_run: dryRun, scanned: itemList.length, updated: updates.length,
      distribution: { high: highCount, medium: mediumCount, low: lowCount },
      multipliers: mults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
