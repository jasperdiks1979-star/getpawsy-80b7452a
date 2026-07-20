/**
 * pinterest-integrity-audit — admin-only (or service-role cron).
 *
 * Walks every Pinterest source that owns a destination URL and writes a row
 * per pin into pinterest_pin_audit with a `source` column, plus a summary row
 * into pinterest_pin_audit_runs.
 *
 * Sources audited:
 *   - pinterest_pin_queue           (all statuses)        source='pin_queue'
 *   - pinterest_pins (historical)                         source='pins'
 *   - pinterest_video_queue                               source='video_queue'
 *   - pinterest_publish_queue                             source='publish_queue'
 *
 * Body: { mode?: 'all'|'queued'|'posted'|'historical'|'daily',
 *         batch_size?: number, max_pages?: number,
 *         autorepair?: boolean }
 *
 * Returns: { ok, traceId, run_id, summary }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";
import { validateDestination } from "../_shared/pinterest-destination-validator.ts";
import { resolveDestination } from "../_shared/pinterest-url-resolver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PINTEREST_CRON_SECRET") || "";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";

const tid = () => crypto.randomUUID().slice(0, 8);

// Deterministic-lane hard limits. The audit runs without AI, but it does
// perform live HTTP validation against getpawsy.pet. Without bounds a single
// invocation would exhaust the edge-function wall-clock budget (~150s) and
// finish with pins_total=0 — the exact failure mode we are repairing.
const PER_FETCH_TIMEOUT_MS = 6000;
const CONCURRENCY = 8;
const FLUSH_EVERY = 50;      // persist audit rows every N processed
const MAX_ROWS_PER_RUN = 400; // hard ceiling per invocation

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}_timeout_${ms}ms`)), ms)),
  ]);
}

async function mapConcurrent<I, O>(
  items: I[],
  concurrency: number,
  fn: (item: I, idx: number) => Promise<O>,
  onEach?: (out: O, idx: number) => void | Promise<void>,
): Promise<O[]> {
  const results: O[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (e) {
        // Never let a single row kill the pool.
        results[idx] = { __err: (e as Error).message } as unknown as O;
      }
      if (onEach) { try { await onEach(results[idx], idx); } catch { /* swallow */ } }
    }
  });
  await Promise.all(workers);
  return results;
}

type Source = "pin_queue" | "pins" | "video_queue" | "publish_queue";

interface Row {
  source: Source;
  pin_queue_id: string | null;
  pinterest_pin_id: string | null;
  destination_url: string;
}

async function gatherRows(sb: any, mode: string, limit: number, offset: number = 0, dedupe: boolean = false): Promise<Row[]> {
  const rows: Row[] = [];

  if (mode !== "historical") {
    // pinterest_pin_queue
    const statuses =
      mode === "queued" ? ["queued","scheduled","draft","publishing","failed"]
      : mode === "posted" ? ["posted"]
      : ["queued","scheduled","draft","publishing","failed","posted","rejected","skipped"];
    const { data } = await sb
      .from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, destination_link, status")
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    const seen = new Set<string>();
    for (const r of data || []) {
      if (!r.destination_link) continue;
      if (dedupe) {
        if (seen.has(r.destination_link)) continue;
        seen.add(r.destination_link);
      }
      rows.push({
        source: "pin_queue",
        pin_queue_id: r.id,
        pinterest_pin_id: r.pinterest_pin_id,
        destination_url: r.destination_link,
      });
    }
  }

  if (mode === "all" || mode === "historical" || mode === "daily") {
    const { data: pins } = await sb
      .from("pinterest_pins")
      .select("id, pinterest_pin_id, destination_url")
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const r of pins || []) {
      if (r.destination_url) rows.push({
        source: "pins",
        pin_queue_id: null,
        pinterest_pin_id: r.pinterest_pin_id,
        destination_url: r.destination_url,
      });
    }

    const { data: vids } = await sb
      .from("pinterest_video_queue")
      .select("id, pin_id, destination_url")
      .not("destination_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const r of vids || []) {
      rows.push({
        source: "video_queue",
        pin_queue_id: null,
        pinterest_pin_id: r.pin_id,
        destination_url: r.destination_url,
      });
    }

    const { data: pubs } = await sb
      .from("pinterest_publish_queue")
      .select("id, pin_id_external, product_url")
      .not("product_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    for (const r of pubs || []) {
      rows.push({
        source: "publish_queue",
        pin_queue_id: null,
        pinterest_pin_id: r.pin_id_external,
        destination_url: r.product_url,
      });
    }
  }

  return rows;
}

async function authorize(req: Request, sb: any): Promise<{ ok: boolean; userId?: string; reason?: string }> {
  // Cron-secret bypass for the daily monitor
  const cron = req.headers.get("X-Cron-Secret") || "";
  if (CRON_SECRET && cron === CRON_SECRET) return { ok: true };
  const internal = req.headers.get("X-Internal-Secret") || "";
  if (INTERNAL_SECRET && internal === INTERNAL_SECRET) return { ok: true };

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, reason: "missing_token" };
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { ok: false, reason: "no_user" };
  const { data: roleCheck } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!roleCheck) return { ok: false, reason: "not_admin" };
  return { ok: true, userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = tid();
  const url = new URL(req.url);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const mode = String(body.mode || url.searchParams.get("mode") || "all").toLowerCase();
  const autorepair = body.autorepair === true || url.searchParams.get("autorepair") === "true";
  const limit = Math.min(Number(body.batch_size) || 500, 2000);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const auth = await authorize(req, sb);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, traceId, message: auth.reason || "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: run } = await sb
    .from("pinterest_pin_audit_runs")
    .insert({ triggered_by: auth.userId || null, summary: { mode, autorepair } })
    .select("id")
    .single();
  const runId = run!.id;

  const offset = Math.max(0, Number(body.offset) || Number(url.searchParams.get("offset")) || 0);
  const dedupe = body.dedupe === true || url.searchParams.get("dedupe") === "true";
  const gathered = await gatherRows(sb, mode, limit, offset, dedupe);
  // Hard ceiling — the deterministic lane guarantees completion per invocation.
  // Callers that need more should paginate via `offset` across multiple runs.
  const rows = gathered.slice(0, MAX_ROWS_PER_RUN);

  const buckets: Record<string, number> = {
    total: 0, valid: 0, broken: 0,
    by_source_pin_queue: 0, by_source_pins: 0, by_source_video_queue: 0, by_source_publish_queue: 0,
    homepage_destination: 0, soft_404: 0, destination_404: 0, category_mismatch: 0,
    product_not_found: 0, product_oos: 0, slug_mismatch: 0, title_missing: 0, image_missing: 0,
    wrong_destination_url: 0, repaired: 0, needs_replacement: 0,
  };

  const auditRows: any[] = [];
  const queueUpdates: Array<{ id: string; final: string | null; status: string; reason: string | null; repaired: boolean }> = [];
  const videoUpdates: Array<{ oldUrl: string; newUrl: string }> = [];
  const publishUpdates: Array<{ oldUrl: string; newUrl: string }> = [];

  // Periodic-flush helpers so a mid-run edge-runtime timeout still leaves
  // partial evidence in pinterest_pin_audit + pinterest_pin_audit_runs.
  const rowBuffer: any[] = [];
  const flushRows = async () => {
    if (rowBuffer.length === 0) return;
    const chunk = rowBuffer.splice(0, rowBuffer.length);
    for (let i = 0; i < chunk.length; i += 200) {
      await sb.from("pinterest_pin_audit").insert(chunk.slice(i, i + 200));
    }
  };
  const flushRunProgress = async () => {
    await sb.from("pinterest_pin_audit_runs").update({
      pins_total: buckets.total,
      pins_valid: buckets.valid,
      pins_broken: buckets.broken,
      summary: { ...buckets, mode, autorepair, in_progress: true, offset, rows_pending: rows.length - buckets.total },
    }).eq("id", runId);
  };

  const processOne = async (r: Row) => {
    const verdict = await withTimeout(
      validateDestination(sb, r.destination_url),
      PER_FETCH_TIMEOUT_MS,
      "validate_destination",
    ).catch((e: Error) => ({
      ok: false,
      final_resolved_url: null,
      http_status: null,
      product_slug_found: false,
      validation_status: "invalid" as const,
      last_validation_error: "destination_404" as const,
      reason_detail: e.message,
    }));
    let strategy = "valid";
    let newUrl: string | null = verdict.final_resolved_url;

    if (!verdict.ok) {
      buckets.broken++;
      const reason = verdict.last_validation_error || "destination_404";
      buckets[reason] = (buckets[reason] || 0) + 1;

      if (autorepair) {
        const resolved = await withTimeout(
          resolveDestination(sb, r.destination_url),
          PER_FETCH_TIMEOUT_MS,
          "resolve_destination",
        ).catch(() => ({ ok: false, target: null as string | null, step: "not_found" as string }));
        if (resolved.ok && resolved.target && resolved.step !== "category" && resolved.step !== "not_found") {
          const reVerdict = await withTimeout(
            validateDestination(sb, resolved.target),
            PER_FETCH_TIMEOUT_MS,
            "revalidate_destination",
          ).catch(() => ({ ok: false } as any));
          if (reVerdict.ok) {
            strategy = `repaired_via_${resolved.step}`;
            newUrl = resolved.target;
            buckets.repaired++;
            if (r.source === "pin_queue" && r.pin_queue_id) {
              queueUpdates.push({ id: r.pin_queue_id, final: newUrl, status: "valid", reason: null, repaired: true });
            } else if (r.source === "video_queue") {
              videoUpdates.push({ oldUrl: r.destination_url, newUrl });
            } else if (r.source === "publish_queue") {
              publishUpdates.push({ oldUrl: r.destination_url, newUrl });
            }
          } else {
            strategy = "needs_replacement";
            buckets.needs_replacement++;
          }
        } else {
          strategy = "needs_replacement";
          buckets.needs_replacement++;
        }
      } else {
        strategy = "needs_replacement";
        buckets.needs_replacement++;
      }

      if (r.source === "pin_queue" && r.pin_queue_id && !autorepair) {
        queueUpdates.push({ id: r.pin_queue_id, final: verdict.final_resolved_url, status: "invalid", reason, repaired: false });
      }
    } else {
      buckets.valid++;
    }

    rowBuffer.push({
      run_id: runId,
      source: r.source,
      pin_queue_id: r.pin_queue_id,
      pinterest_pin_id: r.pinterest_pin_id,
      destination_url: r.destination_url,
      final_resolved_url: newUrl,
      http_status: verdict.http_status,
      resolver_step: null,
      product_exists: verdict.product_slug_found,
      product_active: verdict.ok,
      product_in_stock: verdict.ok,
      repair_strategy: strategy,
      notes: verdict.reason_detail || verdict.last_validation_error || null,
    });
  };

  await mapConcurrent(
    rows,
    CONCURRENCY,
    async (r) => {
      buckets.total++;
      buckets[`by_source_${r.source}`]++;
      await processOne(r);
      return true;
    },
    async (_out, idx) => {
      if ((idx + 1) % FLUSH_EVERY === 0) {
        await flushRows();
        await flushRunProgress();
      }
    },
  );
  // Final flush of any remaining buffered rows.
  await flushRows();
  void auditRows;

  // Persist queue updates
  for (const u of queueUpdates) {
    const patch: Record<string, any> = {
      final_resolved_url: u.final,
      validation_status: u.status,
      last_validation_error: u.reason,
      last_validated_at: new Date().toISOString(),
    };
    if (u.repaired && u.final) {
      patch.destination_link = u.final;
      patch.repaired_at = new Date().toISOString();
      patch.repair_strategy = "auto_repaired";
    }
    await sb.from("pinterest_pin_queue").update(patch).eq("id", u.id);
  }

  // Persist video & publish rewrites
  for (const u of videoUpdates) {
    await sb.from("pinterest_video_queue").update({ destination_url: u.newUrl, updated_at: new Date().toISOString() })
      .eq("destination_url", u.oldUrl);
  }
  for (const u of publishUpdates) {
    await sb.from("pinterest_publish_queue").update({ product_url: u.newUrl })
      .eq("product_url", u.oldUrl);
  }

  await sb.from("pinterest_pin_audit_runs").update({
    finished_at: new Date().toISOString(),
    pins_total: buckets.total,
    pins_valid: buckets.valid,
    pins_broken: buckets.broken,
    summary: { ...buckets, mode, autorepair },
  }).eq("id", runId);

  const passingPct = buckets.total ? Math.round((buckets.valid / buckets.total) * 100) : 100;

  return new Response(JSON.stringify({
    ok: true, traceId, run_id: runId, mode, autorepair,
    passing_pct: passingPct, summary: buckets,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});