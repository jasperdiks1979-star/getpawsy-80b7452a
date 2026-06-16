import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";

type ProductRow = {
  id: string;
  slug: string | null;
  name: string | null;
  stock: number | null;
  availability: string | null;
  is_active: boolean | null;
};

type PinRow = {
  product_slug: string | null;
  status: string | null;
  rejection_reason: string | null;
};

const REASON_CATEGORIES: { key: string; label: string }[] = [
  { key: "product_oos", label: "OOS" },
  { key: "diversity_cleanup_safe_remove", label: "Diversity" },
  { key: "governor:max_per_board_per_slug", label: "Per Board/Slug" },
  { key: "creative_mismatch", label: "Creative Mismatch" },
  { key: "live_pin_category_repair_replaced", label: "Category Repair" },
  { key: "other", label: "Other / Unlabeled" },
];

function normalizeReason(reason: string | null): string {
  if (!reason) return "other";
  const r = reason.toLowerCase().trim();
  if (r.includes("oos")) return "product_oos";
  if (r === "diversity_cleanup_safe_remove") return "diversity_cleanup_safe_remove";
  if (r === "governor:max_per_board_per_slug") return "governor:max_per_board_per_slug";
  if (r === "creative_mismatch") return "creative_mismatch";
  if (r === "live_pin_category_repair_replaced") return "live_pin_category_repair_replaced";
  return "other";
}

type Aggregate = {
  slug: string;
  name: string;
  stock: number;
  availability: string;
  queued: number;
  posted: number;
  rejected: number;
  rejected_oos: number;
  total: number;
  reasons: Record<string, number>;
};

export default function PinterestStockStatusPage() {
  const [pins, setPins] = useState<PinRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [oosFilter, setOosFilter] = useState<"oos" | "all">("oos");
  const [activeReasons, setActiveReasons] = useState<Set<string>>(
    () => new Set(REASON_CATEGORIES.map((c) => c.key)),
  );
  const [reasonFilterMode, setReasonFilterMode] = useState<"show" | "hide">("show");

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: pinData, error: pinErr } = await supabase
        .from("pinterest_pin_queue")
        .select("product_slug,status,rejection_reason,meta,pin_image_url")
        .or(
          "meta->>creative_source.eq.creative_director_v2,pin_image_url.ilike.%/creative-director/%",
        )
        .limit(5000);
      if (pinErr) throw pinErr;

      const slugs = Array.from(
        new Set((pinData ?? []).map((p: any) => p.product_slug).filter(Boolean)),
      ) as string[];

      let prodData: ProductRow[] = [];
      if (slugs.length) {
        const { data, error } = await supabase
          .from("products")
          .select("id,slug,name,stock,availability,is_active")
          .in("slug", slugs);
        if (error) throw error;
        prodData = (data ?? []) as any;
      }

      setPins(pinData as any);
      setProducts(prodData);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows: Aggregate[] = useMemo(() => {
    const bySlug = new Map<string, Aggregate>();
    const prodBySlug = new Map<string, ProductRow>();
    for (const p of products) if (p.slug) prodBySlug.set(p.slug, p);

    for (const pin of pins) {
      const slug = pin.product_slug;
      if (!slug) continue;
      const prod = prodBySlug.get(slug);
      const cur =
        bySlug.get(slug) ?? {
          slug,
          name: prod?.name ?? slug,
          stock: Number(prod?.stock ?? 0),
          availability: prod?.availability ?? "unknown",
          queued: 0,
          posted: 0,
          rejected: 0,
          rejected_oos: 0,
          total: 0,
          reasons: {},
        };
      cur.total += 1;
      if (pin.status === "queued") cur.queued += 1;
      else if (pin.status === "posted") cur.posted += 1;
      else if (pin.status === "rejected" || pin.status === "failed") {
        cur.rejected += 1;
        const cat = normalizeReason(pin.rejection_reason);
        cur.reasons[cat] = (cur.reasons[cat] ?? 0) + 1;
        if (cat === "product_oos") cur.rejected_oos += 1;
      }
      bySlug.set(slug, cur);
    }
    return Array.from(bySlug.values()).sort(
      (a, b) => b.queued + b.rejected - (a.queued + a.rejected),
    );
  }, [pins, products]);

  const visible = useMemo(() => {
    let list = rows;
    if (oosFilter === "oos") {
      list = list.filter(
        (r) => r.stock === 0 || r.availability === "out of stock",
      );
    }
    if (reasonFilterMode === "show") {
      list = list.filter((r) =>
        Array.from(activeReasons).some((key) => (r.reasons[key] ?? 0) > 0),
      );
    } else {
      list = list.filter(
        (r) =>
          !Array.from(activeReasons).some((key) => (r.reasons[key] ?? 0) > 0),
      );
    }
    return list;
  }, [rows, oosFilter, activeReasons, reasonFilterMode]);

  const totals = useMemo(() => {
    const t = {
      oosProducts: 0,
      queued: 0,
      rejected: 0,
      rejected_oos: 0,
      reasons: {} as Record<string, number>,
    };
    for (const r of rows) {
      const isOos = r.stock === 0 || r.availability === "out of stock";
      if (isOos) {
        t.oosProducts += 1;
        t.queued += r.queued;
        t.rejected += r.rejected;
        t.rejected_oos += r.rejected_oos;
      }
      for (const [key, count] of Object.entries(r.reasons)) {
        t.reasons[key] = (t.reasons[key] ?? 0) + count;
      }
    }
    return t;
  }, [rows]);

  const toggleReason = (key: string) => {
    setActiveReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportToCsv = () => {
    const headers = [
      "Product",
      "Slug",
      "Stock",
      "Availability",
      "Queued",
      "Rejected",
      ...REASON_CATEGORIES.map((c) => c.label),
      "Posted",
      "Total",
    ];
    const lines = [
      headers.join(","),
      ...visible.map((r) =>
        [
          `"${(r.name ?? "").replace(/"/g, '""')}"`,
          r.slug,
          r.stock,
          r.availability,
          r.queued,
          r.rejected,
          ...REASON_CATEGORIES.map((c) => r.reasons[c.key] ?? 0),
          r.posted,
          r.total,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cd-stock-status-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <Helmet>
        <title>Creative Director · Stock Status</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Creative Director · Stock Status</h1>
          <p className="text-sm text-muted-foreground">
            Out-of-stock products in the CD v2 pipeline and the pins they block.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOosFilter(oosFilter === "oos" ? "all" : "oos")}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            {oosFilter === "oos" ? "Show all" : "Show OOS only"}
          </button>
          <button
            onClick={exportToCsv}
            disabled={visible.length === 0}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="OOS products" value={totals.oosProducts} />
        <Stat label="Queued pins blocked" value={totals.queued} />
        <Stat label="Rejected pins (OOS)" value={totals.rejected_oos} />
        <Stat label="Total rejected pins" value={totals.rejected} />
      </section>

      <section className="mb-4 rounded-md border border-border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Rejection reason breakdown</div>
        <div className="flex flex-wrap gap-2">
          {REASON_CATEGORIES.map((cat) => {
            const active = activeReasons.has(cat.key);
            const count = totals.reasons[cat.key] ?? 0;
            return (
              <button
                key={cat.key}
                onClick={() => toggleReason(cat.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground line-through"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
                />
                {cat.label}
                <span className="ml-0.5 font-semibold tabular-nums">
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Filter mode:</span>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="radio"
              name="reasonFilterMode"
              checked={reasonFilterMode === "show"}
              onChange={() => setReasonFilterMode("show")}
            />
            Show products with selected reasons
          </label>
          <label className="flex cursor-pointer items-center gap-1">
            <input
              type="radio"
              name="reasonFilterMode"
              checked={reasonFilterMode === "hide"}
              onChange={() => setReasonFilterMode("hide")}
            />
            Hide products with selected reasons
          </label>
        </div>
      </section>

      <section className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Avail.</th>
              <th className="px-3 py-2 text-right">Queued</th>
              <th className="px-3 py-2 text-right">Rejected</th>
              {REASON_CATEGORIES.map((cat) => (
                <th
                  key={cat.key}
                  className="px-3 py-2 text-right"
                  title={cat.key}
                >
                  {cat.label}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Posted</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={8 + REASON_CATEGORIES.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No matching products.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const isOos = r.stock === 0 || r.availability === "out of stock";
              return (
                <tr key={r.slug} className="border-t border-border">
                  <td className="px-3 py-2">
                    <a
                      href={`/products/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {r.name}
                    </a>
                    <div className="text-xs text-muted-foreground">{r.slug}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={isOos ? "text-destructive font-medium" : ""}>
                      {r.stock}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.availability}</td>
                  <td className="px-3 py-2 text-right">{r.queued}</td>
                  <td className="px-3 py-2 text-right font-medium">{r.rejected}</td>
                  {REASON_CATEGORIES.map((cat) => {
                    const count = r.reasons[cat.key] ?? 0;
                    return (
                      <td
                        key={cat.key}
                        className={`px-3 py-2 text-right ${count > 0 ? "font-medium" : "text-muted-foreground/60"}`}
                      >
                        {count > 0 ? count : "—"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">{r.posted}</td>
                  <td className="px-3 py-2 text-right">{r.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}