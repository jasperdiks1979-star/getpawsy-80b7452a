// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Board Intelligence
// ─────────────────────────────────────────────────────────────────────────────
// Picks the BEST publishable board for a pin using historical performance
// (CTR, save rate, purchase rate) blended with topical/keyword similarity
// against the product niche. Reads existing tables only:
//   • pinterest_boards               — verified, non-blacklisted set
//   • pinterest_board_performance    — 30d rollup (may be empty → fallback)
// Never creates boards. Never mutates tables. Pure selector + reason.
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardPickInput {
  category_key?: string | null;
  niche?: string | null;
  product_name?: string | null;
  current_board_name?: string | null;
  current_board_id?: string | null;
}

export interface BoardCandidate {
  id: string;
  name: string;
  score: number;
  ctr: number;
  saveRate: number;
  purchaseRate: number;
  keywordMatch: number;
  sampleSize: number;
  classification: string | null;
}

export interface BoardPick {
  picked: BoardCandidate | null;
  alternatives: BoardCandidate[];
  reason: string;
  migrated: boolean; // true when chosen board differs from current
}

const STOP = new Set(["the","a","an","and","for","with","of","to","in","on","best","top","my"]);

function tokenize(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Score = 0.35·ctr + 0.25·saveRate + 0.25·purchaseRate + 0.15·keywordMatch
 * All rates clamped to [0,1] via *100 normalization where applicable.
 * If no performance data, keywordMatch dominates (cold-start).
 */
export async function pickBestBoard(
  sb: any,
  input: BoardPickInput,
  opts: { migrationDelta?: number; topN?: number } = {},
): Promise<BoardPick> {
  const migrationDelta = opts.migrationDelta ?? 0.08; // require ≥8 pts edge
  const topN = opts.topN ?? 5;

  const { data: boards } = await sb
    .from("pinterest_boards")
    .select("id, name, is_blacklisted, is_sandbox, production_verified, pin_count")
    .eq("is_blacklisted", false)
    .eq("is_sandbox", false);

  const eligible = (boards ?? []).filter((b: any) => b.id && b.name);
  if (eligible.length === 0) {
    return { picked: null, alternatives: [], reason: "no_eligible_boards", migrated: false };
  }

  const { data: perf } = await sb
    .from("pinterest_board_performance")
    .select("board_id, board_name, impressions_30d, clicks_30d, saves_30d, purchases_30d, ctr, purchase_rate, classification");

  const perfByName = new Map<string, any>();
  const perfById = new Map<string, any>();
  for (const p of perf ?? []) {
    if (p.board_id) perfById.set(String(p.board_id), p);
    if (p.board_name) perfByName.set(p.board_name, p);
  }

  const productTokens = new Set<string>([
    ...tokenize(input.category_key),
    ...tokenize(input.niche),
    ...tokenize(input.product_name),
  ]);

  const candidates: BoardCandidate[] = eligible.map((b: any) => {
    const p = perfById.get(String(b.id)) ?? perfByName.get(b.name) ?? null;
    const impr = Number(p?.impressions_30d ?? 0);
    const saves = Number(p?.saves_30d ?? 0);
    const clicks = Number(p?.clicks_30d ?? 0);
    const purchases = Number(p?.purchases_30d ?? 0);
    const ctr = impr > 0 ? Math.min(1, clicks / impr) : 0;
    const saveRate = impr > 0 ? Math.min(1, saves / impr) : 0;
    const purchaseRate = clicks > 0 ? Math.min(1, purchases / clicks) : 0;
    const km = jaccard(productTokens, tokenize(b.name));
    const hasPerf = impr >= 50;
    // Cold-start: keyword similarity dominates; warm: perf dominates.
    const score = hasPerf
      ? 0.35 * ctr + 0.25 * saveRate + 0.25 * purchaseRate + 0.15 * km
      : 0.85 * km + 0.15 * Math.min(1, Number(b.pin_count ?? 0) / 200);
    return {
      id: String(b.id),
      name: String(b.name),
      score,
      ctr,
      saveRate,
      purchaseRate,
      keywordMatch: km,
      sampleSize: impr,
      classification: p?.classification ?? null,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  const picked = candidates[0] ?? null;
  const alternatives = candidates.slice(0, topN);

  // Migration decision: only switch when the best beats the current by ≥delta
  // OR when the current board no longer exists/eligible.
  const currentId = input.current_board_id ? String(input.current_board_id) : null;
  const currentName = input.current_board_name ?? null;
  const current = candidates.find(
    (c) => (currentId && c.id === currentId) || (currentName && c.name === currentName),
  ) ?? null;

  let reason = "cold_start_keyword_match";
  let migrated = false;
  if (!picked) {
    reason = "no_candidate";
  } else if (!current) {
    reason = currentName
      ? `current_board_ineligible:${currentName}`
      : "no_current_board_assigned";
    migrated = true;
  } else if (picked.id === current.id) {
    reason = picked.sampleSize >= 50 ? "kept_current_best_performer" : "kept_current_keyword_match";
  } else if (picked.score - current.score >= migrationDelta) {
    reason = `migrated_for_better_performance:Δ=${(picked.score - current.score).toFixed(3)}`;
    migrated = true;
  } else {
    // not enough edge → keep current
    return {
      picked: current,
      alternatives,
      reason: `kept_current_below_migration_delta:Δ=${(picked.score - current.score).toFixed(3)}`,
      migrated: false,
    };
  }

  return { picked, alternatives, reason, migrated };
}

/**
 * Lightweight pre-publish URL quality probe. Performs ONE GET, follows
 * redirects, then inspects HTML for OpenGraph + JSON-LD presence. Returns
 * structured signals (no DB writes).
 */
export interface UrlQuality {
  ok: boolean;
  http_status: number;
  load_ms: number;
  final_url: string;
  redirected: boolean;
  has_og: boolean;
  has_schema: boolean;
  has_canonical: boolean;
  mobile_viewport: boolean;
  rich_pin_ready: boolean;
  reason?: string;
}

export async function probeUrlQuality(url: string, timeoutMs = 4000): Promise<UrlQuality> {
  const empty: UrlQuality = {
    ok: false,
    http_status: 0,
    load_ms: 0,
    final_url: url,
    redirected: false,
    has_og: false,
    has_schema: false,
    has_canonical: false,
    mobile_viewport: false,
    rich_pin_ready: false,
  };
  if (!url) return { ...empty, reason: "missing_url" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "GetPawsyPinAudit/1.1 (+pinterest)" },
    });
    const load_ms = Date.now() - started;
    const finalUrl = r.url || url;
    let html = "";
    if (r.headers.get("content-type")?.includes("text/html")) {
      html = (await r.text()).slice(0, 200_000);
    } else {
      await r.arrayBuffer().catch(() => null);
    }
    const has_og = /<meta\s+[^>]*property=["']og:/i.test(html);
    const has_schema = /application\/ld\+json/i.test(html);
    const has_canonical = /<link\s+[^>]*rel=["']canonical["']/i.test(html);
    const mobile_viewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html);
    const rich_pin_ready = has_og && has_schema;
    return {
      ok: r.ok && r.status >= 200 && r.status < 300,
      http_status: r.status,
      load_ms,
      final_url: finalUrl,
      redirected: finalUrl !== url,
      has_og,
      has_schema,
      has_canonical,
      mobile_viewport,
      rich_pin_ready,
      reason: r.ok ? undefined : `http_${r.status}`,
    };
  } catch (e) {
    return { ...empty, load_ms: Date.now() - started, reason: `probe_error:${(e as Error).message?.slice(0, 60)}` };
  } finally {
    clearTimeout(t);
  }
}