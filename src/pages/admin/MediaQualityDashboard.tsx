import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw } from "lucide-react";

type Counts = {
  total: number;
  clean: number;
  review: number;
  blocked: number;
  excluded_products: number;
  manual_review_products: number;
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

export default function MediaQualityDashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [flagged, setFlagged] = useState<FlaggedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: ma }, { data: r }, { data: f }, { data: excluded }] =
      await Promise.all([
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

    setCounts({
      total: rows.length,
      clean,
      review,
      blocked,
      excluded_products: (excluded as any)?.length ?? 0,
      manual_review_products: manualReview,
    });
    setRuns((r ?? []) as Run[]);
    setFlagged((f ?? []) as FlaggedRow[]);
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
          <Button onClick={runScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Run scan (50)
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

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
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