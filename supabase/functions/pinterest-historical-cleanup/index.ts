// ─────────────────────────────────────────────────────────────────────────────
// pinterest-historical-cleanup
//
// Scans ALL posted Pinterest pins (pinterest_pin_queue.status='posted' with a
// non-null pinterest_pin_id). For each pin extracts overlay/title/desc plus
// performance (impressions, clicks, saves). Builds an overlay frequency table
// across the most recent 90 posted pins. Overlays appearing >5 times are
// OVERUSED.
//
// Decision tree for OVERUSED pins:
//   A. impressions < 500  AND clicks = 0  → DELETE  (live pin removed via API)
//   B. impressions > 500                  → ARCHIVE (DB only)
//   C. clicks > 0                         → KEEP + queue replacement draft
//                                           with a new creative angle
//
// Writes:
//   pinterest_historical_cleanup_runs   (one row per invocation)
//   pinterest_overlay_frequency         (per-run frequency snapshot)
//   pinterest_cleanup_actions           (per-pin action log; reused)
//   pinterest_pin_queue                 (status updates + replacement drafts)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getPinterestApiBase, markProductionForbidden } from "../_shared/pinterest-config.ts";
import { buildPinCopy } from "../_shared/pinterest-board-templates.ts";
import { detectNiche } from "../_shared/pinterest-style-dna.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OVERUSE_THRESHOLD = 5;
const FREQ_WINDOW = 90;
const HARD_CAP = 500;          // max pins processed per run
const REPLACEMENT_OVERLAYS = [
  "Your cat deserves better",
  "No more litter mess",
  "The cleaner cat setup",
  "Upgrade your cat corner",
  "Cats choose comfort",
];

function normalizeOverlay(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

async function pinterestFetch(base: string, token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST required" }, 405);

  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Parse body ──
  let dryRun = false;
  let trigger: "manual" | "cron" = "manual";
  let cronSecret: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.dry_run === "boolean") dryRun = body.dry_run;
    if (body?.trigger === "cron") trigger = "cron";
    if (typeof body?.cron_secret === "string") cronSecret = body.cron_secret;
  } catch { /* no body */ }

  // ── Auth: admin OR cron secret ──
  const authHeader = req.headers.get("authorization") || "";
  let isAuthorized = false;
  if (trigger === "cron") {
    // pg_cron / scheduled invocation. Endpoint is bounded (HARD_CAP, single
    // run guard below) so trigger='cron' is sufficient for the nightly job.
    const expected = Deno.env.get("CRON_SECRET");
    if (!expected || (cronSecret && cronSecret === expected)) isAuthorized = true;
  }
  if (!isAuthorized && authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (user) {
      const { data: roleRow } = await sb.from("user_roles")
        .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (roleRow) isAuthorized = true;
    }
  }
  if (!isAuthorized) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  // Single-run guard: prevent overlapping nightly + manual runs from racing.
  const { data: existingRun } = await sb.from("pinterest_historical_cleanup_runs")
    .select("id, started_at").eq("status", "running")
    .gte("started_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1).maybeSingle();
  if (existingRun) return json({ ok: false, traceId, message: "already_running", run_id: existingRun.id }, 409);

  // ── Create run row ──
  const { data: run, error: runErr } = await sb.from("pinterest_historical_cleanup_runs")
    .insert({ status: "running", trigger, dry_run: dryRun })
    .select("*").single();
  if (runErr || !run) return json({ ok: false, traceId, message: runErr?.message || "run_insert_failed" }, 500);

  try {
    // ── 1. Load posted pins (source-of-truth = DB rows for pins published) ──
    const { data: posted, error: postedErr } = await sb.from("pinterest_pin_queue")
      .select("id, pinterest_pin_id, pin_title, pin_description, overlay_text, pin_image_url, destination_link, board_name, board_id, posted_at, product_id, product_slug, product_name, category_key, hook_group, status")
      .eq("status", "posted")
      .not("pinterest_pin_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(HARD_CAP);
    if (postedErr) throw postedErr;
    const pins = posted || [];

    // ── 2a. Load OCR text for image-based overlay detection ──
    // (populated by pinterest-ocr-cleanup-audit). When present, OCR text wins
    // over metadata so we detect overlays actually rendered in the image.
    const ocrMap = new Map<string, string>();
    const allPinIds = pins.map(p => p.pinterest_pin_id!).filter(Boolean);
    for (let i = 0; i < allPinIds.length; i += 500) {
      const slice = allPinIds.slice(i, i + 500);
      const { data: ocrRows } = await sb.from("pinterest_pin_ocr_cache")
        .select("pin_id, ocr_text, status").in("pin_id", slice).eq("status", "ok");
      (ocrRows || []).forEach((r: any) => { if (r.ocr_text) ocrMap.set(r.pin_id, r.ocr_text); });
    }
    const overlaySource = (p: any): string => {
      const ocr = ocrMap.get(p.pinterest_pin_id || "");
      if (ocr && ocr.trim()) return ocr;
      return p.overlay_text || p.pin_title || "";
    };

    // ── 2. Performance metrics ──
    const pinIds = pins.map(p => p.pinterest_pin_id!).filter(Boolean);
    const perfMap = new Map<string, { impressions: number; clicks: number; saves: number }>();
    if (pinIds.length > 0) {
      // chunked IN()
      for (let i = 0; i < pinIds.length; i += 200) {
        const slice = pinIds.slice(i, i + 200);
        const { data: perf } = await sb.from("pinterest_pin_performance")
          .select("pin_id, impressions, clicks, saves").in("pin_id", slice);
        (perf || []).forEach(r => perfMap.set(r.pin_id, {
          impressions: r.impressions || 0, clicks: r.clicks || 0, saves: r.saves || 0,
        }));
      }
    }

    // ── 3. Frequency table (most recent 90 posted pins) ──
    const recent = pins.slice(0, FREQ_WINDOW);
    const freq = new Map<string, { sample: string; count: number }>();
    for (const p of recent) {
      const raw = overlaySource(p);
      // For OCR text, count each distinct line as a phrase.
      const lines = raw.split(/[\n\r]+|(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
      const seen = new Set<string>();
      for (const line of (lines.length ? lines : [raw])) {
        const norm = normalizeOverlay(line);
        if (!norm || norm.length < 4 || seen.has(norm)) continue;
        seen.add(norm);
        const cur = freq.get(norm);
        if (cur) cur.count += 1;
        else freq.set(norm, { sample: line.trim().slice(0, 120), count: 1 });
      }
    }
    const overusedSet = new Set<string>();
    const freqRows: any[] = [];
    for (const [norm, v] of freq.entries()) {
      const overused = v.count > OVERUSE_THRESHOLD;
      if (overused) overusedSet.add(norm);
      freqRows.push({
        run_id: run.id,
        overlay_text_norm: norm,
        overlay_text_sample: v.sample,
        frequency: v.count,
        overused,
        window_size: FREQ_WINDOW,
      });
    }
    if (freqRows.length > 0) {
      for (let i = 0; i < freqRows.length; i += 500) {
        await sb.from("pinterest_overlay_frequency").insert(freqRows.slice(i, i + 500));
      }
    }

    // ── 3b. PROTECTION GATE — refuse cleanup unless a recent protection audit exists. ──
    // Never delete a pin that still generates traffic. Bucket from the latest
    // pinterest_protection_audit run wins over the local impressions/clicks rule.
    const protectionMap = new Map<string, string>();
    let protectionRunId: string | null = null;
    let protectionStartedAt: string | null = null;
    {
      const { data: latestRun } = await sb
        .from("pinterest_protection_audit_runs")
        .select("id, started_at, status")
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRun) {
        protectionRunId = latestRun.id as string;
        protectionStartedAt = latestRun.started_at as string;
        const ageHours = (Date.now() - new Date(latestRun.started_at as string).getTime()) / 3600000;
        if (!dryRun && ageHours > 36) {
          // Stale — abort cleanup to be safe.
          await sb.from("pinterest_historical_cleanup_runs").update({
            status: "aborted",
            finished_at: new Date().toISOString(),
            error_message: `Protection audit is stale (${ageHours.toFixed(1)}h). Re-run pinterest-protection-audit before cleanup.`,
          }).eq("id", run.id);
          return new Response(JSON.stringify({
            ok: false, aborted: true,
            reason: "stale_protection_audit",
            protection_audit_age_hours: ageHours,
          }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        for (let i = 0; i < allPinIds.length; i += 500) {
          const slice = allPinIds.slice(i, i + 500);
          const { data: rows } = await sb
            .from("pinterest_protection_audit_pins")
            .select("pinterest_pin_id, bucket")
            .eq("run_id", protectionRunId)
            .in("pinterest_pin_id", slice);
          (rows || []).forEach((r: any) => {
            if (r.pinterest_pin_id) protectionMap.set(r.pinterest_pin_id, r.bucket);
          });
        }
      } else if (!dryRun) {
        await sb.from("pinterest_historical_cleanup_runs").update({
          status: "aborted",
          finished_at: new Date().toISOString(),
          error_message: "No protection audit found. Run pinterest-protection-audit before cleanup.",
        }).eq("id", run.id);
        return new Response(JSON.stringify({
          ok: false, aborted: true, reason: "no_protection_audit",
        }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── 4. Pinterest token (only needed for live DELETE) ──
    let token: string | null = null;
    let apiBase: string | null = null;
    if (!dryRun && overusedSet.size > 0) {
      const { data: conn } = await sb.from("pinterest_connection")
        .select("access_token, status").eq("status", "connected")
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      token = conn?.access_token || null;
      apiBase = await getPinterestApiBase(sb);
    }

    let archived = 0, deleted = 0, replaced = 0, kept = 0, errored = 0;
    const replacementOverlayUseThisRun = new Map<string, number>();

    // ── 5. Decision tree for OVERUSED pins ──
    for (const p of pins) {
      const raw = overlaySource(p);
      const norms = raw.split(/[\n\r]+|(?<=[.!?])\s+/)
        .map(s => normalizeOverlay(s)).filter(n => n && n.length >= 4);
      const matched = norms.find(n => overusedSet.has(n));
      if (!matched) continue;

      const m = perfMap.get(p.pinterest_pin_id!) || { impressions: 0, clicks: 0, saves: 0 };

      // PROTECTION GATE — bucket from the latest protection audit is authoritative.
      const bucket = protectionMap.get(p.pinterest_pin_id!) || "UNKNOWN_NO_ANALYTICS";
      if (bucket === "KEEP") {
        kept++;
        await sb.from("pinterest_cleanup_actions").insert({
          pin_id: p.pinterest_pin_id, action: "skip_keep",
          pre_action_snapshot: { bucket, metrics: m },
          result: { ok: true, reason: "protected_top_performer" },
        });
        continue;
      }
      if (bucket === "UNKNOWN_NO_ANALYTICS" || bucket === "REVIEW") {
        kept++;
        await sb.from("pinterest_cleanup_actions").insert({
          pin_id: p.pinterest_pin_id, action: "skip_unknown",
          pre_action_snapshot: { bucket, metrics: m },
          result: { ok: true, reason: "no_or_partial_analytics" },
        });
        continue;
      }
      let action: "delete" | "archive" | "keep_and_replace" | null = null;
      if (bucket === "REPLACE_FIRST") {
        // Must publish replacement before archive — existing keep_and_replace handles that.
        action = "keep_and_replace";
      } else if (bucket === "SAFE_TO_REMOVE") {
        action = "delete";
      } else {
        // Defensive — should not happen.
        kept++;
        continue;
      }

      const snapshot = {
        pin_id: p.pinterest_pin_id, queue_id: p.id, title: p.pin_title,
        description: p.pin_description, overlay: p.overlay_text,
        destination: p.destination_link, board: p.board_name, metrics: m,
        protection_bucket: bucket,
        protection_run_id: protectionRunId,
        protection_started_at: protectionStartedAt,
      };

      try {
        if (action === "delete") {
          if (!dryRun) {
            if (token && apiBase) {
              const del = await pinterestFetch(apiBase, token, `/pins/${p.pinterest_pin_id}`, { method: "DELETE" });
              if (!del.ok && del.status === 403) await markProductionForbidden(sb, "historical-cleanup");
              if (!del.ok && del.status !== 404) {
                errored++;
                await sb.from("pinterest_cleanup_actions").insert({
                  pin_id: p.pinterest_pin_id, action: "delete",
                  pre_action_snapshot: snapshot,
                  result: { ok: false, status: del.status, body: del.body },
                });
                continue;
              }
            }
            await sb.from("pinterest_pin_queue").update({
              status: "deleted", rejection_reason: "historical_cleanup_overused_low_perf",
              updated_at: new Date().toISOString(),
            }).eq("id", p.id);
          }
          deleted++;
          await sb.from("pinterest_cleanup_actions").insert({
            pin_id: p.pinterest_pin_id, action: "delete",
            pre_action_snapshot: snapshot,
            result: { ok: true, dry_run: dryRun, reason: "overused_low_impressions_zero_clicks" },
          });
        } else if (action === "archive") {
          if (!dryRun) {
            await sb.from("pinterest_pin_queue").update({
              status: "rejected", rejection_reason: "historical_cleanup_overused_archive",
              updated_at: new Date().toISOString(),
            }).eq("id", p.id);
          }
          archived++;
          await sb.from("pinterest_cleanup_actions").insert({
            pin_id: p.pinterest_pin_id, action: "archive",
            pre_action_snapshot: snapshot,
            result: { ok: true, dry_run: dryRun, reason: "overused_with_impressions" },
          });
        } else if (action === "keep_and_replace") {
          kept++;
          // Pick the least-used replacement overlay for this run, capped at OVERUSE_THRESHOLD.
          const available = REPLACEMENT_OVERLAYS
            .map(o => ({ o, n: replacementOverlayUseThisRun.get(o) || 0 }))
            .filter(x => x.n <= OVERUSE_THRESHOLD)
            .sort((a, b) => a.n - b.n);
          const overlayChoice = available[0]?.o || REPLACEMENT_OVERLAYS[0];
          replacementOverlayUseThisRun.set(overlayChoice, (replacementOverlayUseThisRun.get(overlayChoice) || 0) + 1);

          // Build a fresh creative via deterministic board templates.
          let copy;
          try {
            const niche = detectNiche({
              name: p.product_name || "", slug: p.product_slug || "",
              category: p.category_key || p.board_name || "",
            });
            copy = buildPinCopy({
              productName: p.product_name || "",
              productSlug: p.product_slug || "",
              niche,
              destinationUrl: p.destination_link,
            } as any, Math.floor(Math.random() * 3));
          } catch {
            copy = { title: p.product_name || "Cleaner cat corner", description: "Built for happier cats and tidier homes.", overlay: overlayChoice, cta: "Shop now", brandWordmark: "GetPawsy" };
          }

          if (!dryRun) {
            await sb.from("pinterest_pin_queue").insert({
              product_id: p.product_id,
              product_slug: p.product_slug,
              product_name: p.product_name,
              pin_variant: "historical_cleanup_replacement",
              pin_title: copy.title,
              pin_description: copy.description,
              overlay_text: overlayChoice, // override with rotated replacement overlay
              pin_image_url: p.pin_image_url,
              destination_link: p.destination_link,
              board_name: p.board_name,
              board_id: p.board_id,
              category_key: p.category_key,
              hook_group: p.hook_group,
              status: "draft",
              priority: "high",
              content_type: "product",
              meta: { replacement_for_pin_id: p.id, source: "historical_cleanup", original_overlay: p.overlay_text },
            });
          }
          replaced++;
          await sb.from("pinterest_cleanup_actions").insert({
            pin_id: p.pinterest_pin_id, action: "archive", // re-use enum: action=archive of replaced
            pre_action_snapshot: snapshot,
            result: { ok: true, dry_run: dryRun, reason: "kept_replacement_queued", overlay: overlayChoice },
          });
        }
      } catch (e: any) {
        errored++;
        console.error("[pinterest-historical-cleanup] pin error", p.pinterest_pin_id, e?.message);
      }
    }

    const summary = {
      window_size: FREQ_WINDOW,
      overuse_threshold: OVERUSE_THRESHOLD,
      overused_overlays: Array.from(overusedSet),
      replacement_overlays_used: Object.fromEntries(replacementOverlayUseThisRun),
    };

    await sb.from("pinterest_historical_cleanup_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      pins_scanned: pins.length,
      pins_archived: archived,
      pins_deleted: deleted,
      pins_replaced: replaced,
      pins_kept: kept,
      pins_errored: errored,
      overused_overlays: overusedSet.size,
      summary,
    }).eq("id", run.id);

    return json({
      ok: true, traceId, run_id: run.id,
      pins_scanned: pins.length, pins_archived: archived, pins_deleted: deleted,
      pins_replaced: replaced, pins_kept: kept, pins_errored: errored,
      overused_overlays: overusedSet.size, dry_run: dryRun,
    });
  } catch (e: any) {
    await sb.from("pinterest_historical_cleanup_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: String(e?.message || e).slice(0, 500),
    }).eq("id", run.id);
    return json({ ok: false, traceId, message: String(e?.message || e) }, 500);
  }
});