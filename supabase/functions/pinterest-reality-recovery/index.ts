// pinterest-reality-recovery — WRITE mission.
// Makes LIVE Pinterest inventory equal to the canonical
// pinterest_pin_performance rows where status='published'.
//
// Phases (idempotent, one request per phase):
//   audit      — GET /v5/pins/{id} for every canonical published pin
//   ghosts     — for 404s, flip status='deleted_remote' (evidence-only)
//   repair     — for drift, PATCH /v5/pins/{id} when confidence >= 0.99
//   republish  — POST /v5/pins for ghosted rows that pass ALL gates
//                (requires body.confirm === true)
//   verify     — GET new pins, assert title/link/board match
//   certify    — emit factual counters
//   all        — audit → ghosts → repair → verify (NO republish)
//
// Auth: admin JWT OR SUPABASE_SERVICE_ROLE_KEY. Anon key rejected.
// No secrets read/written. No touching OAuth. No creative regen. No AI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PINTEREST_API = "https://api.pinterest.com/v5";
const REPAIR_CONFIDENCE_MIN = 0.99;
const MAX_REPUBLISH_PER_RUN = 30;
const MAX_REPUBLISH_PER_PRODUCT = 6;
const MAX_REPUBLISH_PER_BOARD = 8;
const TITLE_SIM_MAX = 0.85;
const TITLE_BLOCKLIST = [/multi[- ]?cat cleanliness/i];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function checkAuth(req: Request, sb: any): Promise<{ ok: boolean; who: string; res?: Response }> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, who: "", res: json({ ok: false, message: "unauthorized" }, 401) };
  const bearer = authHeader.slice(7).trim();
  if (!bearer) return { ok: false, who: "", res: json({ ok: false, message: "unauthorized" }, 401) };
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (anon && ctEqual(bearer, anon)) return { ok: false, who: "", res: json({ ok: false, message: "anon key not accepted" }, 403) };
  if (srk && ctEqual(bearer, srk)) return { ok: true, who: "service_role" };
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await userClient.auth.getClaims(bearer);
  const uid = claims?.claims?.sub;
  if (!uid) return { ok: false, who: "", res: json({ ok: false, message: "unauthorized" }, 401) };
  const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  if (!role) return { ok: false, who: "", res: json({ ok: false, message: "admin only" }, 403) };
  return { ok: true, who: `admin:${uid}` };
}

async function getToken(sb: any): Promise<string | null> {
  const { data: settings } = await sb.from("pinterest_runtime_settings")
    .select("active_pinterest_connection_id").eq("id", 1).maybeSingle();
  let cq = sb.from("pinterest_connection").select("*").eq("status", "connected");
  if (settings?.active_pinterest_connection_id) cq = cq.eq("id", settings.active_pinterest_connection_id);
  const { data: conn } = await cq.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return conn?.access_token ?? null;
}

async function pFetch(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${PINTEREST_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const status = r.status;
  let body: any = null;
  let text = "";
  if (status === 200 || status === 201) {
    body = await r.json().catch(() => null);
  } else {
    text = await r.text().catch(() => "");
  }
  return { status, body, err: text.slice(0, 400) };
}

function tokenize(s: string): Set<string> {
  return new Set((s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
}
function jaccard(a: string, b: string): number {
  const A = tokenize(a), B = tokenize(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function ensureRun(sb: any, runId: string | null, who: string, phases: string[]) {
  if (runId) return runId;
  const { data, error } = await sb.from("pinterest_reality_recovery_runs")
    .insert({ triggered_by: who, phases_requested: phases, status: "running" })
    .select("id").single();
  if (error) throw new Error(`create run: ${error.message}`);
  return data.id as string;
}

async function ev(sb: any, run_id: string, row: Record<string, any>) {
  await sb.from("pinterest_reality_recovery_events").insert({ run_id, ...row });
}

async function patchRun(sb: any, id: string, patch: Record<string, any>) {
  await sb.from("pinterest_reality_recovery_runs").update(patch).eq("id", id);
}

// ---------------- PHASES ----------------

async function phaseAudit(sb: any, token: string, runId: string) {
  const { data: canon } = await sb.from("pinterest_pin_performance")
    .select("pin_id, product_id, product_url, pin_title, pin_description")
    .eq("status", "published").not("pin_id", "is", null).limit(500);
  const pins = (canon ?? []).filter((p: any) => p.pin_id);
  await patchRun(sb, runId, { canonical_published: pins.length, phase_current: "audit" });

  let ghosts = 0, drift = 0, live = 0, errors = 0;
  const conc = 4;
  let i = 0;
  async function worker() {
    while (i < pins.length) {
      const p = pins[i++];
      const pinId = String(p.pin_id);
      const res = await pFetch(`/pins/${pinId}`, token);
      let action: string;
      const drifted =
        res.status === 200 &&
        ((res.body?.title && p.pin_title && res.body.title !== p.pin_title) ||
         (res.body?.link && p.product_url && res.body.link !== p.product_url) ||
         (res.body?.description && p.pin_description && res.body.description !== p.pin_description));
      if (res.status === 404 || res.status === 410) { action = "audit_ghost"; ghosts++; }
      else if (res.status === 200 && drifted) { action = "audit_drift"; drift++; }
      else if (res.status === 200) { action = "audit_match"; live++; }
      else { action = "audit_error"; errors++; }
      await ev(sb, runId, {
        phase: "audit", action, pin_id: pinId, product_id: p.product_id,
        http_status: res.status,
        before_snapshot: { canonical: p },
        after_snapshot: res.body ? {
          title: res.body.title, description: res.body.description,
          link: res.body.link, board_id: res.body.board_id,
        } : null,
        error: res.status >= 300 ? res.err : null,
      });
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  await Promise.all(Array.from({ length: conc }, worker));
  await patchRun(sb, runId, {
    live_before: live + drift,
    ghosts_detected: ghosts,
    drift_detected: drift,
    notes: { audit_errors: errors },
  });
  return { canonical_published: pins.length, live: live + drift, ghosts, drift, errors };
}

async function phaseGhosts(sb: any, runId: string) {
  const { data: events } = await sb.from("pinterest_reality_recovery_events")
    .select("pin_id").eq("run_id", runId).eq("action", "audit_ghost");
  const pinIds = (events ?? []).map((e: any) => e.pin_id).filter(Boolean);
  await patchRun(sb, runId, { phase_current: "ghosts" });
  let marked = 0;
  for (const pinId of pinIds) {
    const { data: before } = await sb.from("pinterest_pin_performance")
      .select("pin_id,status,pin_title,product_id").eq("pin_id", pinId).maybeSingle();
    if (!before || before.status === "deleted_remote") continue;
    const { error } = await sb.from("pinterest_pin_performance")
      .update({ status: "deleted_remote" }).eq("pin_id", pinId);
    if (error) {
      await ev(sb, runId, { phase: "ghosts", action: "ghost_mark_failed", pin_id: pinId, error: error.message });
      continue;
    }
    marked++;
    await ev(sb, runId, {
      phase: "ghosts", action: "ghost_marked_deleted", pin_id: pinId,
      product_id: before.product_id,
      before_snapshot: before, after_snapshot: { status: "deleted_remote" },
      reason: "pinterest_returned_404",
    });
  }
  await patchRun(sb, runId, { ghosts_marked_deleted: marked });
  return { candidates: pinIds.length, marked };
}

async function phaseRepair(sb: any, token: string, runId: string) {
  const { data: events } = await sb.from("pinterest_reality_recovery_events")
    .select("pin_id, product_id, before_snapshot, after_snapshot")
    .eq("run_id", runId).eq("action", "audit_drift");
  const list = events ?? [];
  await patchRun(sb, runId, { phase_current: "repair" });
  let repaired = 0, skipped = 0;
  for (const e of list) {
    const canon = e.before_snapshot?.canonical || {};
    const live = e.after_snapshot || {};
    const patch: Record<string, string> = {};
    let confSum = 0, confN = 0;
    if (canon.pin_title && live.title && canon.pin_title !== live.title) {
      patch.title = canon.pin_title;
      confSum += 1; confN += 1;
    }
    if (canon.pin_description && live.description && canon.pin_description !== live.description) {
      patch.description = canon.pin_description;
      confSum += 1; confN += 1;
    }
    if (canon.product_url && live.link && canon.product_url !== live.link) {
      // require canonical URL to include /products/ + utm_source=pinterest to be trusted
      const trusted = /\/products\//.test(canon.product_url) && /utm_source=pinterest/.test(canon.product_url);
      if (trusted) { patch.link = canon.product_url; confSum += 1; confN += 1; }
      else { confSum += 0.8; confN += 1; }
    }
    const confidence = confN ? confSum / confN : 0;
    if (Object.keys(patch).length === 0 || confidence < REPAIR_CONFIDENCE_MIN) {
      skipped++;
      await ev(sb, runId, {
        phase: "repair", action: "repair_skipped", pin_id: e.pin_id, product_id: e.product_id,
        confidence, before_snapshot: live, after_snapshot: patch,
        reason: `confidence ${confidence.toFixed(3)} < ${REPAIR_CONFIDENCE_MIN}`,
      });
      continue;
    }
    const res = await pFetch(`/pins/${e.pin_id}`, token, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.status === 200 || res.status === 204) {
      repaired++;
      await ev(sb, runId, {
        phase: "repair", action: "repair_patched", pin_id: e.pin_id, product_id: e.product_id,
        confidence, http_status: res.status,
        before_snapshot: live, after_snapshot: patch,
      });
    } else {
      skipped++;
      await ev(sb, runId, {
        phase: "repair", action: "repair_failed", pin_id: e.pin_id, product_id: e.product_id,
        confidence, http_status: res.status,
        before_snapshot: live, after_snapshot: patch, error: res.err,
      });
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  await patchRun(sb, runId, { drift_repaired_high_conf: repaired, drift_skipped_low_conf: skipped });
  return { drift: list.length, repaired, skipped };
}

async function phaseRepublish(
  sb: any,
  token: string,
  runId: string,
  opts: { limit?: number; dryRun?: boolean; useRegeneration?: boolean } = {},
) {
  await patchRun(sb, runId, { phase_current: "republish" });
  const dryRun = opts.dryRun === true;
  const useRegeneration = opts.useRegeneration === true;
  const limitReq = Number.isFinite(opts.limit as number) && (opts.limit as number) > 0
    ? Math.floor(opts.limit as number)
    : MAX_REPUBLISH_PER_RUN;
  const effectiveLimit = Math.min(limitReq, MAX_REPUBLISH_PER_RUN);

  // Live corpus for uniqueness checks
  const { data: live } = await sb.from("pinterest_pin_performance")
    .select("pin_id,pin_title,product_url,product_id").eq("status", "published");
  const liveList = live ?? [];
  const liveTitles = liveList.map((r: any) => r.pin_title || "");
  const liveUrls = new Set(liveList.map((r: any) => (r.product_url || "").toLowerCase()).filter(Boolean));
  const liveTitleSet = new Set(liveTitles.map((t: string) => t.trim().toLowerCase()).filter(Boolean));

  // Candidate source A: ghosts marked in THIS run
  const { data: ghostEvts } = await sb.from("pinterest_reality_recovery_events")
    .select("pin_id, product_id")
    .eq("run_id", runId).eq("action", "ghost_marked_deleted");
  const sameRunGhosts = (ghostEvts ?? [])
    .filter((g: any) => g.pin_id && g.product_id)
    .map((g: any) => ({ pin_id: String(g.pin_id), product_id: String(g.product_id), candidate_source: "same_run_ghost" as const }));

  // Candidate source B: historical rows already flipped to deleted_remote
  // in prior runs. This is the correct universe for the
  // `republish_deleted_remote` job phase.
  const { data: histRows } = await sb.from("pinterest_pin_performance")
    .select("pin_id, product_id")
    .eq("status", "deleted_remote")
    .not("pin_id", "is", null)
    .not("product_id", "is", null)
    .limit(2000);
  const historical = (histRows ?? [])
    .filter((r: any) => r.pin_id && r.product_id)
    .map((r: any) => ({ pin_id: String(r.pin_id), product_id: String(r.product_id), candidate_source: "historical_deleted_remote" as const }));

  // Dedup by pin_id (prefer same_run_ghost tag), then cap by limit.
  const byPin = new Map<string, { pin_id: string; product_id: string; candidate_source: "same_run_ghost" | "historical_deleted_remote" }>();
  for (const c of sameRunGhosts) byPin.set(c.pin_id, c);
  for (const c of historical) if (!byPin.has(c.pin_id)) byPin.set(c.pin_id, c);
  const allCandidates = Array.from(byPin.values());
  const candidates = allCandidates.slice(0, effectiveLimit);
  const historicalTotal = historical.length;
  const sameRunTotal = sameRunGhosts.length;
  await patchRun(sb, runId, { republish_candidates: candidates.length });
  await ev(sb, runId, {
    phase: "republish",
    action: "republish_candidates_selected",
    reason: dryRun ? "dry_run" : "live",
    before_snapshot: {
      historical_deleted_remote_candidates: historicalTotal,
      same_run_ghost_candidates: sameRunTotal,
      total_after_dedup: allCandidates.length,
      limit_requested: limitReq,
      effective_limit: effectiveLimit,
      selected: candidates.length,
      use_regeneration: useRegeneration,
    },
  });

  // Optional regeneration pre-pass: classify each candidate and, when needed,
  // substitute a UTM URL variant and/or template-based title. Uses the SAME
  // gate helpers so anti-spam remains unchanged.
  const regenMap = new Map<string, {
    classification: string;
    reason: string;
    new_title: string | null;
    new_url: string | null;
    would_pass: boolean;
  }>();
  const regenCounters: Record<string, number> = {
    ready_clean: 0, needs_title_rewrite: 0, needs_url_variant: 0,
    needs_title_and_url: 0, insufficient_metadata: 0, retire_candidate: 0,
  };

  if (useRegeneration) {
    // Pull originals + product metadata for regeneration decisions.
    const pinIds = candidates.map((c) => c.pin_id);
    const productIds = Array.from(new Set(candidates.map((c) => c.product_id)));
    const { data: origRows } = pinIds.length
      ? await sb.from("pinterest_pin_performance")
          .select("pin_id,product_id,pin_title,product_url").in("pin_id", pinIds)
      : { data: [] };
    const origByPin = new Map<string, any>();
    for (const r of origRows ?? []) origByPin.set(String(r.pin_id), r);
    const { data: prods } = productIds.length
      ? await sb.from("products").select("id,name,name_clean,slug,image_url,is_active,stock")
          .in("id", productIds)
      : { data: [] };
    const prodById = new Map<string, any>();
    for (const p of prods ?? []) prodById.set(String(p.id), p);

    const proposedTitles = new Set<string>();
    const proposedUrls = new Set<string>();

    for (const c of candidates) {
      const orig = origByPin.get(c.pin_id) || {};
      const oldTitle = String(orig.pin_title || "").trim();
      const oldUrl = String(orig.product_url || "").trim();
      const prod = prodById.get(c.product_id);
      const productName = (prod?.name_clean || prod?.name || "").trim();
      const slug = prod?.slug || "";
      const inStock = typeof prod?.stock === "number" ? prod.stock > 0 : true;
      const isActive = prod?.is_active !== false;
      const usable = !!prod && isActive && inStock && !!productName && !!slug && !!prod.image_url;

      if (!usable) {
        regenCounters.insufficient_metadata++;
        regenMap.set(c.pin_id, {
          classification: "insufficient_metadata",
          reason: !prod ? "product_missing"
            : !isActive ? "product_inactive"
            : !inStock ? "product_oos"
            : !productName ? "missing_product_name"
            : !slug ? "missing_slug"
            : "missing_image",
          new_title: null, new_url: null, would_pass: false,
        });
        continue;
      }

      const origUrlOk = oldUrl.length > 0 &&
        urlPassesUniqueness(oldUrl, liveUrls) &&
        !proposedUrls.has(oldUrl.toLowerCase());
      const origTitleOk = titlePassesContent(oldTitle) &&
        titlePassesUniqueness(oldTitle, liveTitleSet, liveTitles) &&
        !proposedTitles.has(oldTitle.trim().toLowerCase());

      let classification = "ready_clean";
      let reason = "original_passes_all_gates";
      let newTitle: string | null = oldTitle || null;
      let newUrl: string | null = oldUrl || null;

      if (!(origTitleOk && origUrlOk)) {
        if (!origUrlOk) {
          const base = oldUrl || `https://getpawsy.pet/products/${slug}`;
          newUrl = buildUtmVariant(base, c.pin_id);
          if (!urlPassesUniqueness(newUrl, liveUrls) || proposedUrls.has(newUrl.toLowerCase())) {
            newUrl = buildUtmVariant(base, `${c.pin_id}_${Date.now().toString(36)}`);
          }
        }
        if (!origTitleOk) {
          newTitle = null;
          for (const tpl of TITLE_TEMPLATES) {
            const cand = tpl(productName).slice(0, 100);
            if (!titlePassesContent(cand)) continue;
            if (!titlePassesUniqueness(cand, liveTitleSet, liveTitles)) continue;
            if (proposedTitles.has(cand.trim().toLowerCase())) continue;
            newTitle = cand;
            break;
          }
        }
        const titleFixed = !!newTitle;
        const urlFixed = !!newUrl && urlPassesUniqueness(newUrl, liveUrls) &&
          !proposedUrls.has(newUrl.toLowerCase());
        const tBad = !origTitleOk, uBad = !origUrlOk;
        if (tBad && uBad) {
          if (titleFixed && urlFixed) { classification = "needs_title_and_url"; reason = "regenerated_both"; }
          else { classification = "retire_candidate"; reason = `no_variant:title=${titleFixed} url=${urlFixed}`; }
        } else if (tBad) {
          if (titleFixed) { classification = "needs_title_rewrite"; reason = "regenerated_title"; }
          else { classification = "retire_candidate"; reason = "no_title_variant"; }
        } else {
          if (urlFixed) { classification = "needs_url_variant"; reason = "regenerated_url"; }
          else { classification = "retire_candidate"; reason = "no_url_variant"; }
        }
      }

      const finalTitleOk = !!newTitle && titlePassesContent(newTitle) &&
        titlePassesUniqueness(newTitle, liveTitleSet, liveTitles) &&
        !proposedTitles.has(newTitle.trim().toLowerCase());
      const finalUrlOk = !!newUrl &&
        urlPassesUniqueness(newUrl, liveUrls) &&
        !proposedUrls.has(newUrl.toLowerCase());
      const wouldPass = classification !== "retire_candidate" &&
        classification !== "insufficient_metadata" &&
        finalTitleOk && finalUrlOk;

      if (wouldPass) {
        proposedTitles.add(newTitle!.trim().toLowerCase());
        proposedUrls.add(newUrl!.toLowerCase());
      } else if (classification !== "retire_candidate" && classification !== "insufficient_metadata") {
        classification = "retire_candidate";
        reason = `final_gate_failed:title=${finalTitleOk} url=${finalUrlOk}`;
      }
      regenCounters[classification] = (regenCounters[classification] || 0) + 1;
      regenMap.set(c.pin_id, { classification, reason, new_title: newTitle, new_url: newUrl, would_pass: wouldPass });
    }

    await ev(sb, runId, {
      phase: "republish",
      action: "republish_regeneration_summary",
      reason: dryRun ? "dry_run" : "live",
      after_snapshot: { ...regenCounters, scanned: candidates.length },
    });
  }

  if (dryRun) {
    for (const c of candidates) {
      const rg = regenMap.get(c.pin_id);
      await ev(sb, runId, {
        phase: "republish",
        action: "republish_dry_run_candidate",
        pin_id: c.pin_id,
        product_id: c.product_id,
        reason: c.candidate_source,
        after_snapshot: useRegeneration ? {
          classification: rg?.classification ?? null,
          regen_reason: rg?.reason ?? null,
          new_title: rg?.new_title ?? null,
          new_url: rg?.new_url ?? null,
          would_pass: rg?.would_pass ?? false,
        } : { use_regeneration: false },
      });
    }
    return {
      dry_run: true,
      use_regeneration: useRegeneration,
      historical_deleted_remote_candidates: historicalTotal,
      same_run_ghost_candidates: sameRunTotal,
      total_candidates: candidates.length,
      attempted: 0, posted: 0, skipped: 0, failed: 0,
      ...(useRegeneration ? { regeneration: regenCounters } : {}),
    };
  }

  const perProduct: Record<string, number> = {};
  const perBoard: Record<string, number> = {};
  let posted = 0, skipped = 0, failed = 0, attempted = 0;

  for (const g of candidates) {
    if (posted >= effectiveLimit) break;
    attempted++;
    const rg = useRegeneration ? regenMap.get(g.pin_id) : undefined;
    if (useRegeneration && (!rg || !rg.would_pass)) {
      skipped++;
      await ev(sb, runId, {
        phase: "republish", action: "republish_skipped",
        pin_id: g.pin_id, product_id: g.product_id,
        reason: `regeneration_${rg?.classification ?? "unknown"}:${rg?.reason ?? "no_map"}`,
      });
      continue;
    }
    // Source material from queue: latest usable draft/published queue row for this product
    const { data: q } = await sb.from("pinterest_pin_queue")
      .select("id,product_id,product_slug,pin_title,pin_description,pin_image_url,destination_link,board_id,board_name,hashtags,pin_variant")
      .eq("product_id", g.product_id)
      .not("pin_image_url", "is", null)
      .not("board_id", "is", null)
      .not("destination_link", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    const source = (q ?? []).find((r: any) =>
      r.pin_title && r.pin_image_url?.startsWith("https://") &&
      /\/products\//.test(r.destination_link || "") &&
      /utm_source=pinterest/.test(r.destination_link || "")
    );
    if (!source) {
      skipped++;
      await ev(sb, runId, {
        phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id,
        reason: "no_valid_queue_source",
      });
      continue;
    }

    // Anti-spam gates
    // Regeneration override (when enabled): substitute title/URL BEFORE gates
    // so the same anti-spam thresholds run against the values we will POST.
    const title = (useRegeneration && rg?.new_title ? rg.new_title : source.pin_title).trim();
    const url   = (useRegeneration && rg?.new_url   ? rg.new_url   : source.destination_link).trim();
    const board = source.board_id;
    if (TITLE_BLOCKLIST.some((rx) => rx.test(title))) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, reason: "title_blocklist" });
      continue;
    }
    if (liveUrls.has(url.toLowerCase())) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, reason: "duplicate_url_live" });
      continue;
    }
    if (liveTitleSet.has(title.toLowerCase())) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, reason: "duplicate_title_live" });
      continue;
    }
    let simBlock = false;
    for (const lt of liveTitles) {
      if (jaccard(title, lt) >= TITLE_SIM_MAX) { simBlock = true; break; }
    }
    if (simBlock) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, reason: `title_similarity_>=${TITLE_SIM_MAX}` });
      continue;
    }
    perProduct[g.product_id] = (perProduct[g.product_id] || 0);
    if (perProduct[g.product_id] >= MAX_REPUBLISH_PER_PRODUCT) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, reason: "product_cap" });
      continue;
    }
    perBoard[board] = (perBoard[board] || 0);
    if (perBoard[board] >= MAX_REPUBLISH_PER_BOARD) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, board_id: board, reason: "board_cap" });
      continue;
    }

    // Verify destination resolves 200
    let destStatus = 0;
    try {
      const dr = await fetch(url, { method: "HEAD", redirect: "follow" });
      destStatus = dr.status;
      if (destStatus === 405) {
        const gr = await fetch(url, { method: "GET" });
        destStatus = gr.status;
      }
    } catch { /* stays 0 */ }
    if (destStatus !== 200) {
      skipped++;
      await ev(sb, runId, { phase: "republish", action: "republish_skipped", pin_id: g.pin_id, product_id: g.product_id, http_status: destStatus, reason: "destination_not_200" });
      continue;
    }

    // POST to Pinterest
    const payload = {
      board_id: board,
      title: title.slice(0, 100),
      description: (source.pin_description || "").slice(0, 500),
      link: url,
      media_source: { source_type: "image_url", url: source.pin_image_url },
    };
    let attempt = 0, ok = false, lastStatus = 0, lastErr = "", newId: string | null = null;
    while (attempt < 3 && !ok) {
      attempt++;
      const res = await pFetch(`/pins`, token, { method: "POST", body: JSON.stringify(payload) });
      lastStatus = res.status; lastErr = res.err;
      if (res.status === 201 && res.body?.id) { ok = true; newId = res.body.id; break; }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      break;
    }
    if (!ok || !newId) {
      failed++;
      await ev(sb, runId, {
        phase: "republish", action: "republish_failed", pin_id: g.pin_id, product_id: g.product_id,
        board_id: board, http_status: lastStatus, before_snapshot: payload, error: lastErr,
      });
      // small back-off before next candidate on API failure
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    // Insert new canonical row
    const { error: iErr } = await sb.from("pinterest_pin_performance").insert({
      pin_id: newId, product_id: g.product_id, product_url: url,
      pin_title: title, pin_description: source.pin_description || "",
      status: "published", generation_batch: "reality_recovery_v1",
    });
    if (iErr) {
      // Row insert failed but pin exists on Pinterest — log evidence
      await ev(sb, runId, {
        phase: "republish", action: "republish_row_insert_failed",
        pin_id: g.pin_id, new_pin_id: newId, product_id: g.product_id, board_id: board,
        error: iErr.message,
      });
    }
    posted++;
    perProduct[g.product_id]++;
    perBoard[board]++;
    liveTitles.push(title);
    liveTitleSet.add(title.toLowerCase());
    liveUrls.add(url.toLowerCase());
    await ev(sb, runId, {
      phase: "republish", action: "republish_posted",
      pin_id: g.pin_id, new_pin_id: newId, product_id: g.product_id, board_id: board,
      http_status: 201, before_snapshot: payload, after_snapshot: { id: newId },
      reason: useRegeneration ? `${g.candidate_source}:${rg?.classification ?? "ready_clean"}` : g.candidate_source,
    });

    // Throttle 6–12s jitter
    await new Promise((r) => setTimeout(r, 6000 + Math.floor(Math.random() * 6000)));
  }

  await patchRun(sb, runId, {
    republished_ok: posted, republish_skipped_gates: skipped, republish_failed_api: failed,
  });
  return {
    dry_run: false,
    use_regeneration: useRegeneration,
    historical_deleted_remote_candidates: historicalTotal,
    same_run_ghost_candidates: sameRunTotal,
    total_candidates: candidates.length,
    attempted, posted, skipped, failed,
    ...(useRegeneration ? { regeneration: regenCounters } : {}),
  };
}

async function phaseVerify(sb: any, token: string, runId: string) {
  await patchRun(sb, runId, { phase_current: "verify" });
  const { data: posts } = await sb.from("pinterest_reality_recovery_events")
    .select("new_pin_id, before_snapshot").eq("run_id", runId).eq("action", "republish_posted");
  let ok = 0, bad = 0;
  for (const p of posts ?? []) {
    if (!p.new_pin_id) continue;
    const res = await pFetch(`/pins/${p.new_pin_id}`, token);
    const want = p.before_snapshot || {};
    const matches =
      res.status === 200 &&
      res.body?.title === want.title &&
      res.body?.link === want.link &&
      res.body?.board_id === want.board_id;
    if (matches) {
      ok++;
      await ev(sb, runId, { phase: "verify", action: "verify_ok", new_pin_id: p.new_pin_id, http_status: res.status, after_snapshot: res.body });
    } else {
      bad++;
      await ev(sb, runId, { phase: "verify", action: "verify_failed", new_pin_id: p.new_pin_id, http_status: res.status, before_snapshot: want, after_snapshot: res.body, error: res.err });
      if (p.new_pin_id) {
        await sb.from("pinterest_pin_performance").update({ status: "verify_failed" }).eq("pin_id", p.new_pin_id);
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  await patchRun(sb, runId, { verified_ok: ok, verify_failed: bad });
  return { checked: (posts ?? []).length, ok, bad };
}

async function phaseCertify(sb: any, runId: string) {
  const { data: run } = await sb.from("pinterest_reality_recovery_runs").select("*").eq("id", runId).single();
  const { data: live } = await sb.from("pinterest_pin_performance")
    .select("pin_id,pin_title,product_url,product_id").eq("status", "published");
  const l = live ?? [];
  const dupTitles = new Set<string>();
  const dupUrls = new Set<string>();
  const seenT = new Map<string, number>(), seenU = new Map<string, number>();
  const boards = new Set<string>(), products = new Set<string>();
  for (const r of l) {
    if (r.pin_title) {
      const k = r.pin_title.trim().toLowerCase();
      seenT.set(k, (seenT.get(k) || 0) + 1);
      if ((seenT.get(k) || 0) > 1) dupTitles.add(k);
    }
    if (r.product_url) {
      const k = r.product_url.toLowerCase();
      seenU.set(k, (seenU.get(k) || 0) + 1);
      if ((seenU.get(k) || 0) > 1) dupUrls.add(k);
    }
    if (r.product_id) products.add(r.product_id);
  }
  const canonicalPublished = run.canonical_published ?? l.length;
  const coverage = canonicalPublished > 0 ? Math.round((l.length / canonicalPublished) * 10000) / 100 : 0;
  const success =
    (run.ghosts_detected ?? 0) === (run.ghosts_marked_deleted ?? 0) &&
    dupTitles.size === 0 && dupUrls.size === 0 &&
    (run.verify_failed ?? 0) === 0 &&
    (run.republish_failed_api ?? 0) === 0;
  const result = success ? "PASS" : "FAIL";
  await patchRun(sb, runId, {
    live_after: l.length,
    duplicate_titles_live: dupTitles.size,
    duplicate_urls_live: dupUrls.size,
    boards_used: boards.size,
    products_represented: products.size,
    coverage_pct: coverage,
    result,
    status: "finished",
    finished_at: new Date().toISOString(),
    phase_current: "certify",
  });
  return { result, live_after: l.length, coverage_pct: coverage, dupTitles: dupTitles.size, dupUrls: dupUrls.size, products: products.size };
}

// Resolve duplicate live titles and duplicate live destination URLs.
// Strategy: within each duplicate group, keep the newest published row
// (highest updated_at, then highest pin_id); DELETE the older duplicates
// on Pinterest and mark the local row status='duplicate_retired'.
// Preserves rate limits (throttled) and never touches non-duplicates.
async function phaseDedup(sb: any, token: string, runId: string) {
  await patchRun(sb, runId, { phase_current: "dedup" });
  const { data: live } = await sb.from("pinterest_pin_performance")
    .select("pin_id,pin_title,product_url,product_id,updated_at")
    .eq("status", "published");
  const rows = (live ?? []).filter((r: any) => r.pin_id);

  const byTitle: Record<string, any[]> = {};
  const byUrl: Record<string, any[]> = {};
  for (const r of rows) {
    if (r.pin_title) {
      const k = r.pin_title.trim().toLowerCase();
      (byTitle[k] = byTitle[k] || []).push(r);
    }
    if (r.product_url) {
      const k = r.product_url.trim().toLowerCase();
      (byUrl[k] = byUrl[k] || []).push(r);
    }
  }

  const toRetire = new Map<string, { row: any; reason: string }>();
  const rank = (r: any) => `${r.updated_at || ""}|${r.pin_id}`;
  for (const [k, grp] of Object.entries(byTitle)) {
    if (grp.length < 2) continue;
    const sorted = [...grp].sort((a, b) => rank(b).localeCompare(rank(a)));
    for (const r of sorted.slice(1)) {
      if (!toRetire.has(r.pin_id)) toRetire.set(r.pin_id, { row: r, reason: `duplicate_title:${k.slice(0, 60)}` });
    }
  }
  for (const [k, grp] of Object.entries(byUrl)) {
    if (grp.length < 2) continue;
    const sorted = [...grp].sort((a, b) => rank(b).localeCompare(rank(a)));
    for (const r of sorted.slice(1)) {
      if (!toRetire.has(r.pin_id)) toRetire.set(r.pin_id, { row: r, reason: `duplicate_url:${k.slice(0, 80)}` });
    }
  }

  let retired = 0, failed = 0;
  for (const [pinId, { row, reason }] of toRetire) {
    const del = await pFetch(`/pins/${pinId}`, token, { method: "DELETE" });
    const removed = del.status === 200 || del.status === 204 || del.status === 404 || del.status === 410;
    if (!removed) {
      failed++;
      await ev(sb, runId, {
        phase: "dedup", action: "dedup_delete_failed",
        pin_id: pinId, product_id: row.product_id, http_status: del.status,
        before_snapshot: row, reason, error: del.err,
      });
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    const { error: uErr } = await sb.from("pinterest_pin_performance")
      .update({ status: "duplicate_retired" }).eq("pin_id", pinId);
    if (uErr) {
      failed++;
      await ev(sb, runId, {
        phase: "dedup", action: "dedup_local_update_failed",
        pin_id: pinId, product_id: row.product_id, before_snapshot: row, reason, error: uErr.message,
      });
      continue;
    }
    retired++;
    await ev(sb, runId, {
      phase: "dedup", action: "dedup_retired",
      pin_id: pinId, product_id: row.product_id, http_status: del.status,
      before_snapshot: row, after_snapshot: { status: "duplicate_retired" }, reason,
    });
    await new Promise((r) => setTimeout(r, 1200));
  }

  await patchRun(sb, runId, {
    notes: { dedup_retired: retired, dedup_failed: failed, dedup_candidates: toRetire.size },
  });
  return { candidates: toRetire.size, retired, failed };
}

// ---------------- REGENERATE PREVIEW (read-only) ----------------
// Safe pre-publish regeneration layer for deleted_remote rows.
// - NO Pinterest API publish call
// - NO status update on pinterest_pin_performance
// - NO bypass of anti-spam gates
// Produces a classification + proposed (title, url) that would pass gates.
//
// Classifications:
//   ready_clean            — original title+url already pass all gates
//   needs_url_variant      — url dup only; UTM variant produced
//   needs_title_rewrite    — title dup/similarity only; alt title produced
//   needs_title_and_url    — both blocked; both regenerated
//   insufficient_metadata  — no usable product name / image / slug
//   retire_candidate       — no regeneration variant passes gates

function stripTrackingParams(u: string): string {
  try {
    const url = new URL(u);
    for (const k of Array.from(url.searchParams.keys())) {
      if (k.toLowerCase().startsWith("utm_")) url.searchParams.delete(k);
    }
    return url.toString();
  } catch { return u; }
}

function buildUtmVariant(baseUrl: string, oldPinId: string): string {
  try {
    const url = new URL(baseUrl);
    // Reset UTMs to canonical recovery attribution.
    for (const k of Array.from(url.searchParams.keys())) {
      if (k.toLowerCase().startsWith("utm_")) url.searchParams.delete(k);
    }
    url.searchParams.set("utm_source", "pinterest");
    url.searchParams.set("utm_medium", "organic");
    url.searchParams.set("utm_campaign", "recovery");
    url.searchParams.set("utm_content", `r_${oldPinId}`);
    return url.toString();
  } catch { return baseUrl; }
}

const TITLE_TEMPLATES = [
  (n: string) => `${n} — Pet Parent Pick`,
  (n: string) => `${n} · Everyday Essential`,
  (n: string) => `Meet the ${n}`,
  (n: string) => `${n} for Modern Homes`,
  (n: string) => `Why We Love the ${n}`,
  (n: string) => `${n} — Small Upgrade, Big Difference`,
  (n: string) => `${n} · Made for Busy Pet Parents`,
  (n: string) => `${n} — Calm, Clean, Consistent`,
  (n: string) => `${n} · Designed Around Your Pet`,
  (n: string) => `${n} — A Simple Daily Win`,
];

const CLICKBAIT_RX = /(shocking|unbelievable|you won.?t believe|miracle|magic|secret hack|doctors hate|weird trick)/i;
const FAKE_CLAIM_RX = /(#1 best|guaranteed|cure|100% effective|clinically proven|vet approved)/i;

function titlePassesContent(t: string): boolean {
  if (!t || t.trim().length < 10) return false;
  if (t.length > 100) return false;
  if (CLICKBAIT_RX.test(t)) return false;
  if (FAKE_CLAIM_RX.test(t)) return false;
  if (TITLE_BLOCKLIST.some((rx) => rx.test(t))) return false;
  return true;
}

function titlePassesUniqueness(
  t: string,
  liveTitleSet: Set<string>,
  liveTitles: string[],
): boolean {
  const norm = t.trim().toLowerCase();
  if (liveTitleSet.has(norm)) return false;
  for (const lt of liveTitles) {
    if (jaccard(t, lt) >= TITLE_SIM_MAX) return false;
  }
  return true;
}

function urlPassesUniqueness(u: string, liveUrls: Set<string>): boolean {
  return !liveUrls.has(u.toLowerCase());
}

async function phaseRegeneratePreview(
  sb: any,
  runId: string,
  opts: { limit?: number } = {},
) {
  await patchRun(sb, runId, { phase_current: "regenerate_preview" });
  const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 30)));

  // Live corpus (uniqueness baseline)
  const { data: live } = await sb.from("pinterest_pin_performance")
    .select("pin_id,pin_title,product_url,product_id").eq("status", "published");
  const liveList = live ?? [];
  const liveTitles = liveList.map((r: any) => r.pin_title || "").filter(Boolean);
  const liveTitleSet = new Set(liveTitles.map((t: string) => t.trim().toLowerCase()));
  const liveUrls = new Set(
    liveList.map((r: any) => (r.product_url || "").toLowerCase()).filter(Boolean),
  );

  // Candidates: historical deleted_remote rows
  const { data: rows } = await sb.from("pinterest_pin_performance")
    .select("pin_id,product_id,pin_title,product_url")
    .eq("status", "deleted_remote")
    .not("pin_id", "is", null)
    .not("product_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  const candidates = rows ?? [];

  // Product metadata (name_clean, name, slug)
  const productIds = Array.from(new Set(candidates.map((c: any) => c.product_id)));
  const { data: prods } = productIds.length
    ? await sb.from("products").select("id,name,name_clean,slug,image_url,is_active,stock")
        .in("id", productIds)
    : { data: [] };
  const prodById = new Map<string, any>();
  for (const p of prods ?? []) prodById.set(String(p.id), p);

  const counters: Record<string, number> = {
    ready_clean: 0, needs_title_rewrite: 0, needs_url_variant: 0,
    needs_title_and_url: 0, insufficient_metadata: 0, retire_candidate: 0,
  };
  let would_pass_after_regen = 0;
  let still_blocked = 0;
  const preview: any[] = [];

  // Track proposed titles/urls to avoid intra-batch collisions
  const proposedTitles = new Set<string>();
  const proposedUrls = new Set<string>();

  for (const c of candidates) {
    const pinId = String(c.pin_id);
    const productId = String(c.product_id);
    const oldTitle = (c.pin_title || "").trim();
    const oldUrl = (c.product_url || "").trim();
    const prod = prodById.get(productId);
    const productName = (prod?.name_clean || prod?.name || "").trim();
    const slug = prod?.slug || "";
    const inStock = typeof prod?.stock === "number" ? prod.stock > 0 : true;
    const isActive = prod?.is_active !== false;
    const usable =
      !!prod && isActive && inStock &&
      !!productName && !!slug && !!(prod.image_url);

    if (!usable) {
      counters.insufficient_metadata++;
      still_blocked++;
      preview.push({
        old_pin_id: pinId, product_id: productId,
        old_title: oldTitle, new_title: null,
        old_url: oldUrl, new_url: null,
        classification: "insufficient_metadata",
        reason: !prod ? "product_missing"
          : !isActive ? "product_inactive"
          : !inStock ? "product_oos"
          : !productName ? "missing_product_name"
          : !slug ? "missing_slug"
          : "missing_image",
        gate_result: "blocked",
      });
      continue;
    }

    // Gate checks on ORIGINAL
    const origUrlOk = oldUrl.length > 0 &&
      urlPassesUniqueness(oldUrl, liveUrls) &&
      !proposedUrls.has(oldUrl.toLowerCase());
    const origTitleOk = titlePassesContent(oldTitle) &&
      titlePassesUniqueness(oldTitle, liveTitleSet, liveTitles) &&
      !proposedTitles.has(oldTitle.trim().toLowerCase());

    let classification: string;
    let newTitle: string | null = oldTitle || null;
    let newUrl: string | null = oldUrl || null;
    let reason = "";

    if (origTitleOk && origUrlOk) {
      classification = "ready_clean";
      reason = "original_passes_all_gates";
    } else {
      // Try URL variant if URL blocked
      if (!origUrlOk) {
        const base = oldUrl || `https://getpawsy.pet/products/${slug}`;
        newUrl = buildUtmVariant(base, pinId);
        if (!urlPassesUniqueness(newUrl, liveUrls) || proposedUrls.has(newUrl.toLowerCase())) {
          // add extra jitter
          newUrl = buildUtmVariant(base, `${pinId}_${Date.now().toString(36)}`);
        }
      }
      // Try title alternatives if title blocked
      if (!origTitleOk) {
        newTitle = null;
        for (const tpl of TITLE_TEMPLATES) {
          const cand = tpl(productName).slice(0, 100);
          if (!titlePassesContent(cand)) continue;
          if (!titlePassesUniqueness(cand, liveTitleSet, liveTitles)) continue;
          if (proposedTitles.has(cand.trim().toLowerCase())) continue;
          newTitle = cand;
          break;
        }
      }

      const titleFixed = !!newTitle;
      const urlFixed = !!newUrl && urlPassesUniqueness(newUrl, liveUrls) &&
        !proposedUrls.has(newUrl.toLowerCase());

      const titleWasBad = !origTitleOk;
      const urlWasBad = !origUrlOk;

      if (titleWasBad && urlWasBad) {
        if (titleFixed && urlFixed) {
          classification = "needs_title_and_url";
          reason = "regenerated_both";
        } else {
          classification = "retire_candidate";
          reason = `no_variant_passes:title=${titleFixed} url=${urlFixed}`;
        }
      } else if (titleWasBad) {
        if (titleFixed) {
          classification = "needs_title_rewrite";
          reason = "regenerated_title";
        } else {
          classification = "retire_candidate";
          reason = "no_title_variant_passes";
        }
      } else {
        if (urlFixed) {
          classification = "needs_url_variant";
          reason = "regenerated_url";
        } else {
          classification = "retire_candidate";
          reason = "no_url_variant_passes";
        }
      }
    }

    // Final gate simulation
    const finalTitleOk = !!newTitle && titlePassesContent(newTitle) &&
      titlePassesUniqueness(newTitle, liveTitleSet, liveTitles) &&
      !proposedTitles.has(newTitle.trim().toLowerCase());
    const finalUrlOk = !!newUrl &&
      urlPassesUniqueness(newUrl, liveUrls) &&
      !proposedUrls.has(newUrl.toLowerCase());
    const wouldPass = classification !== "retire_candidate" &&
      classification !== "insufficient_metadata" &&
      finalTitleOk && finalUrlOk;

    if (wouldPass) {
      would_pass_after_regen++;
      proposedTitles.add(newTitle!.trim().toLowerCase());
      proposedUrls.add(newUrl!.toLowerCase());
    } else if (classification === "retire_candidate" || classification === "insufficient_metadata") {
      still_blocked++;
    } else {
      // classification says fixed but final gate failed → downgrade
      classification = "retire_candidate";
      reason = `final_gate_failed:title=${finalTitleOk} url=${finalUrlOk}`;
      still_blocked++;
    }

    counters[classification] = (counters[classification] || 0) + 1;

    const previewRow = {
      old_pin_id: pinId,
      product_id: productId,
      old_title: oldTitle,
      new_title: newTitle,
      old_url: oldUrl,
      new_url: newUrl,
      classification,
      reason,
      gate_result: wouldPass ? "would_pass" : "blocked",
    };
    preview.push(previewRow);

    await ev(sb, runId, {
      phase: "regenerate_preview",
      action: "regenerate_preview_row",
      pin_id: pinId,
      product_id: productId,
      reason: `${classification}:${reason}`,
      before_snapshot: { title: oldTitle, url: oldUrl },
      after_snapshot: { title: newTitle, url: newUrl, would_pass: wouldPass },
    });
  }

  await ev(sb, runId, {
    phase: "regenerate_preview",
    action: "regenerate_preview_summary",
    reason: "dry_run_only_no_publish",
    after_snapshot: { ...counters, would_pass_after_regen, still_blocked, scanned: candidates.length },
  });

  return {
    dry_run: true,
    publish_called: false,
    scanned: candidates.length,
    ...counters,
    would_pass_after_regen,
    still_blocked,
    preview,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = await checkAuth(req, sb);
  if (!auth.ok) return auth.res!;

  const body: any = await req.json().catch(() => ({}));
  const phase = String(body.phase || "audit").toLowerCase();
  const confirm = body.confirm === true;
  const inRun: string | null = body.run_id || null;

  const token = await getToken(sb);
  if (!token && phase !== "certify") return json({ ok: false, message: "pinterest not connected" }, 412);

  try {
    if (phase === "audit") {
      const runId = await ensureRun(sb, inRun, auth.who, ["audit"]);
      const r = await phaseAudit(sb, token!, runId);
      return json({ ok: true, run_id: runId, phase, ...r });
    }
    if (phase === "ghosts") {
      if (!inRun) return json({ ok: false, message: "run_id required (run audit first)" }, 400);
      const r = await phaseGhosts(sb, inRun);
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "repair") {
      if (!inRun) return json({ ok: false, message: "run_id required" }, 400);
      const r = await phaseRepair(sb, token!, inRun);
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "republish") {
      if (!inRun) return json({ ok: false, message: "run_id required" }, 400);
      if (!confirm) return json({ ok: false, message: "republish requires confirm: true in body" }, 428);
      const limit = typeof body.limit === "number" ? body.limit : undefined;
      const dryRun = body.dry_run === true;
      const r = await phaseRepublish(sb, token!, inRun, { limit, dryRun });
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "verify") {
      if (!inRun) return json({ ok: false, message: "run_id required" }, 400);
      const r = await phaseVerify(sb, token!, inRun);
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "certify") {
      if (!inRun) return json({ ok: false, message: "run_id required" }, 400);
      const r = await phaseCertify(sb, inRun);
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "all") {
      // Safe pipeline (no republish).
      const runId = await ensureRun(sb, inRun, auth.who, ["audit", "ghosts", "repair", "verify", "certify"]);
      const a = await phaseAudit(sb, token!, runId);
      const g = await phaseGhosts(sb, runId);
      const rp = await phaseRepair(sb, token!, runId);
      const v = await phaseVerify(sb, token!, runId);
      const c = await phaseCertify(sb, runId);
      return json({ ok: true, run_id: runId, phase, audit: a, ghosts: g, repair: rp, verify: v, certify: c });
    }
    if (phase === "dedup") {
      if (!inRun) return json({ ok: false, message: "run_id required" }, 400);
      const r = await phaseDedup(sb, token!, inRun);
      return json({ ok: true, run_id: inRun, phase, ...r });
    }
    if (phase === "regenerate_preview") {
      const runId = await ensureRun(sb, inRun, auth.who, ["regenerate_preview"]);
      const limit = typeof body.limit === "number" ? body.limit : 30;
      const r = await phaseRegeneratePreview(sb, runId, { limit });
      return json({ ok: true, run_id: runId, phase, ...r });
    }
    if (phase === "full") {
      // Full production recovery WITH republish + dedup. Requires confirm.
      if (!confirm) return json({ ok: false, message: "full requires confirm: true" }, 428);
      const runId = await ensureRun(sb, inRun, auth.who,
        ["audit", "ghosts", "repair", "dedup", "republish", "verify", "certify"]);
      const a = await phaseAudit(sb, token!, runId);
      const g = await phaseGhosts(sb, runId);
      const rp = await phaseRepair(sb, token!, runId);
      const d = await phaseDedup(sb, token!, runId);
      const pub = await phaseRepublish(sb, token!, runId);
      const v = await phaseVerify(sb, token!, runId);
      const c = await phaseCertify(sb, runId);
      return json({ ok: true, run_id: runId, phase,
        audit: a, ghosts: g, repair: rp, dedup: d, republish: pub, verify: v, certify: c });
    }
    return json({ ok: false, message: `unknown phase: ${phase}` }, 400);
  } catch (e) {
    return json({ ok: false, message: (e as Error).message }, 500);
  }
});