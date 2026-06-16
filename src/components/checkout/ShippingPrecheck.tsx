import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  SUPPORTED_COUNTRIES,
  checkCartShipping,
  type CartShippingCheck,
  type CountryCode,
} from "@/lib/cj-shipping-matrix";

interface CartItemLite {
  id: string;
  name: string;
}

interface Props {
  items: CartItemLite[];
  onChange?: (state: {
    country: CountryCode;
    check: CartShippingCheck | null;
    loading: boolean;
  }) => void;
}

/**
 * Pre-checkout shipping gate.
 *
 * Loads each cart product's CJ warehouse, lets the shopper pick a destination
 * country, then runs `checkCartShipping`. Blocks the Pay button (via the
 * parent's `onChange` callback) when any product can't be fulfilled.
 */
export function ShippingPrecheck({ items, onChange }: Props) {
  const [country, setCountry] = useState<CountryCode>("US");
  const [warehouses, setWarehouses] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  const productIds = useMemo(() => {
    const ids = new Set<string>();
    for (const it of items) {
      // Cart IDs can be `${uuid}-${variant}` or `${uuid}_${variant}` — extract uuid.
      const m = it.id.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      if (m) ids.add(m[1].toLowerCase());
    }
    return Array.from(ids);
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    if (productIds.length === 0) {
      setWarehouses({});
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, supplier_warehouse")
        .in("id", productIds);
      if (cancelled) return;
      const map: Record<string, string | null> = {};
      for (const row of data || []) {
        map[(row as { id: string }).id] = (row as { supplier_warehouse: string | null })
          .supplier_warehouse;
      }
      setWarehouses(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productIds.join(",")]);

  const check = useMemo<CartShippingCheck | null>(() => {
    if (loading) return null;
    const lines = items.map((it) => {
      const m = it.id.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );
      const pid = m ? m[1].toLowerCase() : it.id;
      return {
        productId: pid,
        name: it.name,
        warehouse: warehouses[pid] ?? null,
      };
    });
    return checkCartShipping(lines, country);
  }, [items, warehouses, country, loading]);

  useEffect(() => {
    onChange?.({ country, check, loading });
  }, [country, check, loading, onChange]);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4" />
        Shipping destination
      </div>
      <div>
        <label htmlFor="ship-country" className="sr-only">
          Ship to
        </label>
        <select
          id="ship-country"
          value={country}
          onChange={(e) => setCountry(e.target.value as CountryCode)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.name}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Checking availability…</p>
      ) : check?.ok ? (
        <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Delivery available</p>
            <p className="text-xs text-muted-foreground">
              Estimated {check.daysMin}–{check.daysMax} business days · standard shipping
              {" "}
              {/* Customer charge is the storefront flat rate ($5.99 / free over $35) */}
            </p>
          </div>
        </div>
      ) : check ? (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">
              We can't ship {check.blocked.length === 1 ? "this item" : "these items"} to
              {" "}
              {SUPPORTED_COUNTRIES.find((c) => c.code === country)?.name}.
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-4">
              {check.blocked.slice(0, 4).map((b) => (
                <li key={b.productId}>{b.name}</li>
              ))}
            </ul>
            <p className="text-xs">
              Remove the item(s) above or pick a different shipping country to continue.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ShippingPrecheck;