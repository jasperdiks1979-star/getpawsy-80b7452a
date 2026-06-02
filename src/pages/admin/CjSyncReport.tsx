import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RefreshCcw, FlaskConical, Video, Boxes, DollarSign, Truck } from "lucide-react";

type Mode = "full" | "inventory" | "pricing" | "shipping" | "media";

interface Run {
  id: string;
  started_at: string;
  finished_at: string | null;
  mode: string;
  status: string;
  totals: Record<string, number> | null;
  triggered_by: string | null;
  error: string | null;
}

interface Item {
  id: string;
  product_id: string | null;
  product_name: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export default function CjSyncReport() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  async function loadRuns() {
    const { data } = await supabase
      .from("cj_sync_runs")
      .select("id,started_at,finished_at,mode,status,totals,triggered_by,error")
      .order("started_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as Run[];
    setRuns(rows);
    if (!selectedRunId && rows[0]) setSelectedRunId(rows[0].id);
  }

  async function loadItems(runId: string) {
    const { data } = await supabase
      .from("cj_sync_items")
      .select("id,product_id,product_name,action,before,after,error,created_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(500);
    setItems((data ?? []) as Item[]);
  }

  useEffect(() => { loadRuns(); }, []);
  useEffect(() => { if (selectedRunId) loadItems(selectedRunId); }, [selectedRunId]);

  async function trigger(mode: Mode, dryRun = false) {
    setRunning(`${mode}${dryRun ? "-dry" : ""}`);
    try {
      const { data, error } = await supabase.functions.invoke("cj-nightly-product-sync", {
        body: { mode, dry_run: dryRun, limit: 25 },
      });
      if (error) throw error;
      toast.success(
        `Sync (${mode}${dryRun ? " dry-run" : ""}) finished: ${JSON.stringify((data as { totals?: unknown }).totals)}`,
      );
      await loadRuns();
    } catch (e) {
      toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(null);
    }
  }

  const latest = runs[0];
  const t = latest?.totals ?? {};

  return (
    <div className="container mx-auto max-w-6xl py-8 space-y-6">
      <Helmet>
        <title>CJ Sync Report · Admin</title>
      </Helmet>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">CJ Nightly Sync Report</h1>
        <p className="text-muted-foreground">
          Runs every night at 03:00 UTC. Pulls CJ product details, imports product
          videos to our storage, syncs inventory, and recomputes landed cost + price.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Run now</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => trigger("full")} disabled={running !== null}>
            {running === "full" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Full sync
          </Button>
          <Button variant="outline" onClick={() => trigger("media")} disabled={running !== null}>
            <Video className="mr-2 h-4 w-4" /> Videos only
          </Button>
          <Button variant="outline" onClick={() => trigger("inventory")} disabled={running !== null}>
            <Boxes className="mr-2 h-4 w-4" /> Inventory only
          </Button>
          <Button variant="outline" onClick={() => trigger("pricing")} disabled={running !== null}>
            <DollarSign className="mr-2 h-4 w-4" /> Pricing only
          </Button>
          <Button variant="outline" onClick={() => trigger("shipping")} disabled={running !== null}>
            <Truck className="mr-2 h-4 w-4" /> Shipping only
          </Button>
          <Button variant="secondary" onClick={() => trigger("full", true)} disabled={running !== null}>
            <FlaskConical className="mr-2 h-4 w-4" /> Dry run
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last run summary</CardTitle>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <Stat label="Scanned" value={t.scanned ?? 0} />
                <Stat label="Videos imported" value={t.videos_imported ?? 0} tone="success" />
                <Stat label="Inventory updates" value={t.inventory_updated ?? 0} />
                <Stat label="Price changes" value={t.price_changes ?? 0} />
                <Stat label="Shipping synced" value={t.shipping_changes ?? 0} />
                <Stat label="Needs review" value={t.needs_review ?? 0} tone="warn" />
                <Stat label="No CJ mapping" value={t.no_mapping ?? 0} tone="muted" />
                <Stat label="Failed" value={t.failed ?? 0} tone="destructive" />
              </div>
              <p className="text-sm text-muted-foreground">
                Mode: <b>{latest.mode}</b> · Status: <b>{latest.status}</b> · Started{" "}
                {new Date(latest.started_at).toLocaleString()} · Triggered by {latest.triggered_by ?? "?"}
              </p>
              {latest.error && <p className="text-sm text-destructive mt-2">Error: {latest.error}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Started</th>
                  <th className="p-2">Mode</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Scanned</th>
                  <th className="p-2">Videos</th>
                  <th className="p-2">Inv</th>
                  <th className="p-2">Price</th>
                  <th className="p-2">Fail</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className={`border-t cursor-pointer ${selectedRunId === r.id ? "bg-muted/30" : ""}`}
                      onClick={() => setSelectedRunId(r.id)}>
                    <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                    <td className="p-2">{r.mode}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2">{r.totals?.scanned ?? "-"}</td>
                    <td className="p-2">{r.totals?.videos_imported ?? "-"}</td>
                    <td className="p-2">{r.totals?.inventory_updated ?? "-"}</td>
                    <td className="p-2">{r.totals?.price_changes ?? "-"}</td>
                    <td className="p-2 text-destructive">{r.totals?.failed ?? 0}</td>
                    <td className="p-2 text-xs text-muted-foreground">view</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-product changes (selected run)</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No items.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-2">Product</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Before</th>
                    <th className="p-2">After</th>
                    <th className="p-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="p-2">{it.product_name ?? it.product_id ?? "-"}</td>
                      <td className="p-2 font-mono text-xs">{it.action}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">
                        {it.before ? JSON.stringify(it.before) : "-"}
                      </td>
                      <td className="p-2 font-mono text-xs">{it.after ? JSON.stringify(it.after) : "-"}</td>
                      <td className="p-2 text-xs text-destructive">{it.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warn" | "destructive" | "muted" }) {
  const toneClass =
    tone === "success" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "destructive" ? "text-destructive"
    : tone === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}