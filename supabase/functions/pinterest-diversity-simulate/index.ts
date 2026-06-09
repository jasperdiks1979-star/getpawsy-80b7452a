// Pinterest diversity readiness simulation.
// Pulls the next batch of approval-ready drafts and replays them through the
// DiversityGuard without touching the queue. Returns pass/fail counts plus the
// projected diversity snapshot if the batch were released.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DiversityGuard } from "../_shared/pinterest-diversity-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function traceId() { return `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = traceId();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 30)));
    const statuses: string[] = Array.isArray(body?.statuses) && body.statuses.length
      ? body.statuses
      : ["draft", "ready_for_review", "queued"];

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { data: drafts, error } = await sb
      .from("pinterest_pin_queue")
      .select("id, product_id, product_slug, pin_title, overlay_text, hook_group, category_key, status, created_at")
      .in("status", statuses)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;

    const guard = new DiversityGuard();
    await guard.load(sb);
    const before = guard.snapshot();

    const results: Array<{
      id: string;
      product_slug: string | null;
      category: string | null;
      headline: string;
      cta: string;
      pass: boolean;
      reasons: string[];
      replaced: Record<string, { from: string; to: string }>;
    }> = [];

    let pass = 0;
    let fail = 0;
    let replaced = 0;

    for (const d of drafts ?? []) {
      const overlay = String(d.overlay_text || "");
      const [headline, cta] = overlay.split(" • ");
      const category = d.category_key || "(uncategorised)";
      const evalRes = guard.evaluate(
        {
          headline: headline || d.pin_title || "",
          cta: cta || "",
          hook: d.hook_group || null,
          pin_queue_id: d.id,
          product_id: d.product_id,
        },
        category,
      );
      if (evalRes.ok) {
        pass += 1;
        if (Object.keys(evalRes.replacedFromPool).length) replaced += 1;
        guard.register(evalRes.final, category);
      } else {
        fail += 1;
      }
      results.push({
        id: d.id,
        product_slug: d.product_slug ?? null,
        category,
        headline: evalRes.final.headline,
        cta: evalRes.final.cta,
        pass: evalRes.ok,
        reasons: evalRes.reasons,
        replaced: evalRes.replacedFromPool as Record<string, { from: string; to: string }>,
      });
    }

    const after = guard.snapshot();

    return new Response(JSON.stringify({
      ok: true,
      traceId: trace,
      generated_at: new Date().toISOString(),
      publishing_status: "paused",
      caps: guard.caps,
      input: { requested: limit, considered: drafts?.length ?? 0, statuses },
      summary: {
        pass,
        fail,
        replaced_from_pool: replaced,
        projected_global_diversity: after.scores.global,
        delta_global_diversity: after.scores.global - before.scores.global,
      },
      before: { global: before.scores.global, top_repeated: before.top_repeated_90 },
      after: { global: after.scores.global, top_repeated: after.top_repeated_90 },
      results,
      message: "Simulation only — no pins were created, modified or published.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});