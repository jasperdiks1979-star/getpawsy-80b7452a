import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Report = {
  total_variants: number;
  mapped: number;
  unmapped: number;
  sku_issues: number;
  method_counts: Record<string, number>;
  batches: { pending: number; done: number; paused_credits: number };
  inventory_synced: number;
  scores: { recovery_pct: number; fulfillment_pct: number; inventory_pct: number; commerce_pct: number };
};

export default function CatalogRecoveryDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.functions.invoke("catalog-recovery-report");
    if (data?.ok) setReport(data);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const run = async (fn: string) => {
    setBusy(fn);
    await supabase.functions.invoke(fn);
    setBusy(null);
    load();
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Catalog Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic CJ ↔ Shopify fulfillment recovery. No product mutations. AI fallback disabled.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => run("catalog-recovery-scan")}>
            {busy === "catalog-recovery-scan" ? "Scanning..." : "Run Shopify Scan"}
          </Button>
          <Button disabled={busy !== null} onClick={() => run("catalog-recovery-tick")}>
            {busy === "catalog-recovery-tick" ? "Ticking..." : "Run One Batch"}
          </Button>
        </div>
      </div>

      {!report ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Total variants" value={report.total_variants} />
            <Metric label="Mapped" value={report.mapped} />
            <Metric label="Unmapped" value={report.unmapped} />
            <Metric label="SKU issues" value={report.sku_issues} tone="warn" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Recovery %" value={`${report.scores.recovery_pct}%`} />
            <Metric label="Fulfillment %" value={`${report.scores.fulfillment_pct}%`} />
            <Metric label="Inventory %" value={`${report.scores.inventory_pct}%`} />
            <Metric label="Commerce readiness" value={`${report.scores.commerce_pct}%`} />
          </div>

          <Card>
            <CardHeader><CardTitle>Recovery methods</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.keys(report.method_counts).length === 0 ? (
                <span className="text-muted-foreground text-sm">No mappings yet.</span>
              ) : (
                Object.entries(report.method_counts).map(([m, n]) => (
                  <Badge key={m} variant="secondary">{m}: {n}</Badge>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Batches</CardTitle></CardHeader>
            <CardContent className="flex gap-3 text-sm">
              <Badge>Pending: {report.batches.pending}</Badge>
              <Badge variant="secondary">Done: {report.batches.done}</Badge>
              <Badge variant="destructive">Paused (credits): {report.batches.paused_credits}</Badge>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className={`text-3xl font-bold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div></CardContent>
    </Card>
  );
}