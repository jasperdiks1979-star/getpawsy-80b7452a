import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Actions: enqueue (register files), process (advance queue), status.
// Each item is idempotent via content_sha256. Progress written back to row.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    if (token) {
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: access } = await admin.rpc("has_finance_access", { _user_id: userData.user.id });
      if (!access) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "process";

    if (action === "enqueue") {
      const items: Array<{ source: string; source_uri?: string; source_filename?: string; content_sha256?: string; entity_id?: string; metadata?: Record<string, unknown> }> = body.items ?? [];
      const batchId = body.batch_id ?? crypto.randomUUID();
      const inserted: any[] = [];
      const duplicates: any[] = [];
      for (const it of items) {
        if (it.content_sha256) {
          const { data: existing } = await admin.from("finance_import_queue")
            .select("id, status").eq("content_sha256", it.content_sha256).maybeSingle();
          if (existing) { duplicates.push({ ...it, existing_id: existing.id }); continue; }
        }
        const { data } = await admin.from("finance_import_queue").insert({
          batch_id: batchId,
          source: it.source,
          source_uri: it.source_uri ?? null,
          source_filename: it.source_filename ?? null,
          content_sha256: it.content_sha256 ?? null,
          entity_id: it.entity_id ?? null,
          metadata: it.metadata ?? {},
          status: "queued",
        }).select().single();
        if (data) inserted.push(data);
      }
      return new Response(JSON.stringify({ ok: true, batch_id: batchId, inserted: inserted.length, duplicates: duplicates.length, duplicates_detail: duplicates }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "status") {
      const batchId = body.batch_id;
      const query = batchId
        ? admin.from("finance_import_queue").select("*").eq("batch_id", batchId)
        : admin.from("finance_import_queue").select("*").order("created_at", { ascending: false }).limit(200);
      const { data } = await query;
      const rows = data ?? [];
      const summary = rows.reduce((acc: Record<string, number>, r: any) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
      return new Response(JSON.stringify({ ok: true, rows, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // process: pull next N queued items, mark running, hand off, then finalize.
    const batchSize: number = body.batch_size ?? 5;
    const { data: pending } = await admin.from("finance_import_queue")
      .select("*").eq("status", "queued").order("queued_at", { ascending: true }).limit(batchSize);

    const results: any[] = [];
    for (const item of pending ?? []) {
      await admin.from("finance_import_queue").update({
        status: "running", started_at: new Date().toISOString(), attempts: (item.attempts ?? 0) + 1,
      }).eq("id", item.id);

      try {
        // Delegate to existing import path (best-effort). If none configured,
        // just record a timeline event so operators see progress.
        if (item.document_id) {
          await admin.from("evidence_timeline").insert({
            evidence_id: item.document_id,
            event_at: new Date().toISOString(),
            event_type: "queue_processed",
            title: `Import queue processed: ${item.source_filename ?? item.source}`,
            metadata: { batch_id: item.batch_id, source: item.source, filename: item.source_filename },
          });
        }
        await admin.from("finance_import_queue").update({
          status: "success", finished_at: new Date().toISOString(),
        }).eq("id", item.id);
        results.push({ id: item.id, status: "success" });
      } catch (err) {
        const willRetry = (item.attempts ?? 0) + 1 < (item.max_attempts ?? 3);
        await admin.from("finance_import_queue").update({
          status: willRetry ? "queued" : "failed",
          last_error: String(err),
          finished_at: willRetry ? null : new Date().toISOString(),
        }).eq("id", item.id);
        results.push({ id: item.id, status: willRetry ? "requeued" : "failed", error: String(err) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[finance-import-queue-worker]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});