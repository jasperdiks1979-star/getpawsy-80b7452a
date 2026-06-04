import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RefreshCcw, FlaskConical } from "lucide-react";
import CjVariantRepairPanel from "@/components/admin/cj/CjVariantRepairPanel";

interface SyncChange {
  id: string;
  name: string;
  before: number | null;
  after: number | null;
  status: string;
  message?: string;
}

interface SyncResult {
  ok: boolean;
  dry_run: boolean;
  scanned: number;
  in_stock: number;
  out_of_stock: number;
  no_mapping: number;
  errors: number;
  sample: SyncChange[];
  changes?: SyncChange[];
  message?: string;
}

export default function CjInventorySync() {
  const [loading, setLoading] = useState<"dry" | "live" | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run(dryRun: boolean) {
    setLoading(dryRun ? "dry" : "live");
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cj-inventory-sync", {
        body: { dry_run: dryRun, max_age_hours: dryRun ? 0 : 12 },
      });
      if (error) throw error;
      setResult(data as SyncResult);
      toast.success(
        `${dryRun ? "Dry-run" : "Sync"} complete: ${(data as SyncResult).scanned} scanned`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Sync failed: ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="container mx-auto max-w-5xl py-8 space-y-6">
      <Helmet>
        <title>CJ Inventory Sync · Admin</title>
      </Helmet>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">CJ Dropshipping inventory sync</h1>
        <p className="text-muted-foreground">
          Pulls live US-warehouse stock from CJ and updates{" "}
          <code className="text-xs">products.stock</code>,{" "}
          <code className="text-xs">variant_stock</code>, and{" "}
          <code className="text-xs">is_active</code>. Runs hourly via cron. Use dry-run
          first to preview changes.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Run sync</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={() => run(true)}
            disabled={loading !== null}
          >
            {loading === "dry" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="mr-2 h-4 w-4" />
            )}
            Run dry-run
          </Button>
          <Button onClick={() => run(false)} disabled={loading !== null}>
            {loading === "live" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Sync CJ inventory now
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              Result {result.dry_run ? "(dry-run — no writes)" : "(live)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <Stat label="Scanned" value={result.scanned} />
              <Stat label="In stock" value={result.in_stock} tone="success" />
              <Stat label="Out of stock" value={result.out_of_stock} tone="warn" />
              <Stat label="No CJ mapping" value={result.no_mapping} tone="muted" />
              <Stat label="Errors" value={result.errors} tone="destructive" />
            </div>

            {result.sample.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2">Before</th>
                      <th className="p-2">After</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sample.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="p-2">{c.name}</td>
                        <td className="p-2 font-mono">{c.before ?? "—"}</td>
                        <td className="p-2 font-mono">{c.after ?? "—"}</td>
                        <td className="p-2">{c.status}</td>
                        <td className="p-2 text-muted-foreground text-xs">
                          {c.message ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CjVariantRepairPanel />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warn" | "destructive" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "destructive"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}