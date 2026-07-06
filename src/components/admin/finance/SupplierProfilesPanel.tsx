import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Brain, RefreshCw, Search } from "lucide-react";
import {
  formatMoneyMinor,
  normalizeSupplierConfidence,
  STATUS_VARIANT,
  displaySupplier,
  type FinanceStatus,
} from "@/lib/finance/format";

type Profile = {
  id: string; name: string; slug: string;
  expected_vat_pct: number | null; expected_currency: string | null;
  expected_cycle: string | null; expected_bookkeeping_category: string | null;
  avg_invoice_minor: number | null; yoy_spend_minor: number | null;
  missing_invoice_history: number; duplicate_history: number;
  confidence_score: number | null; profile_last_computed_at: string | null;
  invoice_completeness_pct: number | null;
};

const fmt = (m: number | null | undefined, cur = "EUR") =>
  formatMoneyMinor(m, cur, "No spend recorded");

function labelFor(p: Profile): { text: FinanceStatus; pct: number } {
  const pct = normalizeSupplierConfidence(p.confidence_score);
  if (pct >= 80) return { text: "Verified", pct };
  if (pct >= 50) return { text: "Needs Review", pct };
  if (pct > 0) return { text: "Estimated", pct };
  return { text: "Missing Evidence", pct };
}

export function SupplierProfilesPanel({ entityId: _entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("evidence_suppliers")
      .select("id,name,slug,expected_vat_pct,expected_currency,expected_cycle,expected_bookkeeping_category,avg_invoice_minor,yoy_spend_minor,missing_invoice_history,duplicate_history,confidence_score,profile_last_computed_at,invoice_completeness_pct")
      .order("yoy_spend_minor", { ascending: false, nullsFirst: false })
      .limit(50);
    setRows((data ?? []) as Profile[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const relearn = useCallback(async () => {
    setRunning(true);
    await supabase.functions.invoke("finance-supplier-learn", { body: {} });
    setRunning(false);
    await load();
  }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter(r => r.name.toLowerCase().includes(t)) : rows;
  }, [rows, q]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> Supplier Profiles 2.0</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={relearn} disabled={running}>
            <RefreshCw className={`h-3 w-3 mr-1 ${running ? "animate-spin" : ""}`} /> Relearn
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier…" className="h-8" />
        </div>
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div>
         : filtered.length === 0 ? <div className="text-sm text-muted-foreground">No supplier profiles yet.</div>
         : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Supplier</th>
                <th className="py-1 pr-3">Cycle</th>
                <th className="py-1 pr-3">VAT</th>
                <th className="py-1 pr-3">Category</th>
                <th className="py-1 pr-3 text-right">Avg invoice</th>
                <th className="py-1 pr-3 text-right">YoY spend</th>
                <th className="py-1 pr-3 text-right">Missing</th>
                <th className="py-1 pr-3 text-right">Dupes</th>
                <th className="py-1">Confidence</th>
              </tr></thead>
              <tbody>{filtered.map(r => {
                const lab = labelFor(r);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="py-1 pr-3 font-medium">{displaySupplier({ name: r.name, slug: r.slug, hasEvidence: (r.confidence_score ?? 0) > 0 })}</td>
                    <td className="py-1 pr-3">{r.expected_cycle ?? "Pending"}</td>
                    <td className="py-1 pr-3">{r.expected_vat_pct != null ? `${Math.round(r.expected_vat_pct)}%` : "Pending VAT classification"}</td>
                    <td className="py-1 pr-3 text-muted-foreground">{r.expected_bookkeeping_category ?? "Waiting supplier learning"}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.avg_invoice_minor, r.expected_currency ?? "EUR")}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.yoy_spend_minor, r.expected_currency ?? "EUR")}</td>
                    <td className="py-1 pr-3 text-right">{r.missing_invoice_history}</td>
                    <td className="py-1 pr-3 text-right">{r.duplicate_history}</td>
                    <td className="py-1"><Badge variant={STATUS_VARIANT[lab.text]}>{lab.text} · {lab.pct}%</Badge></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}