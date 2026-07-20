// Genesis V2 — Product Relevance Engine (PRE) edge function.
// Manual + dry-run entrypoint. The same engine runs automatically inside
// `pinterest-integrity-guard` before every pin insert + publish.
//
// POST { action: "evaluate", input: PreInput }            → run a single eval
// POST { action: "evaluate_pin_queue", id: string }       → evaluate an existing queued pin
// POST { action: "recent", limit?: number }               → list recent evaluations
// POST { action: "stats" }                                → dashboard summary

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  evaluateProductRelevance,
  type PreInput,
} from "../_shared/pre-product-relevance.ts";
import { attachActualPre } from "../_shared/golden-dna-compiler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return null;
  const { data: r } = await sb.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  return r === true ? u.user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const admin = await requireAdmin(req);
  if (!admin) return json({ ok: false, error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "stats";
  const sb = svc();

  try {
    if (action === "evaluate") {
      const input = body.input as PreInput;
      if (!input?.product_id || !input?.pin_image_url) {
        return json({ ok: false, error: "missing_input" }, 400);
      }
      const verdict = await evaluateProductRelevance(sb, input);
      const traceId = typeof body.trace_id === "string" ? body.trace_id : null;
      if (traceId) {
        await attachActualPre(sb, traceId, {
          actual_pre: Number((verdict as any)?.overall_score ?? 0),
          passed: Boolean((verdict as any)?.passed),
          actual_blocker: ((verdict as any)?.blocking_reasons?.[0] ?? null),
        }).catch(() => {});
      }
      return json({ ok: true, verdict });
    }

    if (action === "evaluate_pin_queue") {
      const id = String(body.id ?? "");
      const { data: pin } = await sb
        .from("pinterest_pin_queue")
        .select("id, product_id, product_slug, pin_title, pin_description, image_url, destination_link, category_key")
        .eq("id", id)
        .maybeSingle();
      if (!pin) return json({ ok: false, error: "pin_not_found" }, 404);
      const { data: prod } = await sb
        .from("products")
        .select("name, description, image_url, primary_species, category")
        .eq("id", pin.product_id)
        .maybeSingle();
      const verdict = await evaluateProductRelevance(sb, {
        product_id: pin.product_id,
        product_slug: pin.product_slug,
        product_name: prod?.name ?? pin.product_slug,
        product_description: prod?.description ?? null,
        product_image_url: prod?.image_url ?? null,
        product_primary_species: prod?.primary_species ?? null,
        product_category: pin.category_key ?? prod?.category ?? null,
        pin_title: pin.pin_title ?? "",
        pin_description: pin.pin_description ?? "",
        pin_image_url: pin.image_url,
        destination_link: pin.destination_link ?? "",
        pin_queue_id: pin.id,
      });
      const traceId2 = typeof body.trace_id === "string"
        ? body.trace_id
        : `pcf_${pin.id}`;
      await attachActualPre(sb, traceId2, {
        actual_pre: Number((verdict as any)?.overall_score ?? 0),
        passed: Boolean((verdict as any)?.passed),
        actual_blocker: ((verdict as any)?.blocking_reasons?.[0] ?? null),
      }).catch(() => {});
      return json({ ok: true, verdict });
    }

    if (action === "recent") {
      const limit = Math.min(200, Number(body.limit ?? 25));
      const { data } = await sb
        .from("pre_evaluations")
        .select("id, product_slug, pin_title, pin_image_url, overall_score, passed, blocking_reasons, detected_species, detected_use_case, product_visibility_score, click_intent_score, product_occupancy_pct, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      return json({ ok: true, evaluations: data ?? [] });
    }

    if (action === "stats") {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data } = await sb
        .from("pre_evaluations")
        .select("passed, overall_score, blocking_reasons")
        .gte("created_at", since);
      const rows = data ?? [];
      const total = rows.length;
      const passed = rows.filter((r: any) => r.passed).length;
      const avg = total ? Math.round(rows.reduce((s: number, r: any) => s + (r.overall_score ?? 0), 0) / total) : 0;
      const reasons: Record<string, number> = {};
      for (const r of rows as any[]) {
        for (const x of (r.blocking_reasons ?? [])) reasons[x] = (reasons[x] ?? 0) + 1;
      }
      const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return json({ ok: true, stats: { total, passed, rejected: total - passed, pass_rate: total ? passed / total : 0, avg_score: avg, top_reasons: top } });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});