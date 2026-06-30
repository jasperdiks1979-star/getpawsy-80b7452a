import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ListChecks } from "lucide-react";

type Counts = Record<string, number>;
type Pin = {
  id: string;
  status: string;
  title: string | null;
  destination_url: string | null;
  pin_image_url: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string | null;
};
type Job = {
  id: string;
  status: string;
  product_id: string | null;
  attempts: number | null;
  created_at: string;
  updated_at: string | null;
  error: string | null;
};
type Strike = {
  product_id: string;
  fsps_score: number | null;
  estimated_hours_to_first_sale: number | null;
  rank: number | null;
};

async function countBy(table: string, col = "status"): Promise<Counts> {
  const out: Counts = {};
  const { data, error } = await (supabase as any).from(table).select(`${col}`).limit(10000);
  if (error || !data) return out;
  for (const row of data) {
    const k = String(row[col] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export default function PinterestPinQueuePage() {
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Counts>({});
  const [jobCounts, setJobCounts] = useState<Counts>({});
  const [recentPins, setRecentPins] = useState<Pin[]>([]);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [strike, setStrike] = useState<Strike[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [qc, jc, pins, jobs, str] = await Promise.all([
          countBy("pinterest_pin_queue"),
          countBy("pinterest_creative_factory_jobs"),
          (supabase as any)
            .from("pinterest_pin_queue")
            .select("id,status,title,destination_url,pin_image_url,scheduled_for,created_at,updated_at")
            .order("created_at", { ascending: false })
            .limit(50),
          (supabase as any)
            .from("pinterest_creative_factory_jobs")
            .select("id,status,product_id,attempts,created_at,updated_at,error")
            .order("created_at", { ascending: false })
            .limit(50),
          (supabase as any)
            .from("gv6_first_sale_scores")
            .select("product_id,fsps_score,estimated_hours_to_first_sale,rank")
            .order("rank", { ascending: true })
            .limit(10),
        ]);
        if (cancelled) return;
        setQueueCounts(qc);
        setJobCounts(jc);
        setRecentPins((pins.data ?? []) as Pin[]);
        setRecentJobs((jobs.data ?? []) as Job[]);
        setStrike((str.data ?? []) as Strike[]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const sum = (c: Counts, keys: string[]) =>
    keys.reduce((acc, k) => acc + (c[k] ?? 0), 0);

  const cfPending = jobCounts["pending"] ?? 0;
  const cfRetry = jobCounts["retry"] ?? 0;
  const cfCompleted = jobCounts["completed"] ?? 0;
  const qDraft = queueCounts["draft"] ?? 0;
  const qQueued = sum(queueCounts, ["ready", "queued", "scheduled", "pending"]);
  const qPublished = sum(queueCounts, ["published", "posted"]);
  const qFailed = sum(queueCounts, ["failed", "rejected", "blocked_legacy_source"]);

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>Pinterest Pin Queue — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Pinterest Pin Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Creative Factory jobs, V6.2 First Sale Strike targets, and the full pin lifecycle.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/pinterest-scheduler">Scheduler →</Link>
          </Button>
        </div>
      </header>

      {err && (
        <div className="border border-destructive/40 bg-destructive/5 text-destructive p-3 rounded text-sm">
          {err}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">CF Pending</CardTitle></CardHeader><CardContent className="text-3xl">{cfPending}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">CF Retry</CardTitle></CardHeader><CardContent className="text-3xl">{cfRetry}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">CF Completed</CardTitle></CardHeader><CardContent className="text-3xl">{cfCompleted}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Strike-10 Targets</CardTitle></CardHeader><CardContent className="text-3xl">{strike.length}</CardContent></Card>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Pin Draft</CardTitle></CardHeader><CardContent className="text-3xl">{qDraft}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pin Queued</CardTitle></CardHeader><CardContent className="text-3xl">{qQueued}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pin Published</CardTitle></CardHeader><CardContent className="text-3xl">{qPublished}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pin Rejected/Failed</CardTitle></CardHeader><CardContent className="text-3xl">{qFailed}</CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle>Queue status breakdown</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(queueCounts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
            <Badge key={s} variant="outline">{s}: {n}</Badge>
          ))}
          {Object.keys(queueCounts).length === 0 && <span className="text-sm text-muted-foreground">No pins.</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>V6.2 First Sale Strike — top targets</CardTitle></CardHeader>
        <CardContent>
          {strike.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Strike scores available.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Rank</th><th className="p-2">Product</th><th className="p-2">FSPS</th><th className="p-2">ETA (h)</th></tr></thead>
              <tbody>
                {strike.map((s) => (
                  <tr key={s.product_id} className="border-t">
                    <td className="p-2">{s.rank ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{s.product_id.slice(0, 8)}</td>
                    <td className="p-2">{s.fsps_score?.toFixed?.(1) ?? "—"}</td>
                    <td className="p-2">{s.estimated_hours_to_first_sale ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Creative Factory jobs</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Created</th><th className="p-2">Status</th><th className="p-2">Product</th><th className="p-2">Attempts</th><th className="p-2">Error</th></tr></thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="p-2"><Badge variant={j.status === "completed" ? "default" : j.status === "retry" || j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge></td>
                    <td className="p-2 font-mono text-xs">{j.product_id?.slice(0, 8) ?? "—"}</td>
                    <td className="p-2">{j.attempts ?? 0}</td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[280px]">{j.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent pins</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : recentPins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pins.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Created</th><th className="p-2">Status</th><th className="p-2">Title</th><th className="p-2">Scheduled</th></tr></thead>
              <tbody>
                {recentPins.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(p.created_at).toLocaleString()}</td>
                    <td className="p-2"><Badge variant={p.status === "posted" || p.status === "published" ? "default" : p.status === "failed" || p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge></td>
                    <td className="p-2 truncate max-w-[420px]">{p.title ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}