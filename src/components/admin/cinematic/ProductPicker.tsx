import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, ImageOff, AlertTriangle } from "lucide-react";

export type PickerProduct = {
  slug: string;
  name: string;
  image_url: string | null;
  images: string[] | null;
  price: number | null;
  category: string | null;
  is_active?: boolean | null;
  stock?: number | null;
  last_inventory_sync_at?: string | null;
};

type Props = {
  value?: PickerProduct | null;
  onChange: (p: PickerProduct | null) => void;
};

export default function ProductPicker({ value, onChange }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Debounced search against products_public view.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("slug, name, image_url, images, price, category, stock, is_active, last_inventory_sync_at")
        .or(`name.ilike.%${term}%,slug.ilike.%${term}%,category.ilike.%${term}%`)
        .limit(20);
      if (!error && data) setResults(data as PickerProduct[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const imgCount = (p: PickerProduct) =>
    Math.max(p.image_url ? 1 : 0, Array.isArray(p.images) ? p.images.filter(Boolean).length : 0);

  const warningFor = (p: PickerProduct): string | null => {
    if (!p.image_url) return "No image";
    if (imgCount(p) < 2) return "Thin media (1 image)";
    return null;
  };

  const STALE_MS = 12 * 60 * 60 * 1000;
  const stockInfo = (p: PickerProduct) => {
    const stock = typeof p.stock === "number" ? p.stock : null;
    const syncedAt = p.last_inventory_sync_at ? new Date(p.last_inventory_sync_at) : null;
    const ageMs = syncedAt ? Date.now() - syncedAt.getTime() : null;
    const stale = ageMs === null || ageMs > STALE_MS;
    const oos = stock !== null && stock <= 0;
    return { stock, syncedAt, ageMs, stale, oos };
  };
  const fmtAge = (ms: number | null) => {
    if (ms === null) return "never";
    const h = Math.floor(ms / 3_600_000);
    if (h < 1) return `${Math.floor(ms / 60_000)}m ago`;
    if (h < 48) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="Search by name, slug, or category…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {loading && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {open && results.length > 0 && (
        <div className="border rounded-lg max-h-72 overflow-auto divide-y bg-background">
          {results.map((p) => {
            const warn = warningFor(p);
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => { onChange(p); setOpen(false); setQ(p.name); }}
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-3"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-10 h-10 object-cover rounded" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center"><ImageOff className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    /{p.slug} · {p.category ?? "—"} · ${p.price ?? "—"} · {imgCount(p)} img
                  </div>
                </div>
                {warn && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <AlertTriangle className="w-3 h-3 mr-1" />{warn}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      {value && (
        <div className="border rounded-lg p-3 flex items-center gap-3 bg-muted/30">
          {value.image_url ? (
            <img src={value.image_url} alt="" className="w-14 h-14 object-cover rounded" />
          ) : (
            <div className="w-14 h-14 rounded bg-muted flex items-center justify-center"><ImageOff className="w-5 h-5 text-muted-foreground" /></div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{value.name}</div>
            <div className="text-xs text-muted-foreground truncate">/{value.slug}</div>
            <div className="text-xs mt-0.5 flex gap-2 flex-wrap">
              <Badge variant="secondary">${value.price ?? "—"}</Badge>
              <Badge variant="outline">{value.category ?? "uncategorized"}</Badge>
              <Badge variant="outline">{imgCount(value)} images</Badge>
            {(() => {
              const s = stockInfo(value);
              return (
                <>
                  <Badge
                    variant="outline"
                    className={s.oos ? "text-red-600 border-red-300" : "text-emerald-700 border-emerald-300"}
                  >
                    {s.stock === null ? "stock: —" : `stock: ${s.stock}`}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={s.stale ? "text-amber-600 border-amber-300" : "text-muted-foreground"}
                    title={s.syncedAt ? s.syncedAt.toISOString() : "no CJ inventory sync recorded"}
                  >
                    {s.stale && <AlertTriangle className="w-3 h-3 mr-1" />}
                    CJ synced {fmtAge(s.ageMs)}
                  </Badge>
                </>
              );
            })()}
              {warningFor(value) && (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertTriangle className="w-3 h-3 mr-1" />{warningFor(value)}
                </Badge>
              )}
            </div>
          </div>
          <button className="text-xs text-muted-foreground underline" onClick={() => onChange(null)}>clear</button>
        </div>
      )}
    </div>
  );
}
