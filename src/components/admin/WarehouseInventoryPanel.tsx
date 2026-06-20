import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Wrench } from "lucide-react";
import { toast } from "sonner";

interface DashData {
  counts: { us_only: number; cn_fallback: number; eu_fallback: number; sold_out: number; total: number };
  revenue_30d: {
    us_only_sales: number;
    recovered_via_cn: number;
    recovered_via_eu: number;
    missed_sold_out: number;
  };
}

export default function WarehouseInventoryPanel() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("warehouse-inventory-dashboard");
    setLoading(false);
    if (error) return toast.error(error.message);
    if (res && (res as any).ok) setData(res as DashData);
  }
  useEffect(() => { load(); }, []);

  async function runScan() {
    setBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("warehouse-missed-revenue-scan");
      if (error) throw error;
      toast.success(`Scan: ${JSON.stringify(res).slice(0, 120)}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Multi-Warehouse Inventory</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={runScan}>
            <Wrench className="h-4 w-4 mr-1" /> Scan missed revenue
          </Button>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !data ? (
          <div className="text-sm text-muted-foreground">No data.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Mini label="US only" value={data.counts.us_only} />
              <Mini label="EU fallback" value={data.counts.eu_fallback} />
              <Mini label="CN fallback" value={data.counts.cn_fallback} />
              <Mini label="Fully sold out" value={data.counts.sold_out} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Mini label="US revenue (30d)" value={`$${data.revenue_30d.us_only_sales}`} />
              <Mini label="Recovered via CN" value={`$${data.revenue_30d.recovered_via_cn}`} />
              <Mini label="Recovered via EU" value={`$${data.revenue_30d.recovered_via_eu}`} />
              <Mini label="Missed (sold out)" value={`$${data.revenue_30d.missed_sold_out}`} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
