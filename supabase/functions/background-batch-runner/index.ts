// Background Batch Runner
// ---------------------------------------------------------------------------
// Generic "run in background" worker. POST starts a job that immediately
// returns (HTTP 202) while the actual work continues via EdgeRuntime.waitUntil.
// Progress is written to public.background_jobs and streamed to the UI via
// Supabase Realtime.
//
// Supported kinds:
//   - "content_director_batch"  -> calls pinterest-content-director N times
//                                  with an optional force_archetype
//   - "autopublish_batch"       -> calls cinematic-ad-autopublish N times
//                                  (each call publishes up to its inner budget)
//
// Body: { kind, count, params?, gap_ms? }
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

// EdgeRuntime is provided by Supabase Edge runtime
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Kind = "content_director_batch" | "autopublish_batch";

async function callInternal(fn: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, data };
}

async function runBatch(jobId: string, kind: Kind, count: number, params: Record<string, unknown>, gapMs: number) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  await admin.from("background_jobs").update({
    status: "running",
    started_at: new Date().toISOString(),
    total: count,
  }).eq("id", jobId);

  const results: Array<Record<string, unknown>> = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < count; i++) {
    // Honor cancel
    const { data: row } = await admin
      .from("background_jobs").select("cancel_requested").eq("id", jobId).maybeSingle();
    if (row?.cancel_requested) {
      await admin.from("background_jobs").update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        results,
      }).eq("id", jobId);
      return;
    }

    let result: { ok: boolean; status: number; data: unknown };
    try {
      if (kind === "content_director_batch") {
        result = await callInternal("pinterest-content-director", params);
      } else if (kind === "autopublish_batch") {
        result = await callInternal("cinematic-ad-autopublish", params);
      } else {
        result = { ok: false, status: 400, data: { error: `unknown kind ${kind}` } };
      }
    } catch (e) {
      result = { ok: false, status: 0, data: { error: (e as Error).message } };
    }

    if (result.ok) completed++; else failed++;
    results.push({ i, status: result.status, ok: result.ok, data: result.data });

    // Persist incremental progress so the UI can stream it
    await admin.from("background_jobs").update({
      completed, failed, results,
    }).eq("id", jobId);

    if (gapMs > 0 && i < count - 1) await new Promise((r) => setTimeout(r, gapMs));
  }

  await admin.from("background_jobs").update({
    status: "done",
    finished_at: new Date().toISOString(),
    completed, failed, results,
  }).eq("id", jobId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, message: "POST only" });

  const traceId = crypto.randomUUID();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: require admin
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { ok: false, traceId, message: "missing auth" });
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return json(401, { ok: false, traceId, message: "unauthenticated" });
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!roleRow) return json(403, { ok: false, traceId, message: "admin only" });

  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "") as Kind;
  const count = Math.min(50, Math.max(1, Number(body.count ?? 1)));
  const gapMs = Math.max(0, Number(body.gap_ms ?? 1500));
  const params = (body.params ?? {}) as Record<string, unknown>;

  if (!["content_director_batch", "autopublish_batch"].includes(kind)) {
    return json(400, { ok: false, traceId, message: `invalid kind: ${kind}` });
  }

  const { data: jobRow, error: insErr } = await admin
    .from("background_jobs")
    .insert({ kind, params, total: count, created_by: userId })
    .select("id")
    .single();
  if (insErr || !jobRow) return json(500, { ok: false, traceId, message: insErr?.message ?? "insert failed" });

  // Fire and forget — keep the function alive past the response
  EdgeRuntime.waitUntil(runBatch(jobRow.id, kind, count, params, gapMs));

  return json(202, { ok: true, traceId, message: "queued", job_id: jobRow.id });
});
