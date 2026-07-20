/**
 * pinterest-url-audit — admin-only. Walks pinterest_pin_queue (all statuses,
 * paginated) and records a per-pin audit row in pinterest_pin_audit plus a
 * summary row in pinterest_pin_audit_runs. No mutations to pinterest_pin_queue.
 *
 * Body: { batch_size?: number, max_pages?: number, status_in?: string[] }
 * Returns: { ok, traceId, run_id, summary }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveDestination } from "../_shared/pinterest-url-resolver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function tid() { return crypto.randomUUID().slice(0, 8); }

async function liveStatus(url: string): Promise<number> {
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "GetPawsyPinAudit/1.0" },
    });
    await r.text(); // drain
    return r.status;
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();

  let body: any = {};
  try { body = await req.json(); } catch {}
  const batchSize = Math.min(Number(body.batch_size) || 100, 200);
  const maxPages = Math.min(Number(body.max_pages) || 20, 50);
  const statusIn: string[] = Array.isArray(body.status_in) && body.status_in.length
    ? body.status_in
    : ["posted", "queued", "failed", "rejected", "skipped", "draft", "publishing"];

  // Admin check
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: roleCheck } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleCheck) return new Response(JSON.stringify({ ok: false, traceId, message: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: run } = await sb
    .from("pinterest_pin_audit_runs")
    .insert({ triggered_by: user.id })
    .select("id")
    .single();
  const runId = run!.id;

  const buckets: Record<string, number> = {
    valid_pins: 0,
    broken_pins: 0,
    missing_products: 0,
    oos_products: 0,
    inactive_products: 0,
    recoverable_via_redirect: 0,
    recoverable_via_slug_history: 0,
    recoverable_via_alias: 0,
    recoverable_via_similar: 0,
    recoverable_via_category: 0,
    requires_replacement: 0,
  };

  let processed = 0;
  for (let page = 0; page < maxPages; page++) {
    const from = page * batchSize;
    const to = from + batchSize - 1;
    const { data: pins, error } = await sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, destination_link, product_id, product_slug, status")
      .in("status", statusIn)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error || !pins || pins.length === 0) break;

    const auditRows: any[] = [];
    for (const pin of pins) {
      const dest = pin.destination_link || "";
      const result = await resolveDestination(sb, dest);
      const targetForHttp = result.target || dest;
      const status = await liveStatus(targetForHttp);

      let strategy = "needs_replacement";
      if (result.ok && status === 200) {
        if (result.step === "exact_slug") strategy = "valid";
        else if (result.step === "slug_history") { strategy = "recoverable_via_slug_history"; buckets.recoverable_via_slug_history++; }
        else if (result.step === "alias") { strategy = "recoverable_via_alias"; buckets.recoverable_via_alias++; }
        else if (result.step === "similar") { strategy = "recoverable_via_similar"; buckets.recoverable_via_similar++; }
        else if (result.step === "category") { strategy = "recoverable_via_category"; buckets.recoverable_via_category++; }
        else { strategy = "recoverable_via_redirect"; buckets.recoverable_via_redirect++; }
        if (result.step !== "exact_slug") buckets.recoverable_via_redirect++;
        buckets.valid_pins++;
      } else {
        buckets.broken_pins++;
        if (result.step === "not_found") buckets.missing_products++;
        buckets.requires_replacement++;
      }

      auditRows.push({
        run_id: runId,
        pin_queue_id: pin.id,
        pinterest_pin_id: pin.pinterest_pin_id,
        destination_url: dest,
        final_resolved_url: result.target,
        http_status: status,
        resolver_step: result.step,
        product_exists: !!result.product_id,
        product_active: !!result.product_id && result.step !== "not_found",
        product_in_stock: !!result.product_id && status === 200,
        category: result.category,
        repair_strategy: strategy,
        notes: result.reason,
      });
      processed++;
    }
    if (auditRows.length) await sb.from("pinterest_pin_audit").insert(auditRows);
    if (pins.length < batchSize) break;
  }

  await sb.from("pinterest_pin_audit_runs").update({
    finished_at: new Date().toISOString(),
    pins_total: processed,
    pins_valid: buckets.valid_pins,
    pins_broken: buckets.broken_pins,
    summary: buckets,
  }).eq("id", runId);

  return new Response(JSON.stringify({ ok: true, traceId, run_id: runId, processed, summary: buckets }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});