import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Auto-create experiments from recent Pinterest pin batches.
// Groups queued/posted pins from the last `lookback_days` by (product_id, hook_group).
// Each group with >=2 variants AND not already covered by an experiment becomes a new mi_experiments row.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const lookbackDays = Number(body.lookback_days ?? 14);
    const minVariants = Number(body.min_variants ?? 2);
    const cutoff = new Date(Date.now() - lookbackDays * 86400_000).toISOString();

    const { data: pins, error: pinsErr } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_id, hook_group, pin_title, status, created_at, pinterest_pin_id")
      .gte("created_at", cutoff)
      .not("product_id", "is", null)
      .not("hook_group", "is", null)
      .in("status", ["queued", "scheduled", "published", "posted", "draft"]);
    if (pinsErr) throw pinsErr;

    // Find pin_queue_ids already in an experiment
    const { data: existing } = await sb
      .from("mi_experiment_variants")
      .select("pin_queue_id");
    const covered = new Set((existing ?? []).map((r: any) => r.pin_queue_id).filter(Boolean));

    const groups: Record<string, any[]> = {};
    for (const p of pins ?? []) {
      if (covered.has(p.id)) continue;
      const k = `${p.product_id}::${p.hook_group}`;
      (groups[k] ||= []).push(p);
    }

    const created: any[] = [];
    for (const [key, items] of Object.entries(groups)) {
      if (items.length < minVariants) continue;
      const [productId, hookFamily] = key.split("::");
      const expName = `auto · ${hookFamily} · ${productId.slice(0, 8)} · ${new Date().toISOString().slice(0,10)}`;

      if (dryRun) {
        created.push({ name: expName, hook_family: hookFamily, variants: items.length, dry_run: true });
        continue;
      }

      const { data: exp, error: expErr } = await sb
        .from("mi_experiments")
        .insert({
          name: expName,
          placement: "pinterest",
          hook_family: hookFamily,
          status: "running",
          metadata: { product_id: productId, source: "auto", batch_size: items.length },
        })
        .select("id, name")
        .single();
      if (expErr) { console.error(expErr); continue; }

      const variantRows = items.map((p: any, i: number) => ({
        experiment_id: exp.id,
        pin_queue_id: p.id,
        label: (p.pin_title || `variant ${i + 1}`).slice(0, 120),
        impressions: 0,
        clicks: 0,
        status: "active",
      }));
      const { error: varErr } = await sb.from("mi_experiment_variants").insert(variantRows);
      if (varErr) { console.error(varErr); continue; }

      created.push({ id: exp.id, name: exp.name, hook_family: hookFamily, variants: items.length });
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Created ${created.length} experiments`,
      groups_scanned: Object.keys(groups).length,
      experiments_created: created.length,
      dry_run: dryRun,
      created,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[mi-experiment-autocreate]", e);
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});