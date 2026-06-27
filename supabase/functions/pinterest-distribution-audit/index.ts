// Pinterest Distribution & Discovery Audit — read-only.
// Phase 5 investigator: WHY Pinterest is not distributing GetPawsy content
// to the US audience. Reads existing DB telemetry only. NO mutations on
// Pinterest, NO analytics writes, NO schema changes.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PINTEREST_API = "https://api.pinterest.com/v5";

const REQUIRED_SCOPES = [
  "ads:read", "billing:read", "catalogs:read", "catalogs:write",
  "boards:read", "boards:write", "pins:read", "pins:write",
  "user_accounts:read",
];

type Json = Record<string, unknown>;

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!role;
}

async function pinGet(path: string, token: string, timeoutMs = 6000): Promise<{ status: number; body: unknown }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${PINTEREST_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await r.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: { error: String((e as Error).message) } };
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}
function clamp(n: number, lo = 0, hi = 100): number { return Math.max(lo, Math.min(hi, n)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  if (!(await isAdmin(req))) {
    return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const generated_at = new Date().toISOString();

    // ============================================================
    // SECTION 1 — Account Health
    // ============================================================
    const { data: conn } = await sb.from("pinterest_connection")
      .select("account_id, account_name, scopes, status, token_expires_at, board_count, last_account_status, last_boards_status, updated_at, access_token")
      .limit(1).maybeSingle();
    const token = (conn as Json | null)?.access_token as string | undefined;
    const grantedScopes = String((conn as Json | null)?.scopes ?? "")
      .split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));

    let user_account: Json | null = null;
    let user_account_status: number | null = null;
    let catalog_feeds: Json | null = null;
    let catalog_feeds_status: number | null = null;
    if (token) {
      const [u, c] = await Promise.all([
        pinGet("/user_account", token),
        pinGet("/catalogs/feeds", token),
      ]);
      user_account = u.body as Json; user_account_status = u.status;
      catalog_feeds = c.body as Json; catalog_feeds_status = c.status;
    }

    const { data: domainHealth } = await sb.from("pinterest_domain_health")
      .select("*").order("checked_at", { ascending: false }).limit(1).maybeSingle();

    const { data: catalogStatus } = await sb.from("pinterest_catalog_status")
      .select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();

    const { data: incidents } = await sb.from("pinterest_health_incidents")
      .select("condition, severity, status, created_at, resolved_at")
      .order("created_at", { ascending: false }).limit(25);

    const account_health = {
      account_connected: !!token,
      account_id: (conn as Json | null)?.account_id ?? null,
      account_name: (conn as Json | null)?.account_name ?? null,
      status: (conn as Json | null)?.status ?? null,
      token_expires_at: (conn as Json | null)?.token_expires_at ?? null,
      board_count: (conn as Json | null)?.board_count ?? 0,
      granted_scopes: grantedScopes,
      missing_scopes: missingScopes,
      user_account_status,
      user_account_business_verified: (user_account as Json | null)?.["is_verified_merchant"]
        ?? (user_account as Json | null)?.["business_name"] ?? null,
      claimed_websites: (user_account as Json | null)?.["website_url"] ?? null,
      domain_reachable: (domainHealth as Json | null)?.pinterest_reachable ?? null,
      domain_status: (domainHealth as Json | null)?.http_status ?? null,
      domain_latency_ms: (domainHealth as Json | null)?.latency_ms ?? null,
      catalog_feed_status: (catalogStatus as Json | null)?.feed_status ?? null,
      catalog_processing_status: (catalogStatus as Json | null)?.processing_status ?? null,
      catalog_items_total: (catalogStatus as Json | null)?.items_total ?? null,
      catalog_items_invalid: (catalogStatus as Json | null)?.items_invalid ?? null,
      catalog_last_error: (catalogStatus as Json | null)?.last_error ?? null,
      catalog_feeds_api_status: catalog_feeds_status,
      recent_incidents: incidents ?? [],
    };

    // ============================================================
    // SECTION 2 — Board Health
    // ============================================================
    const { data: boardsRaw } = await sb.from("pinterest_boards")
      .select("id, name, pin_count, follower_count, is_sandbox, is_blacklisted, production_verified, tier, health_score, us_share_30d, clicks_30d, saves_30d, last_seen_at")
      .order("pin_count", { ascending: false });
    const { data: boardPerf } = await sb.from("pinterest_board_performance")
      .select("board_id, board_name, impressions_30d, clicks_30d, saves_30d, ctr, purchase_rate, classification, rank, computed_at")
      .order("rank", { ascending: true });
    const perfMap = new Map<string, Json>();
    for (const b of boardPerf ?? []) perfMap.set(String((b as Json).board_id), b as Json);

    const boards = (boardsRaw ?? []).map((b) => {
      const p = perfMap.get(String((b as Json).id)) ?? {};
      const imp = Number((p as Json).impressions_30d ?? 0);
      const clk = Number((p as Json).clicks_30d ?? (b as Json).clicks_30d ?? 0);
      const sav = Number((p as Json).saves_30d ?? (b as Json).saves_30d ?? 0);
      const pinCount = Math.max(1, Number((b as Json).pin_count ?? 1));
      return {
        id: (b as Json).id,
        name: (b as Json).name,
        tier: (b as Json).tier ?? (p as Json).classification ?? null,
        pin_count: (b as Json).pin_count ?? 0,
        follower_count: (b as Json).follower_count ?? 0,
        health_score: (b as Json).health_score ?? null,
        us_share_30d: (b as Json).us_share_30d ?? null,
        impressions_30d: imp,
        clicks_30d: clk,
        saves_30d: sav,
        avg_impressions_per_pin: Math.round(imp / pinCount),
        avg_saves_per_pin: Math.round((sav / pinCount) * 10) / 10,
        avg_ctr: (p as Json).ctr ?? null,
        is_sandbox: (b as Json).is_sandbox ?? false,
        is_blacklisted: (b as Json).is_blacklisted ?? false,
        production_verified: (b as Json).production_verified ?? false,
        rank: (p as Json).rank ?? null,
        last_seen_at: (b as Json).last_seen_at ?? null,
      };
    });
    const dead_boards = boards.filter((b) => (b.impressions_30d ?? 0) === 0 && (b.clicks_30d ?? 0) === 0);
    const inactive_boards = boards.filter((b) => (b.pin_count ?? 0) === 0);
    const top_boards = [...boards].sort((a, b) => (b.impressions_30d ?? 0) - (a.impressions_30d ?? 0)).slice(0, 10);

    const board_health = {
      total_boards: boards.length,
      production_verified: boards.filter((b) => b.production_verified).length,
      sandbox: boards.filter((b) => b.is_sandbox).length,
      blacklisted: boards.filter((b) => b.is_blacklisted).length,
      dead_boards_count: dead_boards.length,
      inactive_boards_count: inactive_boards.length,
      avg_followers: Math.round(avg(boards.map((b) => Number(b.follower_count ?? 0)))),
      avg_pins: Math.round(avg(boards.map((b) => Number(b.pin_count ?? 0)))),
      avg_impressions_per_board_30d: Math.round(avg(boards.map((b) => Number(b.impressions_30d ?? 0)))),
      avg_clicks_per_board_30d: Math.round(avg(boards.map((b) => Number(b.clicks_30d ?? 0)))),
      avg_saves_per_board_30d: Math.round(avg(boards.map((b) => Number(b.saves_30d ?? 0)))),
      top_boards,
      dead_boards: dead_boards.slice(0, 25),
      boards,
    };

    // ============================================================
    // SECTION 3 — Pin Quality Audit
    // ============================================================
    const { data: perfPins } = await sb.from("pinterest_pin_performance")
      .select("pin_id, product_id, product_url, pin_title, pin_description, impressions, clicks, saves, ctr, performance_score, status, keywords, hook_angle, created_at");
    const { data: creativeScores } = await sb.from("pin_creative_scores")
      .select("attempt_id, product_id, headline, hook_text, overall, visual_realism, product_match, landing_score, ctr_prediction, passed_gate, rejection_reasons, created_at")
      .order("created_at", { ascending: false }).limit(2000);

    const pins = perfPins ?? [];
    const totalPins = pins.length;
    const totalImpressions = pins.reduce((s, p) => s + Number((p as Json).impressions ?? 0), 0);
    const totalClicks = pins.reduce((s, p) => s + Number((p as Json).clicks ?? 0), 0);
    const totalSaves = pins.reduce((s, p) => s + Number((p as Json).saves ?? 0), 0);
    const zeroImpressionPins = pins.filter((p) => Number((p as Json).impressions ?? 0) === 0).length;
    const zeroClickPins = pins.filter((p) => Number((p as Json).clicks ?? 0) === 0).length;

    // Duplicate detection
    const titleCount = new Map<string, number>();
    const descCount = new Map<string, number>();
    const productCount = new Map<string, number>();
    const urlCount = new Map<string, number>();
    for (const p of pins) {
      const t = String((p as Json).pin_title ?? "").trim().toLowerCase();
      const d = String((p as Json).pin_description ?? "").trim().toLowerCase();
      const pid = String((p as Json).product_id ?? "");
      const url = String((p as Json).product_url ?? "");
      if (t) titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
      if (d) descCount.set(d, (descCount.get(d) ?? 0) + 1);
      if (pid) productCount.set(pid, (productCount.get(pid) ?? 0) + 1);
      if (url) urlCount.set(url, (urlCount.get(url) ?? 0) + 1);
    }
    const dupTitles = [...titleCount.values()].filter((v) => v > 1).length;
    const dupDescs = [...descCount.values()].filter((v) => v > 1).length;
    const dupProducts = [...productCount.values()].filter((v) => v > 1).length;
    const dupUrls = [...urlCount.values()].filter((v) => v > 1).length;

    // Metadata quality
    const shortTitles = pins.filter((p) => String((p as Json).pin_title ?? "").length < 30).length;
    const longTitles = pins.filter((p) => String((p as Json).pin_title ?? "").length > 100).length;
    const shortDescs = pins.filter((p) => String((p as Json).pin_description ?? "").length < 100).length;
    const noKeywords = pins.filter((p) => !Array.isArray((p as Json).keywords) || (((p as Json).keywords as unknown[]) ?? []).length === 0).length;

    // Creative scores
    const cs = creativeScores ?? [];
    const csOverall = cs.map((c) => Number((c as Json).overall ?? 0)).filter((n) => n > 0);
    const csPassed = cs.filter((c) => (c as Json).passed_gate === true).length;
    const rejectionTallies = new Map<string, number>();
    for (const c of cs) {
      for (const r of ((c as Json).rejection_reasons as string[] | null) ?? []) {
        rejectionTallies.set(r, (rejectionTallies.get(r) ?? 0) + 1);
      }
    }
    const topRejections = [...rejectionTallies.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, count]) => ({ reason, count }));

    const pin_quality = {
      total_pins_tracked: totalPins,
      total_impressions_lifetime: totalImpressions,
      total_clicks_lifetime: totalClicks,
      total_saves_lifetime: totalSaves,
      avg_ctr: pct(totalClicks, totalImpressions),
      zero_impression_pins: zeroImpressionPins,
      zero_click_pins: zeroClickPins,
      duplicate_titles: dupTitles,
      duplicate_descriptions: dupDescs,
      duplicate_products: dupProducts,
      duplicate_urls: dupUrls,
      titles_too_short: shortTitles,
      titles_too_long: longTitles,
      descriptions_too_short: shortDescs,
      pins_without_keywords: noKeywords,
      avg_creative_score: Math.round(avg(csOverall) * 10) / 10,
      creative_pass_rate_pct: pct(csPassed, cs.length),
      top_rejection_reasons: topRejections,
    };

    // ============================================================
    // SECTION 4 — Distribution Audit (cause analysis)
    // ============================================================
    const distributionFactors: Array<{ cause: string; evidence: string; confidence: "high" | "medium" | "low"; fix: string; expected_impact: string }> = [];

    if (missingScopes.length > 0) {
      distributionFactors.push({
        cause: "OAuth scopes missing — Pinterest cannot serve full distribution features",
        evidence: `Missing scopes: ${missingScopes.join(", ")}`,
        confidence: "high",
        fix: "Reconnect Pinterest OAuth with full scope set (boards, pins, catalogs, ads, billing, user_accounts).",
        expected_impact: "Unlocks catalog distribution + ads reporting; enables Pinterest to rank pins.",
      });
    }
    if (((account_health.catalog_feed_status as string | null) ?? "").toLowerCase() !== "active") {
      distributionFactors.push({
        cause: "Catalog feed not ACTIVE — Product Pins downgraded to standard pins",
        evidence: `feed_status=${account_health.catalog_feed_status} processing=${account_health.catalog_processing_status} invalid_items=${account_health.catalog_items_invalid}`,
        confidence: account_health.catalog_feed_status ? "high" : "medium",
        fix: "Repair catalog feed, resolve invalid items, re-submit and wait for ACTIVE processing.",
        expected_impact: "Enables Product Pins / Shop tab eligibility — typical 3–10× discovery uplift.",
      });
    }
    if (totalImpressions < 1000) {
      distributionFactors.push({
        cause: "Cold-start / trust deficit — too few cumulative impressions to learn audience",
        evidence: `Lifetime impressions across ${totalPins} pins = ${totalImpressions}`,
        confidence: "high",
        fix: "Hold publishing volume, raise creative bar (>95 score gate), pin into already-active boards only.",
        expected_impact: "Algorithm needs ~10–30 engaged sessions per pin to break out of cold-start.",
      });
    }
    if (zeroImpressionPins / Math.max(1, totalPins) > 0.5) {
      distributionFactors.push({
        cause: "Shadow distribution / suppressed pins",
        evidence: `${zeroImpressionPins} of ${totalPins} pins (${pct(zeroImpressionPins, totalPins)}%) have ZERO impressions.`,
        confidence: "high",
        fix: "Audit suppressed pins for spam signals (duplicate images/links, banned phrases, low realism).",
        expected_impact: "Removing/repairing suppressed pins lifts overall account quality score.",
      });
    }
    if (dupTitles > 5 || dupDescs > 5 || dupUrls > 5) {
      distributionFactors.push({
        cause: "Duplicate content signals",
        evidence: `dup_titles=${dupTitles} dup_descriptions=${dupDescs} dup_urls=${dupUrls} dup_products=${dupProducts}`,
        confidence: "high",
        fix: "Enforce per-pin uniqueness in PCIE2 (headline + description + image fingerprint).",
        expected_impact: "Reduces spam classification risk; restores normal distribution velocity.",
      });
    }
    if (noKeywords / Math.max(1, totalPins) > 0.3) {
      distributionFactors.push({
        cause: "Weak metadata — pins lack keyword arrays",
        evidence: `${noKeywords} of ${totalPins} pins have empty keyword arrays.`,
        confidence: "medium",
        fix: "Require pin assembler to attach 4–8 US-targeted keywords per pin from keyword bank.",
        expected_impact: "Improves Pinterest Search eligibility (search drives ≥50% of distribution).",
      });
    }
    if (dead_boards.length / Math.max(1, boards.length) > 0.3) {
      distributionFactors.push({
        cause: "Many dead boards diluting account signal",
        evidence: `${dead_boards.length} of ${boards.length} boards have zero 30d impressions.`,
        confidence: "medium",
        fix: "Stop publishing into dead boards; consolidate into top performers.",
        expected_impact: "Concentrates pin velocity into boards Pinterest already trusts.",
      });
    }
    if ((board_health.avg_followers ?? 0) < 50) {
      distributionFactors.push({
        cause: "Limited audience — low average board followers",
        evidence: `Average followers per board = ${board_health.avg_followers}.`,
        confidence: "medium",
        fix: "Cross-promote boards, follow-back relevant US accounts, run small awareness ad to seed audience.",
        expected_impact: "Distribution snowballs once boards reach ~200–500 engaged followers.",
      });
    }

    // ============================================================
    // SECTION 5 — US Visibility
    // ============================================================
    const { data: usSessions } = await sb.from("visitor_activity")
      .select("country, page, created_at")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(2000);
    const pinterestSessions = (usSessions ?? []).filter((r) =>
      String((r as Json).page ?? "").includes("utm_source=pinterest") ||
      String((r as Json).page ?? "").includes("pinterest"));
    const usPinterest = pinterestSessions.filter((r) => String((r as Json).country ?? "").toUpperCase() === "US").length;

    const boardsWithUsShare = boards.filter((b) => Number(b.us_share_30d ?? 0) > 0);
    const avgUsShare = avg(boardsWithUsShare.map((b) => Number(b.us_share_30d ?? 0)));
    const usReadyBoards = boards.filter((b) => Number(b.us_share_30d ?? 0) >= 0.5).length;

    const us_visibility = {
      pinterest_sessions_30d: pinterestSessions.length,
      us_pinterest_sessions_30d: usPinterest,
      us_share_pct: pct(usPinterest, pinterestSessions.length),
      us_ready_boards: usReadyBoards,
      boards_with_any_us_signal: boardsWithUsShare.length,
      avg_board_us_share: Math.round(avgUsShare * 1000) / 10,
      estimated_us_visibility_score: clamp(
        Math.round(
          (usReadyBoards / Math.max(1, boards.length)) * 40 +
          (Math.min(1, pinterestSessions.length / 1000)) * 30 +
          (avgUsShare) * 30,
        ),
      ),
      notes: usPinterest === 0
        ? "Zero US Pinterest visitors confirmed — distribution to US audience is not occurring."
        : "Some US distribution detected.",
    };

    // ============================================================
    // SECTION 6 — Competitor Intelligence
    // ============================================================
    const { data: cpat } = await sb.from("pinterest_competitor_patterns")
      .select("pattern_type, pattern_value, niche_key, sample_count, avg_success, last_seen_at")
      .order("avg_success", { ascending: false }).limit(50);
    const { data: copp } = await sb.from("pinterest_competitor_opportunities")
      .select("product_slug, competitor_gap_score, rank, components, top_patterns, updated_at")
      .order("competitor_gap_score", { ascending: false }).limit(25);
    const competitor_intel = {
      top_patterns: cpat ?? [],
      gap_opportunities: copp ?? [],
      summary: {
        patterns_observed: (cpat ?? []).length,
        opportunities_ranked: (copp ?? []).length,
      },
    };

    // ============================================================
    // SECTION 7 — Recommendation Engine (ranked)
    // ============================================================
    const recScore = (r: { traffic: number; conversion: number; difficulty: number; confidence: number }) => {
      const benefit = r.traffic * 0.5 + r.conversion * 0.3 + r.confidence * 0.2;
      return Math.round((benefit / Math.max(1, r.difficulty)) * 100) / 100;
    };
    const recommendations = distributionFactors.map((f, idx) => {
      const traffic = f.confidence === "high" ? 90 : f.confidence === "medium" ? 60 : 35;
      const conversion = f.cause.includes("Catalog") || f.cause.includes("US") ? 80 : 40;
      const difficulty = f.cause.includes("OAuth") || f.cause.includes("Catalog") ? 30 : 60;
      const confidence = f.confidence === "high" ? 90 : f.confidence === "medium" ? 65 : 40;
      const roi = recScore({ traffic, conversion, difficulty, confidence });
      return {
        rank: idx + 1,
        cause: f.cause,
        evidence: f.evidence,
        fix: f.fix,
        expected_traffic_gain: traffic,
        expected_conversion_gain: conversion,
        difficulty,
        confidence,
        roi,
        priority: roi >= 4 ? "P0" : roi >= 2 ? "P1" : "P2",
      };
    }).sort((a, b) => b.roi - a.roi).map((r, i) => ({ ...r, rank: i + 1 }));

    // ============================================================
    // SECTION 8 — Autonomous Fixes (plans only)
    // ============================================================
    const auto_fix_catalog: Json = {
      issue: "Catalog feed not ACTIVE",
      can_auto_fix: !!token,
      plan: [
        "Re-validate getpawsy.pet feed URL accessibility.",
        "Re-submit feed via /catalogs/feeds POST (manual approval required).",
        "Poll processing_status until 'COMPLETED'.",
        "Persist new feed_id into pinterest_catalog_status.",
      ],
      blocked_by: missingScopes.includes("catalogs:write") ? "missing catalogs:write scope" : null,
    };
    const auto_fix_dedup: Json = {
      issue: "Duplicate titles/descriptions/urls",
      can_auto_fix: true,
      plan: [
        "Compute fingerprint(title+desc+image_hash) per pin.",
        "Mark duplicates older than canonical winner as 'rejected' in pcie2_publish_queue.",
        "Block assembler from emitting fingerprints seen in last 90 days.",
      ],
      blocked_by: null,
    };
    const auto_fix_metadata: Json = {
      issue: "Pins lacking keywords / weak metadata",
      can_auto_fix: true,
      plan: [
        "Join pinterest_keyword_performance with pin_product_classification.",
        "Assign top 4–8 US keywords per product to assembler context.",
        "Block publish queue rows whose keyword_count<4.",
      ],
      blocked_by: null,
    };
    const auto_fix_dead_boards: Json = {
      issue: "Publishing into dead boards",
      can_auto_fix: true,
      plan: [
        "Set publish_weight=0 on boards where impressions_30d=0 and clicks_30d=0.",
        "Re-route scheduled drafts to top 5 performing boards.",
      ],
      blocked_by: null,
    };
    const autonomous_fixes = [auto_fix_catalog, auto_fix_dedup, auto_fix_metadata, auto_fix_dead_boards];

    // ============================================================
    // SECTION 9 — Executive Summary
    // ============================================================
    const accountTrust = clamp(
      40 +
      (missingScopes.length === 0 ? 20 : 0) +
      (account_health.account_connected ? 10 : 0) +
      (((account_health.catalog_feed_status as string | null) ?? "").toLowerCase() === "active" ? 20 : 0) +
      (account_health.domain_reachable ? 10 : -10),
    );
    const distributionScore = clamp(
      Math.round(
        (1 - zeroImpressionPins / Math.max(1, totalPins)) * 50 +
        Math.min(1, totalImpressions / 10000) * 30 +
        ((dead_boards.length / Math.max(1, boards.length)) < 0.3 ? 20 : 0),
      ),
    );
    const discoveryScore = clamp(
      Math.round(
        (1 - noKeywords / Math.max(1, totalPins)) * 60 +
        Math.min(1, (cpat?.length ?? 0) / 40) * 40,
      ),
    );
    const seoScore = clamp(
      Math.round(
        (1 - shortTitles / Math.max(1, totalPins)) * 30 +
        (1 - shortDescs / Math.max(1, totalPins)) * 30 +
        (1 - noKeywords / Math.max(1, totalPins)) * 40,
      ),
    );
    const contentScore = clamp(
      Math.round(
        (pin_quality.creative_pass_rate_pct) * 0.5 +
        (1 - (dupTitles + dupDescs) / Math.max(1, totalPins * 2)) * 50,
      ),
    );
    const overallHealth = Math.round(
      (accountTrust + distributionScore + discoveryScore + seoScore + contentScore + us_visibility.estimated_us_visibility_score) / 6,
    );

    const exec_summary = {
      overall_health_score: overallHealth,
      distribution_score: distributionScore,
      discovery_score: discoveryScore,
      seo_score: seoScore,
      content_score: contentScore,
      account_trust_score: accountTrust,
      us_readiness_score: us_visibility.estimated_us_visibility_score,
      top_blockers: recommendations.slice(0, 5).map((r) => r.cause),
      top_opportunities: recommendations.slice(0, 5).map((r) => r.fix),
      estimated_monthly_pinterest_traffic_after_fixes:
        overallHealth < 30 ? "0–200 sessions/mo (still cold-start)" :
        overallHealth < 55 ? "500–2,000 sessions/mo" :
        overallHealth < 75 ? "2,000–8,000 sessions/mo" :
        "8,000+ sessions/mo (sustained discovery)",
      implementation_order: [
        "1. Restore OAuth scopes + verify catalog feed (P0, blocks everything else).",
        "2. Clean duplicates + enforce per-pin uniqueness in assembler.",
        "3. Attach US keywords to every queued pin.",
        "4. Stop publishing into dead boards; concentrate on top 5.",
        "5. Hold publish volume; raise creative gate to >95 until impressions/pin > 50.",
      ],
    };

    const payload = {
      ok: true,
      traceId,
      generated_at,
      mode: "read_only",
      account_health,
      board_health,
      pin_quality,
      distribution_audit: { factors: distributionFactors },
      us_visibility,
      competitor_intel,
      recommendations,
      autonomous_fixes,
      exec_summary,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});