import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type QueueHealth = {
  queued_count: number;
  active_rendering_count: number;
  oldest_queued_at: string | null;
  oldest_queued_age_seconds: number | null;
  last_claimed_job: {
    id: string;
    product_slug: string;
    render_worker_id: string | null;
    render_started_at: string;
  } | null;
  last_successful_mp4: {
    id: string;
    product_slug: string;
    output_mp4_url: string;
    render_complete_at: string;
  } | null;
};

function formatAge(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function ageBadge(seconds: number | null) {
  if (seconds == null) return <Badge variant="secondary">no jobs queued</Badge>;
  if (seconds < 300) return <Badge variant="secondary">{formatAge(seconds)}</Badge>;
  if (seconds < 1800) return <Badge>{formatAge(seconds)}</Badge>;
  return <Badge variant="destructive">{formatAge(seconds)}</Badge>;
}

export default function CinematicQueueHealthPage() {
  const [health, setHealth] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "health" },
      });
      if (error) throw error;
      const qh = (data as any)?.snapshot?.queueHealth as QueueHealth | null;
      setHealth(qh ?? null);
      setUpdatedAt(new Date());
      if (showToast) toast.success("Refreshed");
    } catch (e: any) {
      console.error("[queue-health] load failed", e);
      toast.error(e?.message ?? "Failed to load queue health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(t);
  }, [load]);

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <Helmet>
        <title>Queue Health — Cinematic Ads</title>
      </Helmet>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Queue Health</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live snapshot of the cinematic render queue. Auto-refreshes every 15s.
          </p>
        </div>
        <Button onClick={() => load(true)} disabled={loading} variant="outline" size="sm">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{health?.queued_count ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">jobs waiting for a worker</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Rendering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{health?.active_rendering_count ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">jobs actively encoding</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Oldest queued age
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold flex items-center gap-2">
              {ageBadge(health?.oldest_queued_age_seconds ?? null)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {health?.oldest_queued_at
                ? new Date(health.oldest_queued_at).toLocaleString()
                : "no queued jobs"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last claimed job</CardTitle>
        </CardHeader>
        <CardContent>
          {health?.last_claimed_job ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Job ID</span>
                <code className="font-mono text-xs">{health.last_claimed_job.id}</code>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copy(health.last_claimed_job!.id)}>
                  Copy
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Product</span>
                <span>{health.last_claimed_job.product_slug}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Worker</span>
                <span>{health.last_claimed_job.render_worker_id ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Claimed at</span>
                <span>{new Date(health.last_claimed_job.render_started_at).toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs have been claimed yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last successful MP4</CardTitle>
        </CardHeader>
        <CardContent>
          {health?.last_successful_mp4 ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Job ID</span>
                <code className="font-mono text-xs">{health.last_successful_mp4.id}</code>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => copy(health.last_successful_mp4!.id)}>
                  Copy
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Product</span>
                <span>{health.last_successful_mp4.product_slug}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">Completed</span>
                <span>{new Date(health.last_successful_mp4.render_complete_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-32">MP4</span>
                <a
                  href={health.last_successful_mp4.output_mp4_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-primary truncate"
                >
                  open
                </a>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No renders have completed yet.</p>
          )}
        </CardContent>
      </Card>

      {updatedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Last updated {updatedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
