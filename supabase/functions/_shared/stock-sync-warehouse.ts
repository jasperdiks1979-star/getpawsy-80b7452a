import { readCJStockQuantity } from "./stock-sync-rate-limit.ts";

type Observation = {
  stock: number | null;
  confirmed: boolean;
  warehouse: string;
  status: "ok" | "no_data";
  message: string;
};

export function warehouseObservation(rows: unknown): Observation {
  const unknown = (message: string): Observation => ({
    stock: null, confirmed: false, warehouse: "unknown", status: "no_data", message,
  });
  if (!Array.isArray(rows) || rows.length === 0) return unknown("Missing CJ warehouse inventory");
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (typeof row?.countryCode !== "string" || !/^[A-Z]{2}$/.test(row.countryCode)) {
      return unknown("Missing or invalid CJ warehouse country");
    }
    const quantity = readCJStockQuantity(row.totalInventoryNum, row.cjInventoryNum);
    const total = (totals.get(row.countryCode) ?? 0) + quantity;
    if (!Number.isSafeInteger(total)) return unknown("Invalid CJ warehouse total");
    totals.set(row.countryCode, total);
  }
  // Keep the existing US preference, including when CJ explicitly reports zero.
  let warehouse: string;
  if (totals.has("US")) warehouse = "US";
  else if ((totals.get("CN") ?? 0) > 0) warehouse = "CN";
  else if (totals.size === 1) warehouse = rows[0].countryCode;
  else return unknown("No single fallback warehouse identified");
  const stock = totals.get(warehouse)!;
  return { stock, confirmed: true, warehouse, status: "ok", message: `Stock confirmed: ${stock} (${warehouse})` };
}
