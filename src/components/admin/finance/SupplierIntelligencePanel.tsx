/**
 * Supplier Intelligence — mobile-first, every % is explained.
 * Completeness is bounded by document confidence via the canonical state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, RefreshCw, Search } from "lucide-react";
import { formatMoneyMinor, displaySupplier } from "@/lib/finance/format";
import { ResponsiveTable, type Column } from "./shared/ResponsiveTable";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import { useFinanceState } from "@/lib/finance/state/FinanceStateProvider";
import type { FinanceStatus } from "@/lib/finance/state/types";

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

function statusFor(pct: number, count: number): FinanceStatus {
  if (count === 0) return "Waiting Evidence";
  if (pct >= 95) return "Verified";
  if (pct >= 70) return "Needs Review";
  if (pct > 0) return "Missing Evidence";
  return "Pending";
}

function explain(s: Supplier, cap: number): { text: string; bullets: string[] } {
  const raw = s.invoice_completeness_pct ?? 0;
  const capped = Math.min(raw, cap);
  return {
    text:
      `Based on ${s.invoice_count} invoice${s.invoice_count === 1 ? "" : "s"} analysed. ` +
      (raw !== capped ? `Capped by document confidence (${cap}%).` : ""),
    bullets: [
      `Invoices analysed: ${s.invoice_count}`,
      `Extraction quality: ${Math.round(raw)}%`,
      s.health_score != null ? `Health score: ${Math.round(s.health_score)}` : "Health score: pending",
      s.risk_score != null ? `Risk score: ${Math.round(s.risk_score)}` : "Risk score: pending",
    ],
  };
}

export function SupplierIntelligencePanel({ entityId: _entityId }: { entityId: string | null }) {
  const { state } = useFinanceState();
  const docConfidenceCap = state.document_confidence.value || 100;
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
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || (r.category ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  const columns: Column<Supplier>[] = [
    {
      key: "supplier",
      header: "Supplier",
      primary: true,
      cell: (r) => (
        <span className="font-medium">
          {displaySupplier({ name: r.name, slug: r.slug, hasEvidence: r.invoice_count > 0 })}
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (r) => r.category ?? "Waiting supplier learning" },
    { key: "invoices", header: "Invoices", align: "right", cell: (r) => String(r.invoice_count) },
    {
      key: "completeness",
      header: "Confidence",
      align: "right",
      cell: (r) => {
        const raw = r.invoice_completeness_pct ?? 0;
        const capped = Math.round(Math.min(raw, docConfidenceCap));
        const status = statusFor(capped, r.invoice_count);
        const ex = explain(r, docConfidenceCap);
        return (
          <div className="inline-flex items-center gap-1 justify-end">
            <span className="tabular-nums">{r.invoice_count === 0 ? "—" : `${capped}%`}</span>
            <StatusBadge status={status} className="text-[10px]" />
            <ExplainPopover title="Supplier confidence" explanation={ex.text} bullets={ex.bullets} />
          </div>
        );
      },
    },
    {
      key: "paid",
      header: "Paid (all-time)",
      align: "right",
      cell: (r) => formatMoneyMinor(r.total_paid_minor, r.currency ?? "EUR"),
    },
    {
      key: "latest",
      header: "Latest",
      cell: (r) => (r.latest_invoice_at ? new Date(r.latest_invoice_at).toLocaleDateString() : "No invoices yet"),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Supplier Intelligence
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-3 w-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier or category…" className="h-8" />
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ResponsiveTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            empty="No suppliers indexed yet."
          />
        )}
      </CardContent>
    </Card>
  );
}
