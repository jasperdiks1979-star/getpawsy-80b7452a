import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

interface Snapshot {
  us_only: number;
  eu_only: number;
  cn_only: number;
  fully_sold_out: number;
  wrongly_marked: number;
  reactivatable: number;
  extra_pinterest: number;
  estimated_revenue_30d: number;
}

export default function InventoryGlobalAuditCard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function runAudit() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("inventory-global-audit");
      if (error) throw error;
      if ((data as any)?.snapshot) setSnap((data as any).snapshot);
      else toast.error((data as any)?.message ?? "Audit failed");
    } catch (e: any) {
      toast.error(e?.message ?? "Audit failed");
    } finally { setBusy(false); }
  }

  async function runReplacementScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("inventory-replacement-scan");
      if (error) throw error;
      toast.success(`Replacement scan: ${JSON.stringify(data).slice(0, 140)}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Scan failed");
    } finally { setScanning(false); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Global Inventory Audit</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={scanning} onClick={runReplacementScan}>
            {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Replacement scan
          </Button>
          <Button size="sm" disabled={busy} onClick={runAudit}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
            Run audit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!snap ? (
          <div className="text-sm text-muted-foreground">Run audit to generate a fresh snapshot.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Mini label="US only" value={snap.us_only} />
            <Mini label="EU only" value={snap.eu_only} />
            <Mini label="CN only" value={snap.cn_only} />
            <Mini label="Fully sold out" value={snap.fully_sold_out} />
            <Mini label="Wrongly sold-out" value={snap.wrongly_marked} />
            <Mini label="Reactivatable" value={snap.reactivatable} />
            <Mini label="Extra Pinterest-eligible" value={snap.extra_pinterest} />
            <Mini label="Est. extra revenue (30d)" value={`$${snap.estimated_revenue_30d}`} />
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