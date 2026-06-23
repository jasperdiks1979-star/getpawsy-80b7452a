import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  assessCost,
  creditsToCost,
  fetchAiBalance,
  type AiBalance,
} from "@/lib/aiPricing";

/**
 * Admin dashboard focused on the live Product Intelligence feed-issue queue.
 *
 * - Lists every active product currently flagged `needs_attention`
 * - Shows scan status + last-scanned timestamp per product
 * - Estimates remaining AI credits required to drain the queue (queue size × per-product cost)
 * - One-click per-product re-scan + bulk drain ("Scan all in queue")
 *
 * Read-only beyond the Scan buttons — the broader engine controls live on
 * /admin/product-intelligence.
 */

interface QueueRow {
  product_id: string;
  name: string;
  category: string | null;
  image_url: string | null;
  stock: number | null;
  feed_issues: string[];
  scan_status: string | null;
  last_scanned_at: string | null;
  primary_board: string | null;
  seo_title: string | null;
  description_len: number;
}

interface Config {
  enabled: boolean;
  estimated_credits_per_product: number;
}

function ageLabel(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Stat({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {value}
        {suffix && <span className="text-sm text-muted-foreground ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

const ISSUE_LABELS: Record<string, string> = {
  missing_seo_title: "SEO title",
  no_pinterest_mapping: "Pinterest board",
  missing_or_thin_description: "Description",
  missing_google_category: "Google category",
  missing_pinterest_topics: "Pinterest topics",
};

export default function FeedIssuesQueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [balance, setBalance] = useState<AiBalance>({
    credits_remaining: null,
    is_live: false,
    source: "unknown",
  });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: pi }, { data: cfg }, bal] = await Promise.all([
      supabase
        .from("product_intelligence")
        .select(
          "product_id, feed_issues, scan_status, last_scanned_at, primary_board, seo_title",
        )
        .eq("feed_optimization_status", "needs_attention"),
      supabase
        .from("product_intelligence_config")
        .select("enabled, estimated_credits_per_product")
        .eq("id", 1)
        .maybeSingle(),
      fetchAiBalance(),
    ]);

    setConfig((cfg as Config | null) ?? null);
    setBalance(bal);

    const piRows = (pi as Array<{
      product_id: string;
      feed_issues: unknown;
      scan_status: string | null;
      last_scanned_at: string | null;
      primary_board: string | null;
      seo_title: string | null;
    }> | null) ?? [];

    if (piRows.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const ids = piRows.map((r) => r.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("id, name, category, image_url, stock, description")
      .in("id", ids)
      .eq("is_active", true);

    const productMap = new Map(
      ((products as Array<{
        id: string;
        name: string;
        category: string | null;
        image_url: string | null;
        stock: number | null;
        description: string | null;
      }> | null) ?? []).map((p) => [p.id, p]),
    );

    const merged: QueueRow[] = piRows
      .map((r) => {
        const p = productMap.get(r.product_id);
        if (!p) return null;
        const issues = Array.isArray(r.feed_issues)
          ? (r.feed_issues as string[])
          : [];
        return {
          product_id: r.product_id,
          name: p.name,
          category: p.category,
          image_url: p.image_url,
          stock: p.stock,
          feed_issues: issues,
          scan_status: r.scan_status,
          last_scanned_at: r.last_scanned_at,
          primary_board: r.primary_board,
          seo_title: r.seo_title,
          description_len: (p.description ?? "").length,
        } satisfies QueueRow;
      })
      .filter((r): r is QueueRow => r !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    setRows(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const issueBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const issue of r.feed_issues) {
        counts.set(issue, (counts.get(issue) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const perProduct = config?.estimated_credits_per_product ?? 0.2;
  const estimateCredits = rows.length * perProduct;
  const estimate = creditsToCost(estimateCredits);
  const assessment = assessCost(estimateCredits, balance);

  const scanOne = async (productId: string) => {
    setScanning(productId);
    const { data, error } = await supabase.functions.invoke(
      "product-intelligence-orchestrator",
      { body: { mode: "scan_one", product_id: productId, trigger_source: "manual_feed_queue" } },
    );
    setScanning(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const d = data as { ok?: boolean; failed?: number; status?: string } | null;
    if (d?.status === "blocked_no_credits") {
      toast.error("Blocked: AI credits exhausted");
    } else if (d?.failed) {
      toast.error("Scan returned a failure — see Product Intelligence diagnostics");
    } else {
      toast.success("Product re-scanned");
    }
    void load();
  };

  const scanAllInQueue = async () => {
    if (rows.length === 0) return;
    if (!config?.enabled) {
      toast.error("Engine is disabled — enable it on /admin/product-intelligence first.");
      return;
    }
    if (assessment.sufficient === false) {
      toast.error("Insufficient credits — top up before draining the queue.");
      return;
    }
    setBulkRunning(true);
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      const { data, error } = await supabase.functions.invoke(
        "product-intelligence-orchestrator",
        { body: { mode: "scan_one", product_id: r.product_id, trigger_source: "manual_feed_queue_bulk" } },
      );
      if (error) {
        failed++;
        continue;
      }
      const d = data as { failed?: number; status?: string } | null;
      if (d?.status === "blocked_no_credits") {
        toast.error("Blocked mid-run: AI credits exhausted");
        failed++;
        break;
      }
      if (d?.failed) failed++;
      else ok++;
    }
    setBulkRunning(false);
    toast.success(`Drain complete — ${ok} scanned, ${failed} failed`);
    void load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Feed Issues Queue | GetPawsy Admin</title>
      </Helmet>
      <div className="container max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Feed Issues Queue</h1>
            <p className="text-muted-foreground mt-1">
              Live Product Intelligence queue — every active product flagged{" "}
              <span className="font-mono">needs_attention</span>. Re-scan individually
              or drain the queue in one click.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void load()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
            <Badge variant={config?.enabled ? "default" : "destructive"}>
              Engine {config?.enabled ? "ON" : "OFF"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="In queue" value={rows.length} />
          <Stat
            label="Est. credits to drain"
            value={estimate.credits.toFixed(1)}
            suffix={`= $${estimate.usd.toFixed(2)}`}
          />
          <Stat
            label="Workspace credits"
            value={
              balance.credits_remaining !== null
                ? balance.credits_remaining.toFixed(1)
                : "—"
            }
            suffix={balance.is_live ? "live" : "cached"}
          />
          <Stat
            label="Per-product cost"
            value={perProduct}
            suffix="credits"
          />
        </div>

        {issueBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Issue breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {issueBreakdown.map(([issue, count]) => (
                  <Badge key={issue} variant="secondary" className="text-xs">
                    {ISSUE_LABELS[issue] ?? issue}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Queue ({rows.length})</CardTitle>
            <Button
              onClick={() => void scanAllInQueue()}
              disabled={bulkRunning || rows.length === 0 || !config?.enabled}
            >
              {bulkRunning ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-1" />
              )}
              Scan all in queue
            </Button>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-5xl mb-2">✅</div>
                <div className="text-lg font-medium">Queue is empty</div>
                <div className="text-sm mt-1">
                  All active products are marked <span className="font-mono">optimized</span>.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 pr-2">Product</th>
                      <th className="text-left py-2 pr-2">Issues</th>
                      <th className="text-left py-2 pr-2">Scan</th>
                      <th className="text-left py-2 pr-2">Last scan</th>
                      <th className="text-right py-2 pl-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.product_id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-2">
                          <div className="flex gap-2">
                            {r.image_url && (
                              <img
                                src={r.image_url}
                                alt=""
                                className="w-10 h-10 rounded object-cover flex-shrink-0"
                                loading="lazy"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[280px]" title={r.name}>
                                {r.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {r.category ?? "—"} · stock {r.stock ?? 0}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-wrap gap-1">
                            {r.feed_issues.length === 0 ? (
                              <Badge variant="outline" className="text-xs">none</Badge>
                            ) : (
                              r.feed_issues.map((i) => (
                                <Badge key={i} variant="destructive" className="text-xs">
                                  {ISSUE_LABELS[i] ?? i}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <Badge
                            variant={
                              r.scan_status === "ok"
                                ? "default"
                                : r.scan_status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-xs"
                          >
                            {r.scan_status ?? "never"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">
                          {ageLabel(r.last_scanned_at)}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void scanOne(r.product_id)}
                            disabled={
                              !!scanning || bulkRunning || !config?.enabled
                            }
                          >
                            {scanning === r.product_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Scan"
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}