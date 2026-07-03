// Phase 20 — Product Identity Graph (PIG) / Visual Truth API
//
// The ONE authoritative library every publisher, repair worker, AI worker,
// analytics engine, and dashboard queries to answer:
//   "Does this image / video / pin belong to this exact commercial product?"
//
// Extends — never duplicates — VPI, PRE, PEI Creative DNA, Master Creative
// Sync, CJ Inventory, Pinterest Integrity Guard and Pinterest Repair.
//
// Storage:
//   • pig_nodes           — every product/image/video/pin/creative
//   • pig_edges           — typed relationships (belongs_to, hero_of, ...)
//   • pig_visual_dna      — immutable per-asset DNA
//   • pig_certifications  — per (product,node,role) certification state
//   • pig_duplicates      — duplicate registry
//   • pig_runs            — sweep telemetry
//   • pig_settings        — engine config
//
// Server-side only. Callers pass a service-role Supabase client.

import {
  evaluateVisualIdentity,
  cachedVisualIdentity,
  type VpiInput,
  type VpiVerdict,
} from "./visual-product-identity.ts";

export type PigNodeKind =
  | "product" | "image" | "video" | "pinterest_pin"
  | "ai_creative" | "cj_image" | "gallery_image" | "hero_image" | "pdp_image";

export type PigMatchKind = "exact" | "variant" | "family" | "wrong" | "duplicate" | "unknown";

export type PigNodeInput = {
  kind: PigNodeKind;
  product_id?: string | null;
  external_id?: string | null;
  source: string;
  url?: string | null;
  metadata?: Record<string, unknown>;
};

export type PigSettings = {
  enabled: boolean;
  minIdentityScore: number;
  blockPublishOnFail: boolean;
  autoHeroPromote: boolean;
  duplicatePhashThreshold: number;
};

const DEFAULT_SETTINGS: PigSettings = {
  enabled: true,
  minIdentityScore: 99,
  blockPublishOnFail: true,
  autoHeroPromote: true,
  duplicatePhashThreshold: 6,
};

export async function getPigSettings(supabase: any): Promise<PigSettings> {
  try {
    const { data } = await supabase.from("pig_settings").select("key,value");
    const map: Record<string, unknown> = {};
    for (const r of (data ?? [])) map[(r as any).key] = (r as any).value;
    return {
      enabled: map.enabled !== false,
      minIdentityScore: Number(map.min_identity_score ?? 99) || 99,
      blockPublishOnFail: map.block_publish_on_fail !== false,
      autoHeroPromote: map.auto_hero_promote !== false,
      duplicatePhashThreshold: Number(map.duplicate_phash_threshold ?? 6) || 6,
    };
  } catch { return DEFAULT_SETTINGS; }
}

// ---------- content hash (deterministic, no crypto import) ----------
export function urlHash(url: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

// ---------- graph mutation ----------
export async function upsertNode(supabase: any, n: PigNodeInput): Promise<string | null> {
  const url = n.url && /^https?:\/\//i.test(n.url) ? n.url : null;
  const content_hash = url ? urlHash(url) : null;
  const row = {
    kind: n.kind,
    product_id: n.product_id ?? null,
    external_id: n.external_id ?? null,
    source: n.source,
    url,
    content_hash,
    metadata: n.metadata ?? {},
  };
  try {
    if (url) {
      // dedup on (kind,url)
      const { data: existing } = await supabase
        .from("pig_nodes")
        .select("id")
        .eq("kind", n.kind)
        .eq("url", url)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from("pig_nodes").update({
          product_id: row.product_id, source: row.source,
          external_id: row.external_id, metadata: row.metadata,
        }).eq("id", existing.id);
        return existing.id as string;
      }
    }
    const { data, error } = await supabase.from("pig_nodes").insert(row).select("id").maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  } catch { return null; }
}

export async function upsertEdge(
  supabase: any,
  from_node: string, to_node: string,
  kind: string, confidence = 100, metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("pig_edges").upsert(
      { from_node, to_node, kind, confidence, metadata },
      { onConflict: "from_node,to_node,kind" },
    );
  } catch { /* noop */ }
}

// ---------- DNA extraction (deterministic — no AI credits required) ----------
export type PigDnaLite = {
  perceptual_hash: string;
  palette_key: string;
  shape_signature: string;
};

export function deriveDnaLite(url: string, metadata: Record<string, unknown> = {}): PigDnaLite {
  const h = urlHash(url);
  const meta = JSON.stringify(metadata);
  return {
    perceptual_hash: h,
    palette_key: urlHash(`${h}:${(metadata as any).colors ?? ""}`),
    shape_signature: urlHash(`${h}:${meta.length}`),
  };
}

export async function persistDnaLite(
  supabase: any, node_id: string, url: string, metadata: Record<string, unknown> = {},
): Promise<void> {
  const lite = deriveDnaLite(url, metadata);
  try {
    await supabase.from("pig_visual_dna").upsert(
      { node_id, ...lite },
      { onConflict: "node_id" },
    );
  } catch { /* noop */ }
}

// ---------- certification ----------
export type CertifyInput = {
  product_id: string;
  product_slug: string;
  product_name: string;
  node_id: string;
  asset_url: string;
  role: "hero" | "gallery" | "pinterest_hero" | "video" | "ai_creative" | "cj_original";
  pinterest_pin_id?: string | null;
  pin_queue_id?: string | null;
  destination_link?: string | null;
  source?: string;
  pre_score?: number | null;
  quality_score?: number | null;
  useCache?: boolean;
};

export type CertifyResult = {
  cert_id: string | null;
  passed: boolean;
  identity_score: number;
  match_kind: PigMatchKind;
  revenue_risk: number;
  from_cache: boolean;
  verdict?: VpiVerdict;
  reason?: string;
};

function riskScore(identity: number, role: string): number {
  // Higher-visibility roles carry more revenue risk on mismatch.
  const roleWeight: Record<string, number> = {
    pinterest_hero: 1.0, hero: 0.9, gallery: 0.55, ai_creative: 0.6,
    video: 0.75, cj_original: 0.35,
  };
  const gap = Math.max(0, 99 - identity);
  return Math.round(gap * (roleWeight[role] ?? 0.5) * 100) / 100;
}

function verdictToMatchKind(v: VpiVerdict): PigMatchKind {
  if (v.passed) return "exact";
  switch (v.wrong_product_kind) {
    case "different_variant":
    case "different_color":
    case "different_platform_count":
    case "different_material": return "variant";
    case "different_family":
    case "different_model":
    case "different_sku":     return "wrong";
    case "unknown_object":    return "unknown";
    default:                  return v.identity_score >= 90 ? "family" : "wrong";
  }
}

/**
 * The Visual Truth API. Every gate calls THIS to certify an asset↔product.
 * Uses VPI cache when available; otherwise runs a fresh certification (Layer B).
 */
export async function certifyAssetForProduct(
  supabase: any,
  input: CertifyInput,
): Promise<CertifyResult> {
  const settings = await getPigSettings(supabase);
  if (!settings.enabled) {
    return { cert_id: null, passed: true, identity_score: 100, match_kind: "exact", revenue_risk: 0, from_cache: false, reason: "pig_disabled" };
  }

  // 1) Try cache from existing VPI ledger
  let verdict: VpiVerdict | undefined;
  let fromCache = false;
  if (input.useCache !== false) {
    const cached = await cachedVisualIdentity(supabase, input.product_id, input.asset_url);
    if (cached) {
      fromCache = true;
      // Reconstruct minimal verdict — passed + score are enough for gating
      verdict = {
        passed: cached.passed,
        same_product: cached.passed,
        identity_score: Number(cached.identity_score) || 0,
        axes: { shape: 0, structure: 0, material: 0, color: 0, platform: 0, accessory: 0, scale: 0, geometry: 0, species: 0, furniture: 0, usage: 0, environment: 0, hero: 0 },
        best_reference_image: null,
        differences: [],
        wrong_product_kind: cached.passed ? "none" : "different_variant",
        recommended_action: cached.passed ? "certify" : "manual_review",
        latency_ms: 0,
        model: "cache",
      };
    }
  }

  // 2) Fresh run when no cache
  if (!verdict) {
    const vpiInput: VpiInput = {
      product_id: input.product_id,
      product_slug: input.product_slug,
      product_name: input.product_name,
      pin_image_url: input.asset_url,
      pin_queue_id: input.pin_queue_id ?? null,
      pinterest_pin_id: input.pinterest_pin_id ?? null,
      destination_link: input.destination_link ?? null,
      source: input.source ?? "pig",
    };
    verdict = await evaluateVisualIdentity(supabase, vpiInput);
  }

  const matchKind = verdictToMatchKind(verdict);
  const passed = verdict.identity_score >= settings.minIdentityScore && verdict.passed;
  const revenue_risk = riskScore(verdict.identity_score, input.role);

  // 3) Persist certification
  let cert_id: string | null = null;
  try {
    const { data } = await supabase.from("pig_certifications").upsert({
      product_id: input.product_id,
      node_id: input.node_id,
      role: input.role,
      match_kind: matchKind,
      identity_score: verdict.identity_score,
      pre_score: input.pre_score ?? null,
      quality_score: input.quality_score ?? null,
      revenue_risk,
      passed,
      evidence: {
        wrong_product_kind: verdict.wrong_product_kind,
        recommended_action: verdict.recommended_action,
        differences: verdict.differences,
        best_reference_image: verdict.best_reference_image,
        from_cache: fromCache,
        model: verdict.model,
      },
      certified_at: passed ? new Date().toISOString() : null,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    }, { onConflict: "product_id,node_id,role" }).select("id").maybeSingle();
    cert_id = data?.id ?? null;
  } catch { /* noop */ }

  return { cert_id, passed, identity_score: verdict.identity_score, match_kind: matchKind, revenue_risk, from_cache: fromCache, verdict };
}

// ---------- Visual Truth lookup (fast, cached) ----------
export type VisualTruth = {
  certified: boolean;
  identity_score: number;
  match_kind: PigMatchKind;
  role: string | null;
  revenue_risk: number;
  certified_at: string | null;
  reason?: string;
};

/**
 * Public read-side API. Given a (product, asset_url) pair returns the current
 * Visual Truth certification. Callers must respect `certified === false` and
 * fail closed. This function makes NO AI calls — pure DB read.
 */
export async function readVisualTruth(
  supabase: any, productId: string, assetUrl: string,
): Promise<VisualTruth> {
  const settings = await getPigSettings(supabase);
  if (!settings.enabled) return { certified: true, identity_score: 100, match_kind: "exact", role: null, revenue_risk: 0, certified_at: null, reason: "pig_disabled" };
  try {
    const { data: node } = await supabase
      .from("pig_nodes").select("id").eq("url", assetUrl).limit(1).maybeSingle();
    if (!node?.id) return { certified: false, identity_score: 0, match_kind: "unknown", role: null, revenue_risk: 0, certified_at: null, reason: "node_not_found" };
    const { data: cert } = await supabase
      .from("pig_certifications")
      .select("passed,identity_score,match_kind,role,revenue_risk,certified_at,expires_at")
      .eq("product_id", productId).eq("node_id", node.id)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (!cert) return { certified: false, identity_score: 0, match_kind: "unknown", role: null, revenue_risk: 0, certified_at: null, reason: "no_certification" };
    const expired = cert.expires_at && new Date(cert.expires_at).getTime() < Date.now();
    return {
      certified: !!cert.passed && !expired && cert.identity_score >= settings.minIdentityScore,
      identity_score: Number(cert.identity_score) || 0,
      match_kind: (cert.match_kind ?? "unknown") as PigMatchKind,
      role: cert.role ?? null,
      revenue_risk: Number(cert.revenue_risk) || 0,
      certified_at: cert.certified_at ?? null,
      reason: expired ? "cert_expired" : undefined,
    };
  } catch (e) {
    return { certified: false, identity_score: 0, match_kind: "unknown", role: null, revenue_risk: 0, certified_at: null, reason: `read_error:${(e as Error).message}` };
  }
}

// ---------- duplicate detection (deterministic) ----------
export async function registerDuplicateIfHashMatch(
  supabase: any, node_id: string, content_hash: string,
): Promise<{ primary_node: string | null; registered: boolean }> {
  try {
    const { data } = await supabase
      .from("pig_nodes")
      .select("id,created_at")
      .eq("content_hash", content_hash)
      .neq("id", node_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data?.id) return { primary_node: null, registered: false };
    await supabase.from("pig_duplicates").upsert({
      primary_node: data.id, duplicate_node: node_id, similarity: 1.0, method: "url_hash",
    }, { onConflict: "primary_node,duplicate_node" });
    await upsertEdge(supabase, node_id, data.id, "duplicate_of", 100, { method: "url_hash" });
    return { primary_node: data.id, registered: true };
  } catch { return { primary_node: null, registered: false }; }
}

// ---------- run bookkeeping ----------
export async function startRun(supabase: any, kind: string, triggered_by = "manual"): Promise<string | null> {
  try {
    const { data } = await supabase.from("pig_runs").insert({ run_kind: kind, triggered_by }).select("id").maybeSingle();
    return data?.id ?? null;
  } catch { return null; }
}

export async function finishRun(
  supabase: any, id: string | null, status: "completed" | "failed", stats: Record<string, unknown>, errors: unknown[] = [],
): Promise<void> {
  if (!id) return;
  try {
    await supabase.from("pig_runs").update({
      status, finished_at: new Date().toISOString(), stats, errors,
    }).eq("id", id);
  } catch { /* noop */ }
}