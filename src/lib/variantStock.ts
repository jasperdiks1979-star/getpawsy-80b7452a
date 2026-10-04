// Mirrors supabase/functions/_shared/order-state.ts variantStockOf:
// per-warehouse (US) inventory wins over the flat variant stock field.
export function variantStockOf(variant: unknown, countryCode = "US"): number | null {
  if (!variant || typeof variant !== "object") return null;
  const v = variant as Record<string, unknown>;
  if (Array.isArray(v.inventories)) {
    let best: number | null = null;
    for (const e of v.inventories) {
      if (!e || typeof e !== "object") continue;
      const r = e as Record<string, unknown>;
      if (String(r.countryCode ?? "").toUpperCase() !== countryCode) continue;
      for (const k of ["totalInventory", "cjInventory", "inventoryNum", "storageNum"]) {
        const n = Number(r[k]);
        if (Number.isFinite(n)) best = best === null ? n : Math.max(best, n);
      }
    }
    if (best !== null) return best;
  }
  for (const k of ["variantStock", "stock", "quantity", "inventory"]) {
    const raw = v[k];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  }
  return null;
}
