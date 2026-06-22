// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Supplier / Compliance Content Blocklist (ALWAYS-ON QUALITY GATE)
// ─────────────────────────────────────────────────────────────────────────────
// Hard publication block for any creative whose copy, overlay text, prompt,
// asset filename, or source URL references supplier marketing slides,
// certificates, manuals, factory imagery, or AliExpress / CJ-style graphics.
// Detected pins MUST be flagged status=rejected, reason=QUALITY_GATE_BLOCKED.

// Each term is matched as a *whole word* against normalized text. Short tokens
// (ce/fcc/rohs/sku) MUST be word-bounded — never substring — to avoid matching
// inside UUIDs, storage filenames, or English words.
export const PINTEREST_SUPPLIER_BANNED_TERMS: readonly string[] = [
  "certificate",
  "certificates",
  "conformity",
  "certification",
  "ce mark",
  "ce marking",
  "fcc certified",
  "fcc approved",
  "rohs",
  "test report",
  "test reports",
  "user manual",
  "user instructions",
  "instruction manual",
  "package contents",
  "package content",
  "product specification",
  "product specifications",
  "warehouse photo",
  "warehouse picture",
  "supplier presentation",
  "factory image",
  "factory photo",
  "factory picture",
  "aliexpress",
  "cjdropshipping",
  "cj dropshipping",
  "cj-dropshipping",
  "product sku",
  "sku code",
  "chinese characters",
] as const;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

// Compiled once per process: each term becomes a word-boundary regex.
const TERM_RES: ReadonlyArray<{ term: string; re: RegExp }> = PINTEREST_SUPPLIER_BANNED_TERMS.map(
  (t) => ({ term: t, re: new RegExp(`(?:^|[^a-z0-9])${escapeRe(t)}(?:[^a-z0-9]|$)`, "i") }),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Hosts that store our own rehosted media (UUID filenames may contain "fcc"
// etc.) — never scan their path/query for banned substrings, only their HTML
// metadata via separate fields.
const SAFE_HOSTS = [
  "supabase.co",
  "supabase.in",
  "getpawsy.pet",
  "getpawsy.lovable.app",
];

function isSafeHostUrl(value: unknown): boolean {
  const s = String(value ?? "");
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const host = new URL(s).hostname.toLowerCase();
    return SAFE_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export type SupplierBannedHit = { field: string; term: string; sample: string };

export function containsSupplierBanned(value: unknown): string | null {
  const raw = String(value ?? "");
  if (!raw) return null;
  if (CJK_RE.test(raw)) return "chinese characters";
  // URL-shaped strings on our own infra: skip — opaque storage paths.
  if (isSafeHostUrl(raw)) return null;
  for (const { term, re } of TERM_RES) {
    if (re.test(raw)) return term;
  }
  return null;
}

/** Scan an arbitrary record (pin queue row, video queue row, etc.). */
export function collectSupplierBannedHits(
  row: Record<string, unknown>,
  extraFields: string[] = [],
): SupplierBannedHit[] {
  const meta = (row?.meta && typeof row.meta === "object") ? row.meta as Record<string, unknown> : {};
  const fields: Record<string, unknown> = {
    title: row.pin_title ?? row.title,
    description: row.pin_description ?? row.description,
    overlay_text: row.overlay_text,
    cta: row.cta_text ?? row.cta,
    image_url: row.pin_image_url ?? row.image_url ?? row.public_url ?? row.cover_image_url,
    asset_filename: row.filename,
    asset_path: row.storage_path,
    destination: row.destination_link ?? row.destination_url ?? row.external_url,
    last_skip_reason: row.last_skip_reason,
    meta_blob: row.meta ? safeStringify(row.meta) : "",
  };
  for (const k of extraFields) fields[k] = (row as Record<string, unknown>)[k];
  // Also scan common nested meta keys.
  for (const k of ["prompt", "image_prompt", "generated_image_prompt", "source_url", "supplier_url", "scene"]) {
    if (meta[k] != null) fields[`meta.${k}`] = meta[k];
  }

  const hits: SupplierBannedHit[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const term = containsSupplierBanned(value);
    if (term) hits.push({ field, term, sample: String(value ?? "").slice(0, 240) });
  }
  return hits;
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return ""; }
}

export const QUALITY_GATE_REJECT_REASON = "QUALITY_GATE_BLOCKED";

export function rejectReasonFromHits(hits: SupplierBannedHit[]): string {
  if (!hits.length) return QUALITY_GATE_REJECT_REASON;
  const summary = hits.slice(0, 3).map((h) => `${h.field}:${h.term}`).join(",");
  return `${QUALITY_GATE_REJECT_REASON} (${summary})`;
}