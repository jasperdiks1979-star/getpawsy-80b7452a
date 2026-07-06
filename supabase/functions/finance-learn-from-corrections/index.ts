import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Cron-friendly: promotes stable, unreverted corrections into
// finance_supplier_memory. Human corrections always override machine.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: corrections } = await admin.from("finance_corrections_log")
      .select("*")
      .eq("reverted", false)
      .eq("applied_to_memory", false)
      .order("created_at", { ascending: true })
      .limit(500);

    let promoted = 0;
    const bySupplier = new Map<string, any[]>();
    for (const c of corrections ?? []) {
      if (!c.supplier_id) continue;
      const list = bySupplier.get(c.supplier_id) ?? [];
      list.push(c);
      bySupplier.set(c.supplier_id, list);
    }

    for (const [supplierId, items] of bySupplier) {
      // Aggregate latest human values per field
      const rules: Record<string, unknown> = {};
      for (const c of items) rules[c.field] = { value: c.new_value, source: "human_correction", reason: c.reason, at: c.created_at };

      await admin.from("finance_supplier_memory").upsert({
        supplier_id: supplierId,
        rule_key: "human_overrides",
        rule_value: rules as any,
        confidence: 1.0,
        source: "corrections_log",
        updated_at: new Date().toISOString(),
      }, { onConflict: "supplier_id,rule_key" });

      // Mark corrections applied
      await admin.from("finance_corrections_log")
        .update({ applied_to_memory: true, applied_at: new Date().toISOString() })
        .in("id", items.map((i: any) => i.id));
      promoted += items.length;
    }

    return new Response(JSON.stringify({ ok: true, promoted, suppliers: bySupplier.size }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[finance-learn-from-corrections]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});