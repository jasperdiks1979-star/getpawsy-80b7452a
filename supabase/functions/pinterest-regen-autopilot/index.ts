// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Regen Autopilot
// ─────────────────────────────────────────────────────────────────────────────
// Processes open ai_priority_queue rows of kind `pinterest_creative_regen`.
// For each unique product slug:
//   1. Invokes pinterest-creative-director (action: run_full)
//   2. On success → marks queue rows `done` ONLY when a board-matching
//      pinterest_pin_queue record was inserted after the director call
//      started. Rows whose flagged board did not receive a pin_queue row
//      stay `open` so the next tick retries them.
//   3. On 402 payment_required → stops the run (credits exhausted); rows stay open
//      so the next cron tick automatically resumes once credits are added.
// When the open queue is empty, it runs pinterest-creative-variety-audit and
// returns the audit summary alongside processing totals.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN_BASE = `${SUPABASE_URL}/functions/v1`;

function traceId() {
  return crypto.randomUUID().slice(0, 8);
}

async function callFn(name: string, body: unknown) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify(body ?? {}),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const trace = traceId();
  let body: any = {};
  try { body = await req.json(); } catch { /* GET / empty body ok */ }

  const maxSlugs = Math.max(1, Math.min(50, Number(body?.maxSlugs ?? 25)));
  const count = Math.max(1, Math.min(8, Number(body?.count ?? 3)));
  const concurrency = Math.max(1, Math.min(8, Number(body?.concurrency ?? 4)));
  const force = body?.force !== false;
  const runAudit = body?.runAudit !== false;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Fetch open creative-regen tasks. Group by source_ref (product slug).
  const { data: rows, error } = await supabase
    .from("ai_priority_queue")
    .select("id, source_ref, evidence, priority_score")
    .eq("status", "open")
    .eq("source_kind", "pinterest_creative_regen")
    .order("priority_score", { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, traceId: trace, message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // slug → [{ id, board }]
  const slugMap = new Map<string, Array<{ id: string; board: string | null }>>();
  for (const r of rows ?? []) {
    const slug = (r as any).source_ref as string | null;
    if (!slug) continue;
    const board = ((r as any).evidence?.board_name as string | null) ?? null;
    const arr = slugMap.get(slug) ?? [];
    arr.push({ id: (r as any).id, board });
    slugMap.set(slug, arr);
  }

  const slugs = [...slugMap.keys()].slice(0, maxSlugs);
  const results: Array<{
    slug: string;
    status: number;
    ok: boolean;
    reason?: string;
    marked_done?: number;
    left_open_no_pin?: string[];
  }> = [];
  let processed = 0;
  let creditsExhausted = false;

  // Process in parallel batches to fit within edge function CPU budget.
  for (let i = 0; i < slugs.length; i += concurrency) {
    if (creditsExhausted) break;
    const batch = slugs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (slug) => {
        const startedAt = new Date().toISOString();
        const { status, json } = await callFn("pinterest-creative-director", {
          action: "run_full",
          productSlug: slug,
          count,
          force,
        });
        return { slug, status, json, startedAt };
      }),
    );
    for (const { slug, status, json, startedAt } of batchResults) {
      if (status === 402 || json?.error === "payment_required" || /payment_required/i.test(json?.message ?? "")) {
        creditsExhausted = true;
        results.push({ slug, status, ok: false, reason: "payment_required" });
        continue;
      }
      const success = status >= 200 && status < 300 && json?.ok !== false;
      if (!success) {
        results.push({
          slug,
          status,
          ok: false,
          reason: json?.message ?? `http_${status}`,
        });
        continue;
      }

      // Board-match guard: only mark a row `done` if a pinterest_pin_queue
      // record was created for its (product_slug, board_name) AFTER the
      // director call started. Rows whose board has no fresh pin_queue row
      // stay `open` for retry.
      const { data: freshPins } = await supabase
        .from("pinterest_pin_queue")
        .select("board_name")
        .eq("product_slug", slug)
        .gte("created_at", startedAt);

      const freshBoards = new Set(
        (freshPins ?? [])
          .map((p: any) => (p.board_name ?? "").toLowerCase().trim())
          .filter(Boolean),
      );

      const rowsForSlug = slugMap.get(slug) ?? [];
      const doneIds: string[] = [];
      const leftOpen: string[] = [];
      for (const r of rowsForSlug) {
        const key = (r.board ?? "").toLowerCase().trim();
        if (key && freshBoards.has(key)) doneIds.push(r.id);
        else leftOpen.push(r.board ?? "(no board)");
      }

      if (doneIds.length > 0) {
        await supabase
          .from("ai_priority_queue")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .in("id", doneIds);
        processed += 1;
      }

      results.push({
        slug,
        status,
        ok: doneIds.length > 0,
        reason: doneIds.length === 0
          ? `no_board_matching_pin_queue_record (flagged boards: ${leftOpen.join(", ")})`
          : undefined,
        marked_done: doneIds.length,
        left_open_no_pin: leftOpen.length > 0 ? leftOpen : undefined,
      });
    }
  }

  // Count remaining open rows.
  const { count: remaining } = await supabase
    .from("ai_priority_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("source_kind", "pinterest_creative_regen");

  // Run variety audit when the queue is fully drained (and not paused on credits).
  let audit: unknown = null;
  if (runAudit && !creditsExhausted && (remaining ?? 0) === 0) {
    const { status, json } = await callFn("pinterest-creative-variety-audit", {});
    audit = { status, body: json };
  }

  return new Response(
    JSON.stringify({
      ok: true,
      traceId: trace,
      slugs_total: slugMap.size,
      slugs_attempted: slugs.length,
      processed,
      remaining_open: remaining ?? null,
      credits_exhausted: creditsExhausted,
      results,
      audit,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});