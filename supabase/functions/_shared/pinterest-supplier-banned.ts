// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Supplier / Compliance Content Blocklist (ALWAYS-ON QUALITY GATE)
// ─────────────────────────────────────────────────────────────────────────────
// Hard publication block for any creative whose copy, overlay text, prompt,
// asset filename, or source URL references supplier marketing slides,
// certificates, manuals, factory imagery, or AliExpress / CJ-style graphics.
// Detected pins MUST be flagged status=rejected, reason=QUALITY_GATE_BLOCKED.

export const PINTEREST_SUPPLIER_BANNED_TERMS: readonly string[] = [
  "certificate",
  "conformity",
  "certification",
  " ce ",
  "(ce)",
  "ce mark",
  "fcc",
  "rohs",
  "test report",
  "approval",
  "compliance",
  "user manual",
  "instruction",
  "instructions",
  "package contents",
  "specification",
  "specifications",
  "dimensions",
  "warehouse photo",
  "warehouse picture",
  "supplier presentation",
  "factory image",
  "factory photo",
  "aliexpress",
  "cjdropshipping",
  "cj dropshipping",
  "cj-dropshipping",
  "product sku",
  "sku:",
  // CJK ranges flagged by code-point sweep below; this entry exists so the
  // term shows up in human reports.
  "chinese characters",
] as const;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function normalize(value: unknown): string {
  return ` ${String(value ?? "").toLowerCase().replace(/[_\-\/.+]/g, " ").replace(/\s+/g, " ").trim()} `;
}

export type SupplierBannedHit = { field: string; term: string; sample: string };

export function containsSupplierBanned(value: unknown): string | null {
  const raw = String(value ?? "");
  if (CJK_RE.test(raw)) return "chinese characters";
  const text = normalize(raw);
  if (!text.trim()) return null;
  for (const term of PINTEREST_SUPPLIER_BANNED_TERMS) {
    if (text.includes(term)) return term.trim();
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