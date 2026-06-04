import { useState, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RefreshCcw, FlaskConical, FileSearch, Download, ExternalLink } from "lucide-react";
import CjVariantRepairPanel from "@/components/admin/cj/CjVariantRepairPanel";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<
    | {
        aggregate: Record<string, number>;
        reports: Array<Record<string, unknown>>;
      }
    | null
  >(null);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const backfillStopRef = useRef(false);
  const [backfillRunId, setBackfillRunId] = useState<string | null>(null);
  const [rehostVideos, setRehostVideos] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{
    processed: number;
    total: number;
    totals: Record<string, number>;
    done: boolean;
  } | null>(null);

  const [rehostRunning, setRehostRunning] = useState(false);
  const rehostStopRef = useRef(false);
  const [rehostForce, setRehostForce] = useState(false);
  const [rehostRunId, setRehostRunId] = useState<string | null>(null);
  const [rehostProgress, setRehostProgress] = useState<{
    processed: number;
    total: number;
    totals: Record<string, number>;
    done: boolean;
  } | null>(null);

  async function startRehost(dryRun: boolean) {
    setRehostRunning(true);
    rehostStopRef.current = false;
    setRehostRunId(null);
    setRehostProgress(null);
    let offset = 0;
    let runId: string | undefined = undefined;
    let total = 0;
    const cumulative: Record<string, number> = {};
    try {
      while (true) {
        if (rehostStopRef.current) break;
        const { data, error } = await supabase.functions.invoke("cj-rehost-existing-videos", {
          body: { offset, batch_size: 10, dry_run: dryRun, run_id: runId, force: rehostForce },
        });
        if (error) throw error;
        const d = data as {
          run_id: string;
          processed: number;
          total: number;
          next_offset: number | null;
          done: boolean;
          totals: Record<string, number>;
        };
        runId = d.run_id;
        total = d.total;
        for (const [k, v] of Object.entries(d.totals)) {
          cumulative[k] = (cumulative[k] ?? 0) + (v ?? 0);
        }
        setRehostRunId(d.run_id);
        setRehostProgress({
          processed: (cumulative.processed ?? 0),
          total: d.total,
          totals: cumulative,
          done: d.done,
        });
        if (d.done || d.next_offset == null) break;
        offset = d.next_offset;
      }
      toast.success(`Rehost complete (${total} videos scanned).`);
    } catch (e) {
      toast.error(`Rehost failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRehostRunning(false);
    }
  }

  async function startBackfill(dryRun: boolean) {
    setBackfillRunning(true);
    backfillStopRef.current = false;
    setBackfillRunId(null);
    setBackfillProgress(null);
    let offset = 0;
    let runId: string | undefined = undefined;
    let total = 0;
    try {
      while (true) {
        if (backfillStopRef.current) break;
        const { data, error } = await supabase.functions.invoke("cj-backfill-media-variants", {
          body: { offset, batch_size: 10, dry_run: dryRun, run_id: runId, rehost: rehostVideos },
        });
        if (error) throw error;
        const d = data as {
          run_id: string;
          processed: number;
          total: number;
          next_offset: number | null;
          done: boolean;
          totals: Record<string, number>;
        };
        runId = d.run_id;
        total = d.total;
        setBackfillRunId(d.run_id);
        setBackfillProgress({ processed: d.totals.completed ?? 0, total: d.total, totals: d.totals, done: d.done });
        if (d.done || d.next_offset == null) break;
        offset = d.next_offset;
      }
      toast.success(`Backfill complete (${total} products processed).`);
    } catch (e) {
      toast.error(`Backfill failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBackfillRunning(false);
    }
  }

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

  async function runAudit(sample: number) {
    setAuditLoading(true);
    setAuditResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("cj-payload-audit", {
        body: { sample_count: sample },
      });
      if (error) throw error;
      const d = data as { aggregate: Record<string, number>; reports: Array<Record<string, unknown>> };
      setAuditResult(d);
      toast.success(`Audit complete: ${d.aggregate?.sampled ?? 0} sampled`);
    } catch (e) {
      toast.error(`Audit failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditLoading(false);
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

      <Card>
        <CardHeader>
          <CardTitle>Rehost existing CJ videos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reprocesses videos that were already imported into{" "}
            <code className="text-xs">product_media</code> but still point at
            the CJ CDN. Downloads each one, uploads it into the private{" "}
            <code className="text-xs">product-media</code> bucket, and swaps{" "}
            <code className="text-xs">storage_url</code> for a 10-year signed
            URL. The original CJ URL is kept in{" "}
            <code className="text-xs">supplier_url</code> as a fallback. Safe
            to re-run — rows already marked rehosted are skipped unless you
            enable <em>force</em>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => startRehost(true)} disabled={rehostRunning}>
              {rehostRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
              Dry-run rehost
            </Button>
            <Button onClick={() => startRehost(false)} disabled={rehostRunning}>
              {rehostRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Rehost existing videos
            </Button>
            {rehostRunning && (
              <Button variant="ghost" onClick={() => { rehostStopRef.current = true; }}>
                Stop after current batch
              </Button>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <Checkbox
              id="rehost-force"
              checked={rehostForce}
              onCheckedChange={(v) => setRehostForce(v === true)}
              disabled={rehostRunning}
            />
            <div className="space-y-1">
              <Label htmlFor="rehost-force" className="cursor-pointer text-sm font-medium">
                Force re-rehost rows already marked rehosted
              </Label>
              <p className="text-xs text-muted-foreground">
                Re-downloads and re-uploads every CJ video, even when{" "}
                <code className="text-xs">metadata.rehosted = true</code>.
                Useful when signed URLs are near expiry or storage paths were
                deleted.
              </p>
            </div>
          </div>

          {rehostProgress && (
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{rehostProgress.processed} / {rehostProgress.total} processed</span>
                <span>{rehostProgress.done ? "Complete" : "Running…"}</span>
              </div>
              <Progress
                value={rehostProgress.total === 0
                  ? 0
                  : Math.round((rehostProgress.processed / rehostProgress.total) * 100)}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Rehosted" value={rehostProgress.totals.rehosted ?? 0} tone="success" />
                <Stat label="Failed" value={rehostProgress.totals.failed ?? 0} tone="destructive" />
                <Stat label="Skipped (already)" value={rehostProgress.totals.skipped_already_rehosted ?? 0} tone="muted" />
                <Stat label="Would rehost (dry)" value={rehostProgress.totals.dry_run_would_rehost ?? 0} tone="warn" />
              </div>
              {rehostRunId && (
                <p className="text-xs text-muted-foreground">run_id: <code>{rehostRunId}</code></p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Backfill missing videos &amp; variants</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/cj-video-diagnostic">
              Open diagnostic <ExternalLink className="ml-2 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Iterates every product with a <code className="text-xs">cj_product_id</code>{" "}
            (active <em>and</em> inactive), imports any CJ videos that aren't
            yet in <code className="text-xs">product_media</code>, and rebuilds{" "}
            <code className="text-xs">products.variants</code> when empty. Safe
            to re-run — idempotent via the <code className="text-xs">(product_id, supplier_url)</code> unique index.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => startBackfill(true)}
              disabled={backfillRunning}
            >
              {backfillRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
              Dry-run backfill
            </Button>
            <Button onClick={() => startBackfill(false)} disabled={backfillRunning}>
              {backfillRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Backfill missing videos &amp; variants
            </Button>
            {backfillRunning && (
              <Button variant="ghost" onClick={() => { backfillStopRef.current = true; }}>
                Stop after current batch
              </Button>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
            <Checkbox
              id="rehost-videos"
              checked={rehostVideos}
              onCheckedChange={(v) => setRehostVideos(v === true)}
              disabled={backfillRunning}
            />
            <div className="space-y-1">
              <Label htmlFor="rehost-videos" className="cursor-pointer text-sm font-medium">
                Rehost videos to Supabase Storage (with CJ CDN fallback)
              </Label>
              <p className="text-xs text-muted-foreground">
                Downloads each CJ video into the private{" "}
                <code className="text-xs">product-media</code> bucket and stores
                a 10-year signed URL. If the download or upload fails, the row
                falls back to the CJ CDN URL so the video is still playable.
                Slower per product (network + upload) and uses storage quota.
              </p>
            </div>
          </div>

          {backfillProgress && (
            <div className="space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{backfillProgress.processed} / {backfillProgress.total} processed</span>
                <span>{backfillProgress.done ? "Complete" : "Running…"}</span>
              </div>
              <Progress
                value={backfillProgress.total === 0
                  ? 0
                  : Math.round((backfillProgress.processed / backfillProgress.total) * 100)}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Videos imported" value={backfillProgress.totals.videos_imported ?? 0} tone="success" />
                <Stat label="Videos failed" value={backfillProgress.totals.videos_failed ?? 0} tone="destructive" />
                <Stat label="No video" value={backfillProgress.totals.videos_none_found ?? 0} tone="muted" />
                <Stat label="Variants recovered" value={backfillProgress.totals.variants_recovered ?? 0} tone="success" />
                <Stat label="Variants failed" value={backfillProgress.totals.variants_failed ?? 0} tone="destructive" />
                <Stat label="No variants" value={backfillProgress.totals.variants_none_found ?? 0} tone="muted" />
                <Stat label="Unknown URL" value={backfillProgress.totals.videos_unknown_shape ?? 0} tone="warn" />
                <Stat label="CJ fetch failed" value={backfillProgress.totals.cj_fetch_failed ?? 0} tone="destructive" />
                <Stat label="Rehosted" value={backfillProgress.totals.videos_rehosted ?? 0} tone="success" />
                <Stat label="CDN fallback" value={backfillProgress.totals.videos_rehost_fallback_cdn ?? 0} tone="warn" />
              </div>
              {backfillRunId && (
                <p className="text-xs text-muted-foreground">run_id: <code>{backfillRunId}</code></p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CJ payload audit (Phase A)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pull the raw CJ payload for a random sample of CJ products and
            compare it against <code className="text-xs">products</code>,{" "}
            <code className="text-xs">product_media</code>, and variants.
            Surfaces fields CJ returns that GetPawsy currently discards
            (videos, variants, colors, sizes, gallery media).
          </p>
          <div className="flex gap-2 flex-wrap">
            {[5, 10, 25].map((n) => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                disabled={auditLoading}
                onClick={() => runAudit(n)}
              >
                {auditLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSearch className="mr-2 h-4 w-4" />
                )}
                Audit {n} random products
              </Button>
            ))}
          </div>

          {auditResult && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Sampled" value={auditResult.aggregate.sampled ?? 0} />
                <Stat label="CJ OK" value={auditResult.aggregate.cj_ok ?? 0} tone="success" />
                <Stat label="CJ failed" value={auditResult.aggregate.cj_failed ?? 0} tone="destructive" />
                <Stat label="Missing variants" value={auditResult.aggregate.products_missing_variants ?? 0} tone="warn" />
                <Stat label="CJ videos (total)" value={auditResult.aggregate.total_cj_videos ?? 0} />
                <Stat label="DB videos (total)" value={auditResult.aggregate.total_db_videos ?? 0} tone="muted" />
                <Stat label="With CJ video" value={auditResult.aggregate.products_with_cj_videos ?? 0} />
                <Stat label="Discarded URLs" value={auditResult.aggregate.discarded_video_urls ?? 0} tone="warn" />
              </div>
              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Per-product gap reports ({auditResult.reports.length})
                </summary>
                <pre className="mt-2 max-h-[480px] overflow-auto text-xs">
                  {JSON.stringify(auditResult.reports, null, 2)}
                </pre>
              </details>
            </>
          )}
        </CardContent>
      </Card>
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