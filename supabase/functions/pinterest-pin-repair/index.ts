/**
 * pinterest-pin-repair — admin-only. Reads the latest pinterest_pin_audit
 * rows and writes back to pinterest_pin_queue:
 *   - final_resolved_url, http_status, validation_status, repair_strategy,
 *     repaired_at, product_slug_found, last_validated_at
 * No Pinterest API edits; live clicks are repaired via the redirect engine.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleCheck } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleCheck) return new Response(JSON.stringify({ ok: false, traceId, message: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: any = {}; try { body = await req.json(); } catch {}
  const runId: string | undefined = body.run_id;

  // Get latest run if not provided
  let useRunId = runId;
  if (!useRunId) {
    const { data: latest } = await sb.from("pinterest_pin_audit_runs")
      .select("id").order("started_at", { ascending: false }).limit(1).maybeSingle();
    useRunId = latest?.id;
  }
  if (!useRunId) {
    return new Response(JSON.stringify({ ok: false, traceId, message: "no_audit_run" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let repaired = 0, marked_replacement = 0, page = 0;
  const pageSize = 200;
  while (true) {
    const { data: rows } = await sb
      .from("pinterest_pin_audit")
      .select("pin_queue_id, final_resolved_url, http_status, repair_strategy, resolver_step")
      .eq("run_id", useRunId)
      .not("pin_queue_id", "is", null)
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      const isValid = r.http_status === 200 && r.final_resolved_url;
      const update: Record<string, any> = {
        final_resolved_url: r.final_resolved_url,
        http_status: r.http_status,
        repair_strategy: r.repair_strategy,
        validation_status: isValid ? "valid" : "invalid",
        product_slug_found: !!r.final_resolved_url,
        last_validated_at: new Date().toISOString(),
      };
      if (isValid && r.repair_strategy !== "valid") {
        update.repaired_at = new Date().toISOString();
        repaired++;
      } else if (!isValid) {
        marked_replacement++;
      }
      await sb.from("pinterest_pin_queue").update(update).eq("id", r.pin_queue_id);
    }
    if (rows.length < pageSize) break;
    page++;
  }

  return new Response(JSON.stringify({ ok: true, traceId, run_id: useRunId, repaired, marked_replacement }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});