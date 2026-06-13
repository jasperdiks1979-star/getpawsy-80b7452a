import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Video, Film } from "lucide-react";

type Counts = {
  total: number;
  clean: number;
  review: number;
  blocked: number;
  excluded_products: number;
  manual_review_products: number;
  cj_videos_found: number;
  cj_videos_imported: number;
  products_with_video: number;
  products_without_video: number;
};

type Run = {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  images_scanned: number;
  clean_count: number;
  review_count: number;
  blocked_count: number;
  errors: number;
  products_excluded: number;
};

type FlaggedRow = {
  product_id: string;
  image_url: string;
  status: string;
  issue_type: string;
  confidence: number;
  scanned_at: string;
};

type CjRun = {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  products_scanned: number;
  videos_found: number;
  videos_imported: number;
  cj_fetch_failed: number;
  rejection_reasons: Record<string, number>;
};

export default function MediaQualityDashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [cjRuns, setCjRuns] = useState<CjRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [pipelining, setPipelining] = useState(false);

  async function load() {
    setLoading(true);
    const [
      { data: ma },
      { data: r },
      { data: f },
      excludedRes,
      { data: cjr },
      videoRowsRes,
      { count: cjLinkedCount },
    ] = await Promise.all([
        supabase.from("media_audit").select("status"),
        supabase
          .from("media_audit_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
        supabase
          .from("media_audit")
          .select("product_id,image_url,status,issue_type,confidence,scanned_at")
          .in("status", ["BLOCKED", "REVIEW"])
          .order("confidence", { ascending: false })
          .limit(100),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("pinterest_eligible", false),
        supabase
          .from("cj_video_ingestion_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(20),
        supabase
          .from("product_media")
          .select("product_id")
          .eq("media_type", "video"),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .not("cj_product_id", "is", null),
      ]);

    const rows = (ma ?? []) as { status: string }[];
    const clean = rows.filter((x) => x.status === "CLEAN").length;
    const review = rows.filter((x) => x.status === "REVIEW").length;
    const blocked = rows.filter((x) => x.status === "BLOCKED").length;

    // Manual-review = product has at least one REVIEW image and no CLEAN image
    const byProduct = new Map<string, Set<string>>();
    for (const row of (f ?? []) as FlaggedRow[]) {
      const s = byProduct.get(row.product_id) ?? new Set<string>();
      s.add(row.status);
      byProduct.set(row.product_id, s);
    }
    const manualReview = [...byProduct.values()].filter(
      (s) => s.has("REVIEW") || s.has("BLOCKED"),
    ).length;

    const cjRunsList = (cjr ?? []) as CjRun[];
    const cjFound = cjRunsList.reduce((s, r) => s + (r.videos_found ?? 0), 0);
    const cjImported = cjRunsList.reduce((s, r) => s + (r.videos_imported ?? 0), 0);
    const productsWithVideo = new Set(
      ((videoRowsRes.data as Array<{ product_id: string }> | null) ?? []).map((v) => v.product_id),
    ).size;
    const productsWithoutVideo = Math.max(0, (cjLinkedCount ?? 0) - productsWithVideo);

    setCounts({
      total: rows.length,
      clean,
      review,
      blocked,
      excluded_products: (excludedRes as any)?.count ?? 0,
      manual_review_products: manualReview,
      cj_videos_found: cjFound,
      cj_videos_imported: cjImported,
      products_with_video: productsWithVideo,
      products_without_video: productsWithoutVideo,
    });
    setRuns((r ?? []) as Run[]);
    setFlagged((f ?? []) as FlaggedRow[]);
    setCjRuns(cjRunsList);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runScan() {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "media-integrity-scan",
        { body: { trigger: "manual", limit: 50 } },
      );
      if (error) throw error;
      toast.success(`Scan complete: ${(data as any)?.images_scanned ?? 0} images`);
      await load();
    } catch (e: any) {
      toast.error(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  }

  async function runIngest() {
    setIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "cj-video-ingest-worker",
        { body: { trigger: "manual", batch_size: 25, max_batches: 4, only_missing: true } },
      );
      if (error) throw error;
      toast.success(
        `CJ ingest: ${(data as any)?.videos_imported ?? 0} videos imported, ${
          (data as any)?.products_scanned ?? 0
        } products scanned`,
      );
      await load();
    } catch (e: any) {
      toast.error(`Ingest failed: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  }

  async function runPipeline() {
    setPipelining(true);
    try {
      const scan = await supabase.functions.invoke("media-integrity-scan", {
        body: { trigger: "pipeline", limit: 100 },
      });
      if (scan.error) throw scan.error;
      const ing = await supabase.functions.invoke("cj-video-ingest-worker", {
        body: { trigger: "pipeline", batch_size: 25, max_batches: 4, only_missing: true },
      });
      if (ing.error) throw ing.error;
      toast.success(
        `Pipeline: ${(scan.data as any)?.images_scanned ?? 0} imgs, ${
          (ing.data as any)?.videos_imported ?? 0
        } videos`,
      );
      await load();
    } catch (e: any) {
      toast.error(`Pipeline failed: ${e.message}`);
    } finally {
      setPipelining(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Media Quality</h1>
          <p className="text-sm text-muted-foreground">
            Detection-only guard — no source images are modified.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={runScan} disabled={scanning} variant="secondary">
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Run media audit
          </Button>
          <Button onClick={runIngest} disabled={ingesting} variant="secondary">
            {ingesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Video className="h-4 w-4 mr-2" />}
            Run CJ video ingestion
          </Button>
          <Button onClick={runPipeline} disabled={pipelining}>
            {pipelining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Film className="h-4 w-4 mr-2" />}
            Run full media pipeline
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard label="Total scanned" value={counts?.total ?? 0} />
        <StatCard
          label="CLEAN"
          value={counts?.clean ?? 0}
          icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
        />
        <StatCard
          label="REVIEW"
          value={counts?.review ?? 0}
          icon={<ShieldAlert className="h-4 w-4 text-yellow-500" />}
        />
        <StatCard
          label="BLOCKED"
          value={counts?.blocked ?? 0}
          icon={<ShieldX className="h-4 w-4 text-red-500" />}
        />
        <StatCard
          label="Products excluded"
          value={counts?.excluded_products ?? 0}
        />
        <StatCard
          label="Manual review"
          value={counts?.manual_review_products ?? 0}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="CJ videos found"
          value={counts?.cj_videos_found ?? 0}
          icon={<Video className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          label="CJ videos imported"
          value={counts?.cj_videos_imported ?? 0}
          icon={<Film className="h-4 w-4 text-blue-500" />}
        />
        <StatCard label="Products with video" value={counts?.products_with_video ?? 0} />
        <StatCard label="Products without video" value={counts?.products_without_video ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent media audit runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {runs.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{r.trigger}</Badge>
                  <span>{new Date(r.started_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span>{r.images_scanned} scanned</span>
                  <span className="text-green-500">{r.clean_count} clean</span>
                  <span className="text-yellow-500">{r.review_count} review</span>
                  <span className="text-red-500">{r.blocked_count} blocked</span>
                  <span>{r.products_excluded} excluded</span>
                </div>
              </div>
            ))}
            {!runs.length && (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent CJ video ingestion runs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {cjRuns.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{r.trigger}</Badge>
                  <Badge variant={r.status === "completed" ? "secondary" : r.status === "failed" ? "destructive" : "default"}>
                    {r.status}
                  </Badge>
                  <span>{new Date(r.started_at).toLocaleString()}</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span>{r.products_scanned} scanned</span>
                  <span className="text-blue-500">{r.videos_found} found</span>
                  <span className="text-green-500">{r.videos_imported} imported</span>
                  <span className="text-red-500">{r.cj_fetch_failed} failed</span>
                </div>
              </div>
            ))}
            {!cjRuns.length && (
              <p className="text-sm text-muted-foreground">No CJ ingest runs yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flagged images ({flagged.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {flagged.map((row) => (
              <div
                key={`${row.product_id}-${row.image_url}`}
                className="border rounded p-2 space-y-2 text-xs"
              >
                <img
                  src={row.image_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-32 object-cover rounded"
                />
                <div className="flex items-center justify-between">
                  <Badge
                    variant={row.status === "BLOCKED" ? "destructive" : "secondary"}
                  >
                    {row.status}
                  </Badge>
                  <span className="text-muted-foreground">
                    {(row.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="font-mono break-all">{row.issue_type}</div>
              </div>
            ))}
            {!flagged.length && (
              <p className="text-sm text-muted-foreground">No flagged images.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="text-2xl font-bold mt-1">{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}