// ─────────────────────────────────────────────────────────────────────────────
// pinterest-niche-coverage-snapshot
// ─────────────────────────────────────────────────────────────────────────────
// Computes the current Pinterest creative niche distribution across the active
// product catalog and upserts one row per niche into
// `pinterest_niche_coverage_snapshots` for today's UTC date.
//
// Designed to be triggered:
//   - On demand by the admin dashboard ("Snapshot now" button)
//   - Daily via pg_cron
//
// Standard JSON contract: { ok, traceId, message, ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { detectNiche, type NicheKey } from "../_shared/pinterest-style-dna.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newTraceId() {
  return `pncs_${crypto.randomUUID().slice(0, 8)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = newTraceId();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Allow either an admin user OR the cron service role (no user) to invoke.
    const authHeader = req.headers.get("Authorization") ?? "";
    const looksLikeServiceRole =
      authHeader.includes(SERVICE_ROLE) ||
      req.headers.get("x-cron-source") === "pg_cron";

    if (!looksLikeServiceRole) {
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return jsonResponse({ ok: false, traceId, message: "Unauthorized" }, 401);
      }
      const adminCheck = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: roleRow } = await adminCheck
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) {
        return jsonResponse({ ok: false, traceId, message: "Admin only" }, 403);
      }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Pull the active catalog. Cap at 5000 to stay well under any view limits.
    const { data: products, error: pErr } = await admin
      .from("products")
      .select("id, name, slug, category")
      .eq("is_active", true)
      .limit(5000);
    if (pErr) throw new Error(`products fetch: ${pErr.message}`);

    const tally = new Map<NicheKey, number>();
    for (const p of products ?? []) {
      const n = detectNiche({
        name: p.name as string | null,
        slug: p.slug as string | null,
        category: p.category as string | null,
      });
      tally.set(n, (tally.get(n) ?? 0) + 1);
    }
    const total = products?.length ?? 0;
    const today = new Date().toISOString().slice(0, 10);

    const rows = Array.from(tally.entries()).map(([niche, count]) => ({
      snapshot_date: today,
      niche,
      product_count: count,
      total_products: total,
      pct: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    }));

    if (rows.length > 0) {
      const { error: upErr } = await admin
        .from("pinterest_niche_coverage_snapshots")
        .upsert(rows, { onConflict: "snapshot_date,niche" });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
    }

    return jsonResponse({
      ok: true,
      traceId,
      message: `Snapshot stored for ${today}`,
      total,
      niches: rows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[pinterest-niche-coverage-snapshot]", traceId, message);
    return jsonResponse({ ok: false, traceId, message }, 500);
  }
});