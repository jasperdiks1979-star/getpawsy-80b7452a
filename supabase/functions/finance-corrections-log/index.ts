import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Record or list finance corrections. Every write is append-only + reversible.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: access } = await admin.rpc("has_finance_access", { _user_id: user.id });
    if (!access) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "record";

    if (action === "list") {
      const { data } = await admin.from("finance_corrections_log")
        .select("*").order("created_at", { ascending: false }).limit(body.limit ?? 100);
      return new Response(JSON.stringify({ ok: true, corrections: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "revert") {
      const id: string = body.id;
      if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await admin.from("finance_corrections_log").update({ reverted: true, reverted_at: new Date().toISOString() }).eq("id", id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // record
    const insert = {
      entity_type: body.entity_type,
      entity_id: body.entity_id ?? null,
      supplier_id: body.supplier_id ?? null,
      document_id: body.document_id ?? null,
      field: body.field,
      old_value: body.old_value ?? null,
      new_value: body.new_value ?? null,
      reason: body.reason ?? null,
      confidence_before: body.confidence_before ?? null,
      confidence_after: body.confidence_after ?? null,
      corrected_by: user.id,
    };
    if (!insert.entity_type || !insert.field) {
      return new Response(JSON.stringify({ error: "entity_type and field are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data, error } = await admin.from("finance_corrections_log").insert(insert).select().single();
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, correction: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[finance-corrections-log]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});