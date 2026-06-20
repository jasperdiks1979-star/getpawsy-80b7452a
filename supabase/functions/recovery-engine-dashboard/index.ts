import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sbAdmin, jsonResponse, RECOVERY_CORS } from "../_shared/recovery-engine.ts";

// GET — admin-only dashboard data for ProductRecoveryEnginePanel.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: RECOVERY_CORS });
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonResponse({ ok: false, message: "Unauthorized" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse({ ok: false, message: "Forbidden" }, 403);

    const sb = sbAdmin();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();

    const [winners, candidates, swaps, runs, alerts] = await Promise.all([
      sb.from("winner_products")
        .select("product_id, score, niche, is_protected, recovery_mode, refreshed_at")
        .eq("is_protected", true).order("score", { ascending: false }).limit(50),
      sb.from("product_supplier_candidates")
        .select("id, product_id, supplier_product_id, title, match_score, global_qty, status, discovered_at")
        .order("discovered_at", { ascending: false }).limit(50),
      sb.from("product_supplier_swaps")
        .select("id, product_id, reason, executed_at, from_snapshot, to_snapshot")
        .gte("executed_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("executed_at", { ascending: false }).limit(50),
      sb.from("recovery_engine_runs").select("*").order("started_at", { ascending: false }).limit(10),
      sb.from("monitoring_alerts").select("id, severity, title, created_at")
        .eq("kind", "winner_product_lost").gte("created_at", dayAgo).limit(20),
    ]);

    const productIds = Array.from(new Set([
      ...(winners.data ?? []).map((w: any) => w.product_id),
      ...(candidates.data ?? []).map((c: any) => c.product_id),
      ...(swaps.data ?? []).map((s: any) => s.product_id),
    ]));
    const { data: products } = await sb.from("products")
      .select("id, name, slug, image_url, effective_stock, us_stock, eu_stock, cn_stock, is_active")
      .in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
    const byId = new Map((products ?? []).map((p: any) => [p.id, p]));

    const kpis = {
      protected: winners.data?.length ?? 0,
      inRecovery: (winners.data ?? []).filter((w: any) => (byId.get(w.product_id)?.effective_stock ?? 1) === 0).length,
      swaps24h: (swaps.data ?? []).filter((s: any) => new Date(s.executed_at).getTime() > Date.now() - 86400000).length,
      alertsOpen: alerts.data?.length ?? 0,
      candidatesPending: (candidates.data ?? []).filter((c: any) => c.status === "available" || c.status === "pending").length,
    };

    return jsonResponse({
      ok: true,
      kpis,
      winners: winners.data ?? [],
      candidates: candidates.data ?? [],
      swaps: swaps.data ?? [],
      runs: runs.data ?? [],
      alerts: alerts.data ?? [],
      products: Object.fromEntries(byId),
    });
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});