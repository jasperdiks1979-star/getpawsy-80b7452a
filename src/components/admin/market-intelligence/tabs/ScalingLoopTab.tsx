import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function ScalingLoopTab() {
  const [bulkBusy, setBulkBusy] = useState(false);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [budgetResult, setBudgetResult] = useState<any>(null);

  async function runBulk(dryRun: boolean) {
    setBulkBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-bulk-variants", { body: { dry_run: dryRun } });
      if (error) throw error;
      setBulkResult(data);
      toast.success(dryRun ? "Bulk preview ready" : `Generated ${data?.total_variants ?? 0} variants`);
    } catch (e: any) { toast.error(`Bulk failed: ${e?.message ?? e}`); }
    finally { setBulkBusy(false); }
  }

  async function runBudget(dryRun: boolean) {
    setBudgetBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-budget-allocator", { body: { dry_run: dryRun } });
      if (error) throw error;
      setBudgetResult(data);
      toast.success(dryRun ? "Allocator preview ready" : `Re-prioritized ${data?.updated ?? 0} pins`);
    } catch (e: any) { toast.error(`Allocator failed: ${e?.message ?? e}`); }
    finally { setBudgetBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Copy className="h-5 w-5" /> Bulk variant generation</CardTitle>
          <CardDescription>Auto-clone winning remix drafts into 4 fresh copy variants each, pushed to the draft pool for the compliance gate.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => runBulk(true)} disabled={bulkBusy}>
            {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview
          </Button>
          <Button size="sm" onClick={() => runBulk(false)} disabled={bulkBusy}>
            {bulkBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Generate variants
          </Button>
          {bulkResult && (
            <div className="flex gap-2 ml-auto flex-wrap">
              <Badge variant="outline">winners {bulkResult.winners}</Badge>
              <Badge variant="default">+{bulkResult.total_variants} variants</Badge>
              {bulkResult.errors?.length > 0 && <Badge variant="destructive">{bulkResult.errors.length} errors</Badge>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Budget allocator</CardTitle>
          <CardDescription>Re-prioritizes pending Pinterest pin queue items based on hook-family multipliers from the auto-tune loop. High-multiplier hooks → high priority.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => runBudget(true)} disabled={budgetBusy}>
            {budgetBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Preview
          </Button>
          <Button size="sm" onClick={() => runBudget(false)} disabled={budgetBusy}>
            {budgetBusy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Allocate
          </Button>
          {budgetResult && (
            <div className="flex gap-2 ml-auto flex-wrap">
              <Badge variant="outline">scanned {budgetResult.scanned}</Badge>
              <Badge variant="default">high {budgetResult.distribution?.high ?? 0}</Badge>
              <Badge variant="secondary">med {budgetResult.distribution?.medium ?? 0}</Badge>
              <Badge variant="outline">low {budgetResult.distribution?.low ?? 0}</Badge>
              <Badge>updated {budgetResult.updated}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {budgetResult?.multipliers && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active hook multipliers</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(budgetResult.multipliers as Record<string, number>).sort((a,b) => b[1]-a[1]).map(([k,v]) => (
              <Badge key={k} variant={v >= 1 ? "default" : "secondary"}>{k}: {Number(v).toFixed(2)}×</Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
