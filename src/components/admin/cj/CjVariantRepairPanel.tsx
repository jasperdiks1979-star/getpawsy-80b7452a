import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Wrench, ListChecks, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Mode = "audit" | "repair_one" | "repair_all";

interface RepairResult {
  product_id: string;
  cj_product_id?: string;
  ok: boolean;
  reason?: string;
  variants_written?: number;
  total_stock?: number;
  sample?: Array<Record<string, unknown>>;
}

interface RepairResponse {
  ok: boolean;
  traceId?: string;
  run_id?: string;
  mode?: Mode;
  message?: string;
  // audit
  audit?: Record<string, number>;
  // repair_one
  result?: RepairResult;
  // repair_all
  scanned?: number;
  repaired?: number;
  failed?: number;
  results?: RepairResult[];
}

interface RunRow {
  id: string;
  mode: Mode;
  status: "running" | "complete" | "error" | string;
  total: number;
  completed: number;
  repaired: number;
  failed: number;
  current_product_id: string | null;
  current_product_name: string | null;
  last_result: Record<string, unknown> | null;
  results: RepairResult[] | null;
  message: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

/**
 * Admin-only panel to drive cj-variant-repair.
 *
 * Modes:
 *  - audit      → counts of CJ products missing variants
 *  - repair_one → rebuild variants/variant_stock for one product
 *  - repair_all → batch rebuild up to N products with 0 variants
 */
export default function CjVariantRepairPanel() {
  const [busy, setBusy] = useState<Mode | null>(null);
  const [productId, setProductId] = useState("");
  const [limit, setLimit] = useState(25);
  const [response, setResponse] = useState<RepairResponse | null>(null);
  const [runRow, setRunRow] = useState<RunRow | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Always tear down the realtime channel on unmount.
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  async function subscribeToRun(runId: string) {
    // Close any previous subscription
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRunRow({
      id: runId,
      mode: "audit",
      status: "running",
      total: 0,
      completed: 0,
      repaired: 0,
      failed: 0,
      current_product_id: null,
      current_product_name: null,
      last_result: null,
      results: null,
      message: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: null,
    });
    const ch = supabase
      .channel(`cj-variant-repair-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cj_variant_repair_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as RunRow | undefined;
          if (row) setRunRow(row);
        },
      )
      .subscribe();
    channelRef.current = ch;
  }

  async function runMode(mode: Mode) {
    if (mode === "repair_one" && !/^[0-9a-f-]{36}$/i.test(productId.trim())) {
      toast.error("Enter a valid products.id (UUID) for repair_one");
      return;
    }
    setBusy(mode);
    setResponse(null);
    // Client-generate the run_id so realtime is wired up BEFORE the
    // edge function inserts/updates the row.
    const runId =
      (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await subscribeToRun(runId);
    try {
      const body: Record<string, unknown> = { mode, run_id: runId };
      if (mode === "repair_one") body.product_id = productId.trim();
      if (mode === "repair_all") body.limit = Math.max(1, Math.min(200, Number(limit) || 25));
      const { data, error } = await supabase.functions.invoke("cj-variant-repair", { body });
      if (error) throw error;
      const r = data as RepairResponse;
      setResponse(r);
      if (r.ok) {
        if (mode === "audit") toast.success("Audit complete");
        else if (mode === "repair_one")
          toast[r.result?.ok ? "success" : "error"](
            r.result?.ok
              ? `Repaired (${r.result?.variants_written} variants)`
              : `Failed: ${r.result?.reason ?? "unknown"}`,
          );
        else
          toast.success(`Batch done: ${r.repaired}/${r.scanned} repaired (${r.failed} failed)`);
      } else {
        toast.error(r.message ?? "Repair failed");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setResponse({ ok: false, message: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/30 dark:bg-indigo-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-indigo-600" />
          CJ variant repair
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Rebuilds <code>products.variants</code> and <code>variant_stock</code> for CJ-mapped
          products that currently show 0 variants. Pulls live data from CJ Dropshipping. Admin only.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live progress */}
        {runRow && (
          <div className="rounded-md border bg-background p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant={
                  runRow.status === "complete"
                    ? "default"
                    : runRow.status === "running"
                      ? "secondary"
                      : "destructive"
                }
              >
                {runRow.status}
              </Badge>
              <Badge variant="outline">{runRow.mode}</Badge>
              <span className="font-mono text-[10px] text-muted-foreground">
                run: {runRow.id.slice(0, 8)}…
              </span>
              <span className="ml-auto font-mono">
                {runRow.completed}/{runRow.total || "?"} done · {runRow.repaired} ok · {runRow.failed} fail
              </span>
            </div>
            <Progress
              value={runRow.total > 0 ? Math.min(100, (runRow.completed / runRow.total) * 100) : runRow.status === "complete" ? 100 : 5}
            />
            {runRow.current_product_name && runRow.status === "running" && (
              <div className="text-xs text-muted-foreground truncate">
                Processing: <span className="font-medium">{runRow.current_product_name}</span>
              </div>
            )}
          </div>
        )}

        {/* Audit */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => runMode("audit")}>
            {busy === "audit" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ListChecks className="h-4 w-4 mr-2" />
            )}
            Run audit
          </Button>
        </div>

        {/* Repair one */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 min-w-[320px] flex-1">
            <label className="text-xs font-medium">products.id (UUID)</label>
            <Input
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="e.g. a582c365-35be-4cf0-97c9-cb47ec6d4045"
              className="font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <Button size="sm" disabled={busy !== null} onClick={() => runMode("repair_one")}>
            {busy === "repair_one" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PackageSearch className="h-4 w-4 mr-2" />
            )}
            Repair one
          </Button>
        </div>

        {/* Repair all */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">Batch limit (1–200)</label>
            <Input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-32"
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => runMode("repair_all")}
          >
            {busy === "repair_all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Repair all (0-variant CJ products)
          </Button>
        </div>

        {/* Results */}
        {response && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant={response.ok ? "default" : "destructive"}>
                {response.ok ? "ok" : "failed"}
              </Badge>
              {response.mode && <Badge variant="outline">mode: {response.mode}</Badge>}
              {response.traceId && (
                <span className="text-muted-foreground font-mono">trace: {response.traceId}</span>
              )}
              {response.message && (
                <span className="text-muted-foreground">{response.message}</span>
              )}
            </div>

            {/* Audit summary */}
            {response.audit && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                {Object.entries(response.audit).map(([k, v]) => (
                  <div key={k} className="rounded-md border p-3 bg-background">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </div>
                    <div className="text-2xl font-bold">{v as number}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Repair one result */}
            {response.result && <RepairRow r={response.result} />}

            {/* Repair all result */}
            {Array.isArray(response.results) && response.results.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline">scanned: {response.scanned}</Badge>
                  <Badge variant="default">repaired: {response.repaired}</Badge>
                  <Badge variant="destructive">failed: {response.failed}</Badge>
                </div>
                <div className="rounded-md border max-h-96 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left sticky top-0">
                      <tr>
                        <th className="p-2">Product</th>
                        <th className="p-2">CJ ID</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Variants</th>
                        <th className="p-2">Stock</th>
                        <th className="p-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {response.results.map((r) => (
                        <tr key={r.product_id} className="border-t">
                          <td className="p-2 font-mono text-[10px]">{r.product_id.slice(0, 8)}…</td>
                          <td className="p-2 font-mono text-[10px]">{r.cj_product_id ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant={r.ok ? "default" : "destructive"}>
                              {r.ok ? "ok" : "fail"}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono">{r.variants_written ?? "—"}</td>
                          <td className="p-2 font-mono">{r.total_stock ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.reason ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <details className="text-[10px]">
              <summary className="cursor-pointer text-muted-foreground">raw response</summary>
              <pre className="overflow-auto bg-background border rounded p-2 max-h-72">
{JSON.stringify(response, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RepairRow({ r }: { r: RepairResult }) {
  return (
    <div className="rounded-md border p-3 bg-background space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "repaired" : "failed"}</Badge>
        <span className="font-mono text-xs">{r.product_id}</span>
        {r.cj_product_id && (
          <span className="text-xs text-muted-foreground">cj: {r.cj_product_id}</span>
        )}
      </div>
      {r.ok ? (
        <div className="text-xs text-muted-foreground">
          {r.variants_written} variants written · total stock {r.total_stock}
        </div>
      ) : (
        <div className="text-xs text-destructive">{r.reason}</div>
      )}
      {Array.isArray(r.sample) && r.sample.length > 0 && (
        <pre className="text-[10px] bg-muted/40 border rounded p-2 overflow-auto">
{JSON.stringify(r.sample, null, 2)}
        </pre>
      )}
    </div>
  );
}