import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, RefreshCw, Search } from "lucide-react";

type Supplier = {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  country: string | null;
  currency: string | null;
  invoice_count: number;
  invoice_completeness_pct: number | null;
  total_paid_minor: number;
  spend_ytd_cents: number | null;
  health_score: number | null;
  risk_score: number | null;
  latest_invoice_at: string | null;
};

const fmtMinor = (m: number | null | undefined, cur = "EUR") =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: cur }).format(m / 100);

function label(s: Supplier): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const comp = s.invoice_completeness_pct ?? 0;
  if (s.invoice_count === 0) return { text: "Missing Evidence", variant: "destructive" };
  if (comp >= 95) return { text: "Verified", variant: "default" };
  if (comp >= 70) return { text: "Needs Review", variant: "secondary" };
  return { text: "Missing Evidence", variant: "destructive" };
}

export function SupplierIntelligencePanel({ entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("evidence_suppliers")
      .select("id,slug,name,category,country,currency,invoice_count,invoice_completeness_pct,total_paid_minor,spend_ytd_cents,health_score,risk_score,latest_invoice_at")
      .order("total_paid_minor", { ascending: false })
      .limit(50);
    setRows((data ?? []) as Supplier[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, entityId]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || (r.category ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Supplier Intelligence</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier or category…" className="h-8" />
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">No suppliers indexed yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Supplier</th>
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3 text-right">Invoices</th>
                  <th className="py-1 pr-3 text-right">Completeness</th>
                  <th className="py-1 pr-3 text-right">Paid (all-time)</th>
                  <th className="py-1 pr-3">Latest</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const lab = label(r);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="py-1 pr-3 font-medium">{r.name}</td>
                      <td className="py-1 pr-3 text-muted-foreground">{r.category ?? "—"}</td>
                      <td className="py-1 pr-3 text-right">{r.invoice_count}</td>
                      <td className="py-1 pr-3 text-right">{r.invoice_completeness_pct == null ? "—" : `${Math.round(r.invoice_completeness_pct)}%`}</td>
                      <td className="py-1 pr-3 text-right">{fmtMinor(r.total_paid_minor, r.currency ?? "EUR")}</td>
                      <td className="py-1 pr-3 text-xs">{r.latest_invoice_at ? new Date(r.latest_invoice_at).toLocaleDateString() : "—"}</td>
                      <td className="py-1"><Badge variant={lab.variant}>{lab.text}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}