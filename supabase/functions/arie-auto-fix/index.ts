import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_CATEGORIES = new Set([
  "metadata.title","metadata.description","metadata.canonical","metadata.og",
  "metadata.pinterest_rich_pin","jsonld.product",
  "utm.repair","tracking.event_dedup","image.fallback_alt",
]);

const FORBIDDEN_PREFIXES = ["payments.","pricing.","inventory.","checkout.","auth.","schema."];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const incidentId: string | null = body?.incident_id ?? null;
  const category: string = String(body?.category ?? "");
  const before: any = body?.before ?? {};
  const after: any = body?.after ?? {};
  const confidence: number = Number(body?.confidence ?? 0);

  if (FORBIDDEN_PREFIXES.some((p) => category.startsWith(p))) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden_category" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return new Response(JSON.stringify({ ok: false, error: "category_not_allowed" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: settings } = await supabase
    .from("arie_settings").select("feature_flags,confidence_threshold")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const flagOn = !!settings?.feature_flags?.auto_repair?.[category];
  const threshold = Number(settings?.confidence_threshold ?? 0.95);

  if (!flagOn || confidence < threshold) {
    return new Response(JSON.stringify({ ok: false, error: "gated", flagOn, threshold }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rollbackToken = crypto.randomUUID();
  const { data: repair, error } = await supabase
    .from("arie_repairs")
    .insert({
      incident_id: incidentId,
      category,
      before_state: before,
      after_state: after,
      applied_by: "arie-auto-fix",
      confidence,
      rollback_available: true,
      rollback_token: rollbackToken,
      status: "applied",
    })
    .select().single();
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (incidentId) {
    await supabase.from("arie_incidents")
      .update({ auto_repair_status: "applied", rollback_token: rollbackToken, resolved_at: new Date().toISOString() })
      .eq("id", incidentId);
  }

  return new Response(JSON.stringify({ ok: true, repair }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});