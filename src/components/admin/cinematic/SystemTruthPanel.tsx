import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, Eye, Archive, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Truth = {
  ok: boolean;
  supabaseHost: string;
  expectedSupabaseHost: string;
  hostMatch: boolean;
  worker: {
    healthy: boolean;
    lastSeenAt: string | null;
    ageSeconds: number | null;
    safeMode: boolean | null;
    reportedHost: string | null;
    hostMatch: boolean;
  };
  counts: { queueDepth: number; publishable: number; blocked: number };
  lastSuccessfulRender: { product_slug: string; render_complete_at: string } | null;
  lastVerifiedPin: { product_slug: string; pinterest_pin_url: string; verified_at: string } | null;
  lastError: { product_slug: string; worker_last_error?: string; error_message?: string; updated_at: string } | null;
  blocker: string | null;
};

function fmtAge(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function SystemTruthPanel() {
  const [truth, setTruth] = useState<Truth | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-system-truth");
      if (error) throw error;
      setTruth(data as Truth);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load system truth");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const verifyPins = async () => {
    setBusy("verify");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-job-verify", { body: { limit: 50 } });
      if (error) throw error;
      toast.success(`Verified ${(data as any)?.checked ?? 0} jobs`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Verify failed");
    } finally {
      setBusy(null);
    }
  };

  const archiveStale = async () => {
    setBusy("archive");
    try {
      const { data: dry, error: dErr } = await supabase.functions.invoke("cinematic-ads-archive-stale", { body: { dryRun: true } });
      if (dErr) throw dErr;
      const candidates = (dry as any)?.candidates ?? 0;
      if (!candidates) { toast.info("No stale duplicates found"); return; }
      if (!confirm(`Archive ${candidates} stale/duplicate jobs? This does NOT delete remote Pinterest pins.`)) return;
      const { data, error } = await supabase.functions.invoke("cinematic-ads-archive-stale", { body: { dryRun: false, limit: candidates } });
      if (error) throw error;
      toast.success(`Archived ${(data as any)?.archived ?? 0} jobs`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Archive failed");
    } finally {
      setBusy(null);
    }
  };

  const t = truth;
  const workerOk = t?.worker?.healthy && t?.hostMatch;

  return (
    <Card className="border-2">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> System Truth Panel
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Health check
          </Button>
          <Button size="sm" variant="outline" onClick={verifyPins} disabled={busy === "verify"}>
            {busy === "verify" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Verify Pinterest pins
          </Button>
          <Button size="sm" variant="outline" onClick={archiveStale} disabled={busy === "archive"}>
            {busy === "archive" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
            Archive stale duplicates
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {!t ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Worker" value={workerOk ? "Healthy" : "Unhealthy"} tone={workerOk ? "ok" : "bad"} sub={fmtAge(t.worker.ageSeconds)} />
              <Stat
                label="Supabase host"
                value={t.hostMatch ? "Match" : "MISMATCH"}
                tone={t.hostMatch ? "ok" : "bad"}
                sub={t.supabaseHost}
              />
              <Stat label="Queue depth" value={String(t.counts.queueDepth)} tone="neutral" />
              <Stat label="Publishable" value={String(t.counts.publishable)} tone={t.counts.publishable > 0 ? "ok" : "neutral"} sub={`${t.counts.blocked} blocked`} />
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-muted-foreground">Last successful render</div>
                <div className="truncate font-medium">
                  {t.lastSuccessfulRender ? `${t.lastSuccessfulRender.product_slug} · ${new Date(t.lastSuccessfulRender.render_complete_at).toLocaleString()}` : "—"}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-muted-foreground">Last verified Pinterest pin</div>
                <div className="truncate font-medium">
                  {t.lastVerifiedPin ? (
                    <a className="underline" href={t.lastVerifiedPin.pinterest_pin_url} target="_blank" rel="noreferrer">
                      {t.lastVerifiedPin.product_slug}
                    </a>
                  ) : "—"}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="text-muted-foreground">Last error</div>
                <div className="truncate font-medium text-destructive">
                  {t.lastError ? (t.lastError.worker_last_error || t.lastError.error_message || "—") : "—"}
                </div>
              </div>
            </div>

            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <div className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4" /> Why nothing is happening?
              </div>
              <div className="mt-1 text-muted-foreground">
                {t.blocker ? <Badge variant="destructive">{t.blocker}</Badge> : <Badge variant="secondary">No blocker — pipeline operational</Badge>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "ok" | "bad" | "neutral" }) {
  const cls = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}