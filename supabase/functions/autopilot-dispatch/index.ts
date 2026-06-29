// Autopilot Dispatcher — Genesis V3.2
// Single entry point that resolves a brief recommendation into a concrete action
// against existing engines, logs everything to autopilot_actions, and lets the UI
// preview / execute / undo / list today's queue.
//
// NO new business logic lives here beyond ranking + credit gating.
// All heavy lifting is delegated to engines that already exist.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type ActionKind =
  | "pin.publish_today"
  | "pin.regenerate_creative"
  | "pin.rewrite_copy"
  | "product.promote"
  | "product.pause"
  | "product.rescore"
  | "pdp.optimize_plan";

interface ActionInput {
  kind: ActionKind;
  product_id?: string | null;
  payload?: Record<string, unknown>;
}

// v1 heuristic — honest, flat lift estimates. Tuned later from autopilot_outcomes_24h.
const PREDICTED_LIFT: Record<ActionKind, number> = {
  "pin.publish_today": 0.18,
  "pin.regenerate_creative": 0.12,
  "pin.rewrite_copy": 0.06,
  "product.promote": 0.20,
  "product.pause": 0.0,
  "product.rescore": 0.0,
  "pdp.optimize_plan": 0.0,
};

// AI credit cost estimates (whole credits).
const AI_CREDIT_COST: Record<ActionKind, number> = {
  "pin.publish_today": 3,
  "pin.regenerate_creative": 2,
  "pin.rewrite_copy": 1,
  "product.promote": 1,
  "product.pause": 0,
  "product.rescore": 1,
  "pdp.optimize_plan": 1,
};

// AI-credit gating: only CRITICAL and HIGH may spend credits.
const CREDIT_ALLOWED_PRIORITIES = new Set(["CRITICAL", "HIGH"]);

function priorityFromScores(opts: {
  overall_score: number;
  confidence_score: number;
  in_stock: boolean;
}): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const { overall_score, confidence_score, in_stock } = opts;
  if (overall_score >= 90 && confidence_score >= 90 && in_stock) return "CRITICAL";
  if (overall_score >= 80 && confidence_score >= 80) return "HIGH";
  if (overall_score >= 60) return "MEDIUM";
  return "LOW";
}

async function resolveAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return { ok: false, error: "missing_auth" as const, user_id: null };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return { ok: false, error: "invalid_user" as const, user_id: null };
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return { ok: false, error: "not_admin" as const, user_id: userData.user.id };
  return { ok: true as const, user_id: userData.user.id };
}

async function loadContext(svc: ReturnType<typeof createClient>, product_id: string) {
  const [{ data: pi }, { data: pin }, { data: prod }] = await Promise.all([
    svc.from("gv3_pi_scores")
      .select("overall_score, confidence_score, sessions, product_views, add_to_carts, purchases, revenue_cents, pinterest_score")
      .eq("product_id", product_id).maybeSingle(),
    svc.from("gv3_pin_growth_scores")
      .select("pinterest_growth_score, classification, predicted_opportunity, confidence")
      .eq("product_id", product_id).maybeSingle(),
    svc.from("products")
      .select("id, name, slug, in_stock, profit_margin")
      .eq("id", product_id).maybeSingle(),
  ]);
  return { pi, pin, prod };
}

async function buildPreview(svc: ReturnType<typeof createClient>, input: ActionInput) {
  const product_id = input.product_id ?? null;
  let priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
  let confidence = 0;
  let expected_revenue_eur = 0;
  let pi: any = null;
  let pin: any = null;
  let prod: any = null;

  if (product_id) {
    const ctx = await loadContext(svc, product_id);
    pi = ctx.pi; pin = ctx.pin; prod = ctx.prod;
    const overall = Number(pi?.overall_score ?? 0);
    const conf = Number(pi?.confidence_score ?? 0);
    const inStock = Boolean(prod?.in_stock);
    priority = priorityFromScores({ overall_score: overall, confidence_score: conf, in_stock: inStock });
    confidence = Math.max(conf, Number(pin?.confidence ?? 0) * 100) / 100;

    const aov = 35; // canonical AOV fallback (real value computed on UI side; safe default for backend ROI estimate)
    const sessions = Math.max(1, Number(pi?.sessions ?? 0));
    const cvr = Number(pi?.purchases ?? 0) / sessions;
    const baseCvr = Number.isFinite(cvr) && cvr > 0 ? cvr : 0.01;
    const lift = PREDICTED_LIFT[input.kind] ?? 0;
    const expectedSessions72h = Math.max(50, sessions); // bounded honest baseline
    expected_revenue_eur = aov * baseCvr * lift * expectedSessions72h;
  } else if (input.kind === "pin.publish_today") {
    // Batch / catalog-wide action — leave priority MEDIUM, requires explicit confirmation.
    priority = "MEDIUM";
  }

  const ai_credit_cost = AI_CREDIT_COST[input.kind] ?? 0;
  const expected_roi = ai_credit_cost > 0 ? expected_revenue_eur / ai_credit_cost : expected_revenue_eur;
  const credit_gated = ai_credit_cost > 0 && !CREDIT_ALLOWED_PRIORITIES.has(priority);

  // Resolve invocation target without executing.
  const target = resolveInvocation(input, { pi, pin, prod });

  return {
    kind: input.kind,
    product_id,
    priority,
    confidence,
    ai_credit_cost,
    expected_revenue_eur: Number(expected_revenue_eur.toFixed(2)),
    expected_roi: Number(expected_roi.toFixed(2)),
    credit_gated,
    invoked_function: target.fn,
    invocation_payload: target.payload,
    context: { product_name: prod?.name, slug: prod?.slug, in_stock: prod?.in_stock },
  };
}

function resolveInvocation(input: ActionInput, _ctx: { pi: any; pin: any; prod: any }): { fn: string | null; payload: Record<string, unknown> } {
  switch (input.kind) {
    case "pin.publish_today":
      return { fn: "pinterest-growth-run", payload: { trigger: "autopilot", limit: 10, ...input.payload } };
    case "pin.regenerate_creative":
      return { fn: "pinterest-creative-director", payload: { action: "run_full", product_id: input.product_id, force: true, ...input.payload } };
    case "pin.rewrite_copy":
      return { fn: "pcie-v2-creative-director", payload: { product_id: input.product_id, stages: ["headline", "cta"], ...input.payload } };
    case "product.promote":
      return { fn: "pinterest-revenue-brain", payload: { action: "auto_promote", product_id: input.product_id, ...input.payload } };
    case "product.pause":
      // No edge function — direct DB flip executed in performExecute.
      return { fn: "__db__:pause", payload: { product_id: input.product_id } };
    case "product.rescore":
      return { fn: "product-intelligence-run", payload: { product_id: input.product_id, single: true, ...input.payload } };
    case "pdp.optimize_plan":
      return { fn: "cro-audit", payload: { product_id: input.product_id, ...input.payload } };
    default:
      return { fn: null, payload: {} };
  }
}

async function performExecute(
  svc: ReturnType<typeof createClient>,
  preview: Awaited<ReturnType<typeof buildPreview>>,
  user_id: string,
) {
  if (preview.credit_gated) {
    return { ok: false as const, error: `credit_gated_by_priority:${preview.priority}` };
  }

  // Insert running row.
  const { data: row, error: insertErr } = await svc
    .from("autopilot_actions")
    .insert({
      kind: preview.kind,
      product_id: preview.product_id,
      priority: preview.priority,
      confidence: preview.confidence,
      ai_credit_cost: preview.ai_credit_cost,
      expected_revenue_eur: preview.expected_revenue_eur,
      expected_roi: preview.expected_roi,
      status: "running",
      invoked_function: preview.invoked_function,
      invocation_payload: preview.invocation_payload,
      created_by: user_id,
      executed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insertErr || !row) return { ok: false as const, error: insertErr?.message ?? "insert_failed" };

  try {
    let invocationResult: Record<string, unknown> = {};

    if (preview.invoked_function === "__db__:pause") {
      // Direct DB action — toggle publishing governor for this product.
      const productId = preview.product_id;
      if (!productId) throw new Error("missing_product_id");
      const { error: govErr } = await svc
        .from("pinterest_publish_governor")
        .upsert({ product_id: productId, paused: true, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
      if (govErr) throw govErr;
      invocationResult = { paused: true };
    } else if (preview.invoked_function) {
      const { data, error } = await svc.functions.invoke(preview.invoked_function, {
        body: preview.invocation_payload,
      });
      if (error) throw new Error(error.message ?? "invoke_failed");
      invocationResult = (data ?? {}) as Record<string, unknown>;
    } else {
      throw new Error("no_invoked_function");
    }

    await svc
      .from("autopilot_actions")
      .update({ status: "done", invocation_result: invocationResult })
      .eq("id", row.id);
    return { ok: true as const, action_id: row.id, result: invocationResult };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc
      .from("autopilot_actions")
      .update({ status: "failed", error_message: msg })
      .eq("id", row.id);
    return { ok: false as const, action_id: row.id, error: msg };
  }
}

async function performUndo(svc: ReturnType<typeof createClient>, action_id: string) {
  const { data: row, error: loadErr } = await svc
    .from("autopilot_actions")
    .select("*")
    .eq("id", action_id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false as const, error: loadErr?.message ?? "not_found" };
  if (row.status === "undone") return { ok: true as const, already: true };

  let undoResult: Record<string, unknown> = {};
  try {
    if (row.kind === "product.pause" && row.product_id) {
      const { error } = await svc
        .from("pinterest_publish_governor")
        .upsert({ product_id: row.product_id, paused: false, updated_at: new Date().toISOString() }, { onConflict: "product_id" });
      if (error) throw error;
      undoResult = { paused: false };
    } else if (row.kind === "pin.publish_today" && row.product_id) {
      // Remove still-queued drafts created by this run from the pin queue.
      const { error } = await svc
        .from("pinterest_pin_queue")
        .update({ status: "rejected" })
        .eq("product_id", row.product_id)
        .eq("status", "draft")
        .gte("created_at", row.executed_at ?? row.created_at);
      if (error) throw error;
      undoResult = { rejected_drafts: true };
    } else if (row.kind === "pin.regenerate_creative" && row.product_id) {
      const { error } = await svc
        .from("pinterest_pin_queue")
        .update({ status: "rejected" })
        .eq("product_id", row.product_id)
        .eq("status", "draft")
        .gte("created_at", row.executed_at ?? row.created_at);
      if (error) throw error;
      undoResult = { rejected_drafts: true };
    } else {
      undoResult = { note: "no_reverse_op_for_kind" };
    }

    await svc
      .from("autopilot_actions")
      .update({
        status: "undone",
        undone_at: new Date().toISOString(),
        invocation_result: { ...row.invocation_result, undo: undoResult },
      })
      .eq("id", action_id);
    return { ok: true as const, undo: undoResult };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: msg };
  }
}

async function buildTodayQueue(svc: ReturnType<typeof createClient>) {
  // Pull CRITICAL/HIGH candidates from existing engines.
  const { data: piTop } = await svc
    .from("gv3_pi_scores")
    .select("product_id, overall_score, confidence_score, sessions, purchases")
    .gte("overall_score", 80)
    .gte("confidence_score", 80)
    .order("overall_score", { ascending: false })
    .limit(20);

  const { data: pinTop } = await svc
    .from("gv3_pin_growth_scores")
    .select("product_id, pinterest_growth_score, predicted_opportunity, confidence, classification")
    .in("classification", ["Promote Immediately", "Needs New Creative", "Needs Better Images", "Needs Better Copy"])
    .order("predicted_opportunity", { ascending: false })
    .limit(20);

  const queue: Array<Record<string, unknown>> = [];
  for (const r of piTop ?? []) {
    const inStock = true; // optimistic — UI calls preview for the exact value
    const priority = priorityFromScores({ overall_score: Number(r.overall_score), confidence_score: Number(r.confidence_score), in_stock: inStock });
    if (!CREDIT_ALLOWED_PRIORITIES.has(priority)) continue;
    queue.push({
      kind: "product.promote",
      product_id: r.product_id,
      priority,
      reason: `PI score ${Math.round(Number(r.overall_score))} · conf ${Math.round(Number(r.confidence_score))}`,
      ai_credit_cost: AI_CREDIT_COST["product.promote"],
      expected_lift_pct: PREDICTED_LIFT["product.promote"] * 100,
    });
  }
  for (const r of pinTop ?? []) {
    const cls = String(r.classification);
    const kind: ActionKind = cls === "Promote Immediately" ? "pin.publish_today" : "pin.regenerate_creative";
    queue.push({
      kind,
      product_id: r.product_id,
      priority: Number(r.confidence ?? 0) >= 0.9 ? "HIGH" : "MEDIUM",
      reason: `${cls} · opp ${Math.round(Number(r.predicted_opportunity ?? 0))}`,
      ai_credit_cost: AI_CREDIT_COST[kind],
      expected_lift_pct: PREDICTED_LIFT[kind] * 100,
    });
  }
  // Dedup by (kind, product_id) and rank by simple ROI proxy = lift / credits.
  const seen = new Set<string>();
  const deduped = queue.filter((q) => {
    const k = `${q.kind}:${q.product_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a: any, b: any) => (Number(b.expected_lift_pct) / Math.max(1, Number(b.ai_credit_cost))) - (Number(a.expected_lift_pct) / Math.max(1, Number(a.ai_credit_cost))));
  return deduped.slice(0, 30);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const op = (url.searchParams.get("op") ?? "").toLowerCase();
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const admin = await resolveAdmin(req);
    if (!admin.ok) {
      return new Response(JSON.stringify({ error: admin.error }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (op === "preview") {
      const preview = await buildPreview(svc, body as ActionInput);
      return new Response(JSON.stringify(preview), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (op === "execute") {
      const preview = await buildPreview(svc, body as ActionInput);
      const result = await performExecute(svc, preview, admin.user_id!);
      return new Response(JSON.stringify({ preview, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (op === "undo") {
      const id = String((body as any).action_id ?? "");
      if (!id) {
        return new Response(JSON.stringify({ error: "missing_action_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await performUndo(svc, id);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (op === "today") {
      const queue = await buildTodayQueue(svc);
      return new Response(JSON.stringify({ queue }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_op", supported: ["preview","execute","undo","today"] }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});