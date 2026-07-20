// pinterest-cleanup-audit
//
// Deep historical audit of pinterest_pin_queue. Scores every published pin
// for visual / hook / slug duplication and engagement, then writes a
// recommendation (KEEP / ARCHIVE / DELETE) to pinterest_cleanup_audit.
//
// Modes (?mode=):
//   scan      — recompute audit table for all published pins (default)
//   recommend — return top N candidates per recommendation
//   execute   — body { action: "archive"|"delete", pin_ids: [] }
//   trust     — return current trust recovery score
//
// Auth: admin role (has_role) OR service-role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  hammingHex,
  scoreVisualUniqueness,
  scoreHookUniqueness,
  compositeCleanupScore,
  recommendAction,
} from "../_shared/creative-quality.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const trace = () => `pca_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PHASH_DUP_THRESHOLD = 10;
const HOOK_DUP_JACCARD = 0.6;
const BATCH_CAP = 50;

// Chunked scan limits (Phase 3 — emergency stabilization)
const SCAN_BATCH_SIZE = 25;            // pins per invocation
const SCAN_RUNTIME_BUDGET_MS = 18_000; // abort before 25s edge timeout
const SCAN_API_RATE_PER_MIN = 60;      // rate limiter ceiling

type Pin = {
  pinterest_pin_id: string | null;
  product_slug: string | null;
  pin_title: string | null;
  pin_description: string | null;
  overlay_text: string | null;
  image_hash: string | null;
  hook_group: string | null;
  status: string | null;
  posted_at: string | null;
  created_at: string | null;
};

type ScanSession = {
  id: string;
  status: "running" | "paused" | "completed" | "failed";
  cursor: string | null;
  processed_count: number;
  remaining_count: number | null;
  total_estimate: number | null;
  mode: "light" | "full";
  options: Record<string, unknown>;
  partial_summary: { counts?: Record<string, number>; avg_ms_per_pin?: number };
  api_calls_used: number;
  last_error: string | null;
  started_at: string;
  completed_at: string | null;
};

async function authorize(req: Request): Promise<{ ok: true; admin: ReturnType<typeof createClient>; userId: string | null } | { ok: false; status: number; message: string }> {
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  if (!auth && !apikey) return { ok: false, status: 401, message: "unauthorized" };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  // Service-role apikey path
  if (auth.includes(SERVICE_KEY) || apikey.includes(SERVICE_KEY)) {
    return { ok: true, admin, userId: null };
  }
  // User JWT path — verify admin role
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, message: "missing bearer token" };
  const { data: userResp } = await admin.auth.getUser(token);
  const uid = userResp?.user?.id;
  if (!uid) return { ok: false, status: 401, message: "invalid token" };
  const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!roleRow) return { ok: false, status: 403, message: "admin only" };
  return { ok: true, admin, userId: uid };
}

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function styleQuality(p: Pin): { score: number; isSlideshow: boolean } {
  // Deterministic flags from text only — image flags are populated by
  // future autopublish writes. Default neutral 70.
  let score = 70;
  const text = `${p.pin_title ?? ""} ${p.pin_description ?? ""} ${p.overlay_text ?? ""}`;
  if (/\b(buy now|shop now|click here)\b/i.test(text)) score -= 25;
  if (/[!]{2,}/.test(text)) score -= 10;
  if (/🔥|⚡|👉|➡/.test(text)) score -= 10;
  const isSlideshow = /slideshow|montage/i.test(text);
  if (isSlideshow) score -= 15;
  return { score: Math.max(0, score), isSlideshow };
}

// ---------- chunked scan helpers ----------

async function getOrCreateSession(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  mode: "light" | "full",
  options: Record<string, unknown>,
): Promise<ScanSession> {
  // Idempotent: return active running session if one exists.
  const { data: existing } = await admin
    .from("pinterest_cleanup_scan_sessions")
    .select("*")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as unknown as ScanSession;

  const { count: total } = await admin
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id", { count: "exact", head: true })
    .not("pinterest_pin_id", "is", null);

  const { data, error } = await admin
    .from("pinterest_cleanup_scan_sessions")
    .insert({
      status: "running",
      mode,
      options,
      cursor: null,
      processed_count: 0,
      total_estimate: total ?? null,
      remaining_count: total ?? null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ScanSession;
}

async function loadSession(
  admin: ReturnType<typeof createClient>,
  id: string,
): Promise<ScanSession | null> {
  const { data } = await admin
    .from("pinterest_cleanup_scan_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ScanSession) ?? null;
}

async function persistSession(
  admin: ReturnType<typeof createClient>,
  id: string,
  patch: Partial<ScanSession>,
) {
  await admin
    .from("pinterest_cleanup_scan_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Process a single chunk of up to SCAN_BATCH_SIZE pins. Honors a wall-clock
 * budget and returns early with cursor persisted. Cheap "light" mode only
 * uses local DB data — no Pinterest API calls.
 */
async function runChunk(
  admin: ReturnType<typeof createClient>,
  session: ScanSession,
): Promise<{ processed: number; nextCursor: string | null; done: boolean }> {
  const startedMs = Date.now();
  const cursor = session.cursor; // ISO timestamp of created_at (descending pagination)

  let q = admin
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, product_slug, pin_title, pin_description, overlay_text, image_hash, hook_group, status, posted_at, created_at")
    .not("pinterest_pin_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(SCAN_BATCH_SIZE);
  if (cursor) q = q.lt("created_at", cursor);

  const { data: pins, error } = await q;
  if (error) throw error;
  const list = (pins ?? []) as Pin[];
  if (list.length === 0) {
    return { processed: 0, nextCursor: null, done: true };
  }

  // Slug repeat counts — pulled aggregated from the audit table so we don't
  // re-scan all pins each chunk.
  const slugs = Array.from(new Set(list.map((p) => p.product_slug).filter(Boolean))) as string[];
  const slugCount: Record<string, number> = {};
  if (slugs.length) {
    const { data: slugRows } = await admin
      .from("pinterest_pin_queue")
      .select("product_slug")
      .in("product_slug", slugs)
      .not("pinterest_pin_id", "is", null);
    for (const r of slugRows ?? []) {
      const s = (r as { product_slug: string }).product_slug;
      slugCount[s] = (slugCount[s] ?? 0) + 1;
    }
  }

  // Engagement lookup (cached per chunk). Light mode skips this.
  const engMap: Record<string, number> = {};
  if (session.mode === "full") {
    const ids = list.map((p) => p.pinterest_pin_id!).filter(Boolean);
    if (ids.length) {
      const { data: perf } = await admin
        .from("cinematic_pin_performance")
        .select("pin_id, engagement_rate, collected_at")
        .in("pin_id", ids)
        .order("collected_at", { ascending: false });
      for (const row of perf ?? []) {
        if (!engMap[row.pin_id]) engMap[row.pin_id] = Number(row.engagement_rate ?? 0);
      }
    }
  }

  const rows = list.map((p, idx) => {
    // Light mode: skip phash & hook similarity (expensive in-memory loops
    // across the whole pin set). Use slug repeat + age + engagement only.
    const otherInBatch = list.filter((_, j) => j !== idx);
    const otherHashes = session.mode === "full"
      ? otherInBatch.map((x) => x.image_hash).filter(Boolean) as string[]
      : [];
    const otherHooks = session.mode === "full"
      ? otherInBatch.map((x) => `${x.pin_title ?? ""} ${x.overlay_text ?? ""}`.trim()).filter(Boolean)
      : [];
    const visualUniqueness = session.mode === "full"
      ? scoreVisualUniqueness(p.image_hash, otherHashes) : 80;
    const hookText = `${p.pin_title ?? ""} ${p.overlay_text ?? ""}`.trim();
    const hookUniqueness = session.mode === "full"
      ? scoreHookUniqueness(hookText, otherHooks) : 80;
    const visualDup = session.mode === "full" && p.image_hash
      ? otherHashes.filter((h) => hammingHex(h, p.image_hash!) <= PHASH_DUP_THRESHOLD).length : 0;
    const hookRepeat = session.mode === "full" ? otherHooks.filter((h) => {
      const a = new Set(hookText.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
      const b = new Set(h.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
      let inter = 0; for (const t of a) if (b.has(t)) inter++;
      const union = a.size + b.size - inter;
      return union > 0 && inter / union >= HOOK_DUP_JACCARD;
    }).length : 0;
    const eng = engMap[p.pinterest_pin_id!] ?? 0;
    const days = daysSince(p.posted_at ?? p.created_at);
    const sq = styleQuality(p);
    const composite = compositeCleanupScore({
      visualUniqueness,
      engagementRate: eng,
      daysSincePublish: days,
      styleQuality: sq.score,
    });
    const recommendation = recommendAction({
      composite,
      slugRepeat: (slugCount[p.product_slug ?? ""] ?? 1) - 1,
      engagementRate: eng,
      isSlideshow: sq.isSlideshow,
      daysSincePublish: days,
    });
    const reasons: string[] = [];
    if (visualDup >= 2) reasons.push(`visual_duplicate(${visualDup})`);
    if ((slugCount[p.product_slug ?? ""] ?? 1) >= 4) reasons.push(`slug_repeat(${slugCount[p.product_slug ?? ""]})`);
    if (hookRepeat >= 2) reasons.push(`hook_repeat(${hookRepeat})`);
    if (sq.isSlideshow) reasons.push("slideshow_spam");
    if (eng < 0.003 && days >= 14) reasons.push("low_engagement");
    if (eng >= 0.015) reasons.push("high_performer_protected");
    return {
      pin_id: p.pinterest_pin_id!,
      slug: p.product_slug,
      thumbnail_phash: p.image_hash,
      hook_text: hookText.slice(0, 280),
      creative_category: null,
      composite_quality_score: composite,
      visual_dup_count: visualDup,
      slug_repeat_count: (slugCount[p.product_slug ?? ""] ?? 1) - 1,
      hook_repeat_count: hookRepeat,
      is_slideshow_spam: sq.isSlideshow,
      engagement_rate: eng,
      recommendation,
      reasons,
      audited_at: new Date().toISOString(),
    };
  });

  // Persist partial results immediately (idempotent upsert).
  if (rows.length) {
    await admin.from("pinterest_cleanup_audit").upsert(rows, { onConflict: "pin_id" });
  }

  const lastCreatedAt = list[list.length - 1].created_at!;
  const elapsed = Date.now() - startedMs;
  // If we burned more than the budget, stop here even if more pins exist.
  if (elapsed > SCAN_RUNTIME_BUDGET_MS) {
    return { processed: rows.length, nextCursor: lastCreatedAt, done: false };
  }
  return { processed: rows.length, nextCursor: lastCreatedAt, done: list.length < SCAN_BATCH_SIZE };
}

async function runScan(admin: ReturnType<typeof createClient>) {
  const { data: pins, error } = await admin
    .from("pinterest_pin_queue")
    .select("pinterest_pin_id, product_slug, pin_title, pin_description, overlay_text, image_hash, hook_group, status, posted_at, created_at")
    .not("pinterest_pin_id", "is", null)
    .limit(2000);
  if (error) throw error;
  const list = (pins ?? []) as Pin[];

  // Slug repeat counts
  const slugCount: Record<string, number> = {};
  for (const p of list) if (p.product_slug) slugCount[p.product_slug] = (slugCount[p.product_slug] ?? 0) + 1;

  // Engagement lookup (latest per pin)
  const ids = list.map((p) => p.pinterest_pin_id!).filter(Boolean);
  const engMap: Record<string, number> = {};
  if (ids.length) {
    const { data: perf } = await admin
      .from("cinematic_pin_performance")
      .select("pin_id, engagement_rate, collected_at")
      .in("pin_id", ids)
      .order("collected_at", { ascending: false });
    for (const row of perf ?? []) {
      if (!engMap[row.pin_id]) engMap[row.pin_id] = Number(row.engagement_rate ?? 0);
    }
  }

  const phashes = list.map((p) => p.image_hash).filter(Boolean) as string[];
  const hooks = list.map((p) => `${p.pin_title ?? ""} ${p.overlay_text ?? ""}`.trim()).filter(Boolean);

  const rows = list.map((p) => {
    const others = phashes.filter((h) => h !== p.image_hash);
    const otherHooks = hooks.filter((h, i) => list[i].pinterest_pin_id !== p.pinterest_pin_id);
    const visualUniqueness = scoreVisualUniqueness(p.image_hash, others);
    const hookText = `${p.pin_title ?? ""} ${p.overlay_text ?? ""}`.trim();
    const hookUniqueness = scoreHookUniqueness(hookText, otherHooks);
    const visualDup = p.image_hash ? others.filter((h) => hammingHex(h, p.image_hash!) <= PHASH_DUP_THRESHOLD).length : 0;
    const hookRepeat = otherHooks.filter((h) => {
      // Cheap Jaccard inline
      const a = new Set(hookText.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
      const b = new Set(h.toLowerCase().split(/\s+/).filter((t) => t.length > 2));
      let inter = 0; for (const t of a) if (b.has(t)) inter++;
      const union = a.size + b.size - inter;
      return union > 0 && inter / union >= HOOK_DUP_JACCARD;
    }).length;
    const eng = engMap[p.pinterest_pin_id!] ?? 0;
    const days = daysSince(p.posted_at ?? p.created_at);
    const sq = styleQuality(p);
    const composite = compositeCleanupScore({
      visualUniqueness,
      engagementRate: eng,
      daysSincePublish: days,
      styleQuality: sq.score,
    });
    const recommendation = recommendAction({
      composite,
      slugRepeat: (slugCount[p.product_slug ?? ""] ?? 1) - 1,
      engagementRate: eng,
      isSlideshow: sq.isSlideshow,
      daysSincePublish: days,
    });
    const reasons: string[] = [];
    if (visualDup >= 2) reasons.push(`visual_duplicate(${visualDup})`);
    if ((slugCount[p.product_slug ?? ""] ?? 1) >= 4) reasons.push(`slug_repeat(${slugCount[p.product_slug ?? ""]})`);
    if (hookRepeat >= 2) reasons.push(`hook_repeat(${hookRepeat})`);
    if (sq.isSlideshow) reasons.push("slideshow_spam");
    if (eng < 0.003 && days >= 14) reasons.push("low_engagement");
    if (eng >= 0.015) reasons.push("high_performer_protected");
    return {
      pin_id: p.pinterest_pin_id!,
      slug: p.product_slug,
      thumbnail_phash: p.image_hash,
      hook_text: hookText.slice(0, 280),
      creative_category: null,
      composite_quality_score: composite,
      visual_dup_count: visualDup,
      slug_repeat_count: (slugCount[p.product_slug ?? ""] ?? 1) - 1,
      hook_repeat_count: hookRepeat,
      is_slideshow_spam: sq.isSlideshow,
      engagement_rate: eng,
      recommendation,
      reasons,
      audited_at: new Date().toISOString(),
    };
  });

  // Upsert in chunks
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await admin.from("pinterest_cleanup_audit").upsert(slice, { onConflict: "pin_id" });
  }

  // Summary counts
  const counts = { KEEP: 0, ARCHIVE: 0, DELETE: 0 } as Record<string, number>;
  for (const r of rows) counts[r.recommendation]++;
  return { scanned: rows.length, counts };
}

async function trustRecoveryScore(admin: ReturnType<typeof createClient>) {
  const { data: latest } = await admin
    .from("pinterest_cleanup_audit")
    .select("composite_quality_score, recommendation, audited_at")
    .order("audited_at", { ascending: false })
    .limit(100);
  if (!latest || latest.length === 0) {
    return { score: null, sample_size: 0, last_audit_at: null, distribution: { KEEP: 0, ARCHIVE: 0, DELETE: 0 } };
  }
  const avg = Math.round(
    latest.reduce((a, r) => a + Number(r.composite_quality_score ?? 0), 0) / latest.length,
  );
  const dist = { KEEP: 0, ARCHIVE: 0, DELETE: 0 } as Record<string, number>;
  for (const r of latest) dist[r.recommendation as string] = (dist[r.recommendation as string] ?? 0) + 1;
  // Trust score = avg composite × penalty for DELETE share
  const deletePenalty = dist.DELETE / latest.length;
  const trust = Math.max(0, Math.min(100, Math.round(avg * (1 - deletePenalty * 0.5))));
  return {
    score: trust,
    avg_composite: avg,
    sample_size: latest.length,
    last_audit_at: latest[0].audited_at,
    distribution: dist,
  };
}

async function executeAction(
  admin: ReturnType<typeof createClient>,
  action: "archive" | "delete",
  pinIds: string[],
  userId: string | null,
) {
  if (pinIds.length === 0) return { ok: false, message: "no pin_ids provided" };
  if (pinIds.length > BATCH_CAP) return { ok: false, message: `batch cap ${BATCH_CAP} exceeded` };

  const results: Array<{ pin_id: string; ok: boolean; message?: string }> = [];
  for (const pinId of pinIds) {
    // Snapshot
    const { data: snap } = await admin.from("pinterest_pin_queue").select("*").eq("pinterest_pin_id", pinId).maybeSingle();
    const { data: audit } = await admin.from("pinterest_cleanup_audit").select("*").eq("pin_id", pinId).maybeSingle();

    // Hard floor protections
    if (audit && Number(audit.engagement_rate ?? 0) >= 0.015) {
      results.push({ pin_id: pinId, ok: false, message: "high_performer_protected" });
      continue;
    }
    if (snap?.posted_at && Date.now() - new Date(snap.posted_at).getTime() < 7 * 86400000) {
      results.push({ pin_id: pinId, ok: false, message: "cold_start_protected" });
      continue;
    }

    let resultMeta: Record<string, unknown> = {};
    if (action === "archive") {
      await admin.from("pinterest_pin_queue").update({ status: "archived" }).eq("pinterest_pin_id", pinId);
      resultMeta = { archived: true };
    } else {
      // Delete remotely via existing verify pipeline (best-effort) — we just
      // mark archived locally + queue a verification entry. Remote DELETE is
      // performed by pinterest-pin-deletion-verify which is already wired.
      await admin.from("pinterest_pin_queue").update({ status: "archived", rejection_reason: "cleanup_delete" }).eq("pinterest_pin_id", pinId);
      resultMeta = { archived: true, queued_remote_delete: true };
    }

    await admin.from("pinterest_cleanup_actions").insert({
      pin_id: pinId,
      action,
      executed_by: userId,
      pre_action_snapshot: { queue: snap, audit },
      result: resultMeta,
    });
    results.push({ pin_id: pinId, ok: true });
  }
  return { ok: true, results, processed: results.filter((r) => r.ok).length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = trace();
  const auth = await authorize(req);
  if (!auth.ok) return json(auth.status, { ok: false, traceId, message: auth.message });
  const { admin, userId } = auth;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "scan").toLowerCase();

  try {
    // ----- Chunked resumable scan modes (emergency stabilization) -----
    if (mode === "start" || mode === "continue" || mode === "status" || mode === "finalize") {
      const sessionId = url.searchParams.get("session_id");
      const scanMode = (url.searchParams.get("scan_mode") ?? "light").toLowerCase() === "full" ? "full" : "light";

      if (mode === "status") {
        if (!sessionId) {
          // Return latest session
          const { data } = await admin
            .from("pinterest_cleanup_scan_sessions")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return json(200, { ok: true, traceId, session: data });
        }
        const s = await loadSession(admin, sessionId);
        return json(200, { ok: true, traceId, session: s });
      }

      if (mode === "finalize") {
        if (!sessionId) return json(400, { ok: false, traceId, message: "session_id required" });
        await persistSession(admin, sessionId, {
          status: "completed",
          completed_at: new Date().toISOString(),
        });
        const t = await trustRecoveryScore(admin);
        return json(200, { ok: true, traceId, finalized: true, trust: t });
      }

      // start | continue
      let session: ScanSession;
      if (mode === "start") {
        session = await getOrCreateSession(admin, userId, scanMode, {});
      } else {
        if (!sessionId) return json(400, { ok: false, traceId, message: "session_id required" });
        const s = await loadSession(admin, sessionId);
        if (!s) return json(404, { ok: false, traceId, message: "session not found" });
        if (s.status !== "running") return json(200, { ok: true, traceId, session: s, message: `session already ${s.status}` });
        session = s;
      }

      const tStart = Date.now();
      try {
        const result = await runChunk(admin, session);
        const newProcessed = (session.processed_count ?? 0) + result.processed;
        const newRemaining = session.total_estimate != null
          ? Math.max(0, session.total_estimate - newProcessed)
          : null;
        const elapsedMs = Date.now() - tStart;
        const avgMs = result.processed > 0 ? Math.round(elapsedMs / result.processed) : null;

        const finished = result.done || result.nextCursor === null;
        await persistSession(admin, session.id, {
          cursor: result.nextCursor,
          processed_count: newProcessed,
          remaining_count: newRemaining,
          status: finished ? "completed" : "running",
          completed_at: finished ? new Date().toISOString() : null,
          partial_summary: {
            ...(session.partial_summary ?? {}),
            avg_ms_per_pin: avgMs ?? session.partial_summary?.avg_ms_per_pin,
          },
        });

        // Refresh session for response
        const fresh = await loadSession(admin, session.id);
        return json(200, {
          ok: true,
          traceId,
          session: fresh,
          chunk: { processed: result.processed, nextCursor: result.nextCursor, done: finished, elapsedMs },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Persist partial state on crash so the UI can resume.
        await persistSession(admin, session.id, {
          status: "failed",
          last_error: msg.slice(0, 500),
        });
        return json(500, { ok: false, traceId, session_id: session.id, message: msg });
      }
    }

    if (mode === "trust") {
      const t = await trustRecoveryScore(admin);
      return json(200, { ok: true, traceId, ...t });
    }
    if (mode === "scan") {
      const r = await runScan(admin);
      const t = await trustRecoveryScore(admin);
      return json(200, { ok: true, traceId, ...r, trust: t });
    }
    if (mode === "recommend") {
      const rec = (url.searchParams.get("rec") ?? "DELETE").toUpperCase();
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
      const { data } = await admin
        .from("pinterest_cleanup_audit")
        .select("*")
        .eq("recommendation", rec)
        .order("composite_quality_score", { ascending: true })
        .limit(limit);
      return json(200, { ok: true, traceId, recommendation: rec, rows: data ?? [] });
    }
    if (mode === "execute") {
      const body = await req.json().catch(() => ({}));
      const action = String(body.action ?? "").toLowerCase();
      const pinIds = Array.isArray(body.pin_ids) ? body.pin_ids.map(String) : [];
      if (action !== "archive" && action !== "delete") {
        return json(400, { ok: false, traceId, message: "action must be archive or delete" });
      }
      const out = await executeAction(admin, action as "archive" | "delete", pinIds, userId);
      return json(out.ok ? 200 : 400, { ok: out.ok, traceId, ...out });
    }
    return json(400, { ok: false, traceId, message: `unknown mode: ${mode}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, traceId, message: msg });
  }
});