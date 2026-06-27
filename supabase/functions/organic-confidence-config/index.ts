// Organic Confidence Config — single source of truth for the configurable,
// versioned, self-learning Organic Confidence scoring engine.
//
// Actions (POST { action, ... }):
//   list        → all models (active + drafts + archived)
//   active      → currently active model
//   create_draft{ name, description, reason, weights, negative_weights, thresholds, market_demand_boost, parent_version }
//   update_draft{ id, ...fields }            (only when status='draft')
//   activate   { id, reason }                (archives current active)
//   rollback   { to_version, reason }        (activate a prior version)
//   simulate   { model: {...}, days }        (recomputes scores using overrides — does NOT persist)
//   accuracy   { model_version?, days? }     (predicted vs actual delta)
//   change_log { model_id?, limit? }
//   suggest                                  (read-only weight-tweak suggestions from accuracy stats)
//
// READ uses the caller JWT; write actions require admin role. All weight
// changes are written to organic_confidence_change_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function authorize(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  const { data: role } = await sb.from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (!role) return null;
  return { sb, user };
}

function sanitiseWeights(w: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!w || typeof w !== "object") return out;
  for (const [k, v] of Object.entries(w)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[String(k)] = n;
  }
  return out;
}

async function logChange(sb: any, modelId: string, version: number | null, action: string, reason: string | null, changes: any, actorId: string) {
  await sb.from("organic_confidence_change_log").insert({
    model_id: modelId, model_version: version, action, reason, changes, actor_id: actorId,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = await authorize(req);
    if (!auth) return json({ error: "unauthorized" }, 401);
    const { sb, user } = auth;

    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* ignore */ } }
    const action = String(body.action ?? "active");

    if (action === "list") {
      const { data, error } = await sb.from("organic_confidence_models")
        .select("*").order("version", { ascending: false });
      if (error) throw error;
      return json({ ok: true, models: data ?? [] });
    }

    if (action === "active") {
      const { data } = await sb.rpc("get_active_organic_confidence_model");
      const row = Array.isArray(data) ? data[0] : data;
      return json({ ok: true, model: row ?? null });
    }

    if (action === "change_log") {
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 100)));
      let q = sb.from("organic_confidence_change_log").select("*")
        .order("created_at", { ascending: false }).limit(limit);
      if (body.model_id) q = q.eq("model_id", body.model_id);
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, entries: data ?? [] });
    }

    if (action === "create_draft") {
      // Allocate next version
      const { data: maxRow } = await sb.from("organic_confidence_models")
        .select("version").order("version", { ascending: false }).limit(1).maybeSingle();
      const nextVersion = Number(maxRow?.version ?? 0) + 1;
      const insert = {
        version: nextVersion,
        name: String(body.name ?? `Draft v${nextVersion}`),
        description: body.description ?? null,
        reason: body.reason ?? null,
        status: "draft",
        weights: sanitiseWeights(body.weights),
        negative_weights: sanitiseWeights(body.negative_weights),
        thresholds: body.thresholds ?? {},
        market_demand_boost: Number(body.market_demand_boost ?? 5),
        parent_version: body.parent_version ?? null,
        created_by: user.id,
      };
      const { data, error } = await sb.from("organic_confidence_models").insert(insert).select("*").single();
      if (error) throw error;
      await logChange(sb, data.id, data.version, "create_draft", body.reason ?? null, { weights: data.weights, thresholds: data.thresholds }, user.id);
      return json({ ok: true, model: data });
    }

    if (action === "update_draft") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "id required" }, 400);
      const { data: existing, error: e1 } = await sb.from("organic_confidence_models").select("*").eq("id", id).maybeSingle();
      if (e1) throw e1;
      if (!existing) return json({ error: "not found" }, 404);
      if (existing.status !== "draft") return json({ error: "only drafts are editable" }, 400);
      const patch: any = {};
      if (body.name) patch.name = String(body.name);
      if (body.description !== undefined) patch.description = body.description;
      if (body.reason !== undefined) patch.reason = body.reason;
      if (body.weights) patch.weights = sanitiseWeights(body.weights);
      if (body.negative_weights) patch.negative_weights = sanitiseWeights(body.negative_weights);
      if (body.thresholds) patch.thresholds = body.thresholds;
      if (typeof body.market_demand_boost === "number") patch.market_demand_boost = body.market_demand_boost;
      const { data, error } = await sb.from("organic_confidence_models").update(patch).eq("id", id).select("*").single();
      if (error) throw error;
      await logChange(sb, data.id, data.version, "update_draft", body.reason ?? null, patch, user.id);
      return json({ ok: true, model: data });
    }

    if (action === "activate" || action === "rollback") {
      let targetId: string | null = body.id ?? null;
      if (!targetId && body.to_version != null) {
        const { data: t } = await sb.from("organic_confidence_models")
          .select("id").eq("version", Number(body.to_version)).maybeSingle();
        targetId = t?.id ?? null;
      }
      if (!targetId) return json({ error: "id or to_version required" }, 400);
      // Archive currently active
      const { data: current } = await sb.rpc("get_active_organic_confidence_model");
      const currentRow = Array.isArray(current) ? current[0] : current;
      if (currentRow && currentRow.id !== targetId) {
        await sb.from("organic_confidence_models")
          .update({ status: "archived", archived_at: new Date().toISOString() })
          .eq("id", currentRow.id);
        await logChange(sb, currentRow.id, currentRow.version, "archive", body.reason ?? null, null, user.id);
      }
      const { data: activated, error } = await sb.from("organic_confidence_models")
        .update({ status: "active", activated_at: new Date().toISOString(), archived_at: null })
        .eq("id", targetId).select("*").single();
      if (error) throw error;
      await logChange(sb, activated.id, activated.version, action, body.reason ?? null, { weights: activated.weights }, user.id);
      return json({ ok: true, model: activated });
    }

    if (action === "simulate") {
      // Recompute scores using override weights without persisting predictions.
      const days = Math.min(90, Math.max(1, Number(body.days ?? 30)));
      const r = await sb.functions.invoke("organic-confidence", {
        body: { days, override_model: body.model ?? {} },
        headers: { Authorization: `Bearer ${SERVICE_ROLE}` },
      });
      // For client cases where invoke shape differs, fall back to fetch.
      if (r?.data) return json({ ok: true, simulation: r.data });
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/organic-confidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ days, override_model: body.model ?? {} }),
      });
      const sim = await resp.json();
      return json({ ok: true, simulation: sim });
    }

    if (action === "accuracy") {
      const days = Math.min(180, Math.max(1, Number(body.days ?? 30)));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      let q = sb.from("organic_confidence_predictions")
        .select("model_version,predicted_score,actual_score,error_abs,entity_type")
        .gte("predicted_at", since)
        .not("actual_score", "is", null);
      if (body.model_version != null) q = q.eq("model_version", Number(body.model_version));
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      const rows = data ?? [];
      const n = rows.length;
      let mae = 0, bias = 0;
      const byType: Record<string, { n: number; mae: number }> = {};
      for (const r of rows) {
        const err = Math.abs(Number(r.error_abs ?? Math.abs(Number(r.predicted_score) - Number(r.actual_score))));
        mae += err;
        bias += Number(r.predicted_score) - Number(r.actual_score);
        const t = String(r.entity_type ?? "global");
        if (!byType[t]) byType[t] = { n: 0, mae: 0 };
        byType[t].n += 1; byType[t].mae += err;
      }
      return json({
        ok: true,
        accuracy: {
          samples: n,
          mean_absolute_error: n > 0 ? mae / n : null,
          bias: n > 0 ? bias / n : null,
          by_entity: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { samples: v.n, mae: v.n ? v.mae / v.n : null }])),
          window_days: days,
        },
      });
    }

    if (action === "suggest") {
      // Naive heuristic: if positive bias (predicted > actual) the score is
      // overestimating, suggest trimming the largest weight by 5%. If negative
      // bias, suggest boosting `organic_conversion` by 5%. Operator decides.
      const days = 30;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data } = await sb.from("organic_confidence_predictions")
        .select("predicted_score,actual_score").gte("predicted_at", since)
        .not("actual_score", "is", null).limit(2000);
      const rows = data ?? [];
      const n = rows.length;
      const bias = n > 0 ? rows.reduce((a: number, r: any) => a + Number(r.predicted_score) - Number(r.actual_score), 0) / n : 0;
      const { data: activeWrap } = await sb.rpc("get_active_organic_confidence_model");
      const active = Array.isArray(activeWrap) ? activeWrap[0] : activeWrap;
      const weights = (active?.weights ?? {}) as Record<string, number>;
      const suggestions: Array<{ key: string; from: number; to: number; reason: string }> = [];
      if (n >= 20 && bias > 5) {
        const top = Object.entries(weights).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
        if (top) suggestions.push({ key: top[0], from: Number(top[1]), to: Math.max(0, Number(top[1]) * 0.95), reason: "Predictions are overestimating actuals (+bias)." });
      } else if (n >= 20 && bias < -5) {
        const v = Number(weights["organic_conversion"] ?? 0.25);
        suggestions.push({ key: "organic_conversion", from: v, to: Math.min(1, v * 1.05), reason: "Predictions are underestimating actuals (-bias)." });
      }
      return json({ ok: true, samples: n, bias, suggestions, never_auto_applied: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});