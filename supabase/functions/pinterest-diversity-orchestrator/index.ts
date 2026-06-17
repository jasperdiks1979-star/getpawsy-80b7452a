// Pinterest Diversity Orchestrator
// Picks the most under-served category, finds an eligible product not promoted
// in 30 days, and invokes pinterest-creative-director to generate drafts.
// Runs on a cron — see migration that schedules invoke-diversity-orchestrator.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function traceId() {
  return `dorch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = traceId();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const maxPicks = Math.max(1, Math.min(5, Number(body?.maxPicks ?? 2)));
  const briefsPerProduct = Math.max(1, Math.min(6, Number(body?.count ?? 3)));

  const picked: any[] = [];
  const errors: any[] = [];

  for (let i = 0; i < maxPicks; i++) {
    const { data: pickRows, error: pickErr } = await supabase
      .rpc("pinterest_diversity_pick_next");
    if (pickErr) { errors.push({ step: "pick", error: pickErr.message }); break; }
    const pick = (pickRows ?? [])[0];
    if (!pick) break;

    // Skip if we already picked this slug in this run
    if (picked.some((p) => p.product_slug === pick.product_slug)) continue;

    // Invoke creative director
    const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-creative-director`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "run_full",
        productSlug: pick.product_slug,
        count: briefsPerProduct,
      }),
    });
    const invokeJson = await invokeRes.json().catch(() => ({}));

    picked.push({
      product_slug: pick.product_slug,
      category_key: pick.category_key,
      reason: pick.reason,
      director_status: invokeRes.status,
      director_ok: invokeRes.ok,
      drafts: invokeJson?.drafts?.length ?? 0,
      message: invokeJson?.message ?? null,
    });

    if (invokeRes.status === 402) break; // credits exhausted, stop
  }

  return new Response(
    JSON.stringify({ ok: true, traceId: trace, picked, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});