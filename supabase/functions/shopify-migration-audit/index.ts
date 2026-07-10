// Shopify Migration — Read-Only Audit Endpoint
// Wave 1 scaffolding. Performs NO Shopify API calls. Verifies the local
// framework: wave roster completeness, mapping-rule coverage per entity,
// unresolved conflicts, and orphan id_map rows. Returns a JSON health
// report the admin dashboard can render.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface AuditReport {
  ok: boolean;
  generated_at: string;
  waves: { total: number; completed: number; in_progress: number; blocked: number };
  mapping: { total_rules: number; entities_covered: string[]; required_missing: string[] };
  id_map: { total: number; by_status: Record<string, number> };
  conflicts: { unresolved: number; blockers: number };
  framework_ready: boolean;
  next_action: string;
}

const REQUIRED_ENTITIES = [
  "products",
  "collections",
  "guides",
  "blog_posts",
  "static_pages",
];
// NOTE: `product_variants` is intentionally excluded from Wave-1 required entities.
// Variants live inside `products.variants` (jsonb) — there is no source table.
// Wave 2 must certify jsonb→Shopify option1/2/3 mapping before product creation.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const [wavesRes, mapRes, idMapRes, conflictRes] = await Promise.all([
      sb.from("shopify_migration_waves").select("wave,status"),
      sb.from("shopify_field_mapping").select("source_entity,required"),
      sb.from("shopify_id_map").select("status"),
      sb.from("shopify_migration_conflicts").select("severity,resolved_at"),
    ]);

    const waves = wavesRes.data ?? [];
    const map = mapRes.data ?? [];
    const idMap = idMapRes.data ?? [];
    const conflicts = conflictRes.data ?? [];

    const entitiesCovered = [...new Set(map.map((r) => r.source_entity))];
    const requiredMissing = REQUIRED_ENTITIES.filter((e) => !entitiesCovered.includes(e));

    const byStatus: Record<string, number> = {};
    idMap.forEach((r) => { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; });

    const unresolved = conflicts.filter((c) => !c.resolved_at);
    const blockers = unresolved.filter((c) => c.severity === "blocker");

    const frameworkReady = waves.length >= 14 && requiredMissing.length === 0 && blockers.length === 0;

    const report: AuditReport = {
      ok: true,
      generated_at: new Date().toISOString(),
      waves: {
        total: waves.length,
        completed: waves.filter((w) => w.status === "completed").length,
        in_progress: waves.filter((w) => w.status === "in_progress").length,
        blocked: waves.filter((w) => w.status === "blocked").length,
      },
      mapping: {
        total_rules: map.length,
        entities_covered: entitiesCovered,
        required_missing: requiredMissing,
      },
      id_map: { total: idMap.length, by_status: byStatus },
      conflicts: { unresolved: unresolved.length, blockers: blockers.length },
      framework_ready: frameworkReady,
      next_action: frameworkReady
        ? "Awaiting owner approval to add Shopify secrets (SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN, SHOPIFY_API_VERSION) and begin Wave 2 dry-run."
        : `Blocked: missing entities=[${requiredMissing.join(",")}], blockers=${blockers.length}`,
    };

    // Log the audit run
    await sb.from("shopify_migration_audit_log").insert({
      wave: "W1",
      action: "verify",
      actor: "shopify-migration-audit",
      dry_run: true,
      response_payload: report,
      http_status: 200,
      ok: true,
    });

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
