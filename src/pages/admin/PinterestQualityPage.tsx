import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, ShieldCheck, RefreshCw, Ban, Sparkles } from "lucide-react";
import { toast } from "sonner";

type ScrubResult = {
  ok: boolean;
  traceId: string;
  dryRun: boolean;
  autopilot_disabled: boolean;
  pin_hits: number;
  video_hits: number;
  rejected_pins: number;
  rejected_videos: number;
  reason_code: string;
  top_terms: Array<{ term: string; count: number }>;
  samples: { pins: unknown[]; videos: unknown[] };
};

type Counts = {
  published_today: number;
  rejected_today: number;
  queued: number;
  rejected_7d_reasons: Array<{ reason: string; n: number }>;
  categories: Array<{ category_key: string | null; n: number }>;
};

export default function PinterestQualityPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [scrub, setScrub] = useState<ScrubResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gate, setGate] = useState<any | null>(null);

  async function loadCounts() {
    setBusy("counts");
    try {
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const [pub, rej, queued, recentRej, last100] = await Promise.all([
        supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", dayAgo),
        supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("updated_at", dayAgo),
        supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "scheduled", "draft"]),
        supabase.from("pinterest_pin_queue").select("rejection_reason").eq("status", "rejected").gte("updated_at", weekAgo).limit(500),
        supabase.from("pinterest_pin_queue").select("category_key").eq("status", "posted").order("posted_at", { ascending: false }).limit(100),
      ]);
      const reasonMap = new Map<string, number>();
      for (const r of recentRej.data ?? []) {
        const key = (r.rejection_reason ?? "unknown").slice(0, 80);
        reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
      }
      const catMap = new Map<string | null, number>();
      for (const r of last100.data ?? []) {
        catMap.set(r.category_key ?? null, (catMap.get(r.category_key ?? null) ?? 0) + 1);
      }
      setCounts({
        published_today: pub.count ?? 0,
        rejected_today: rej.count ?? 0,
        queued: queued.count ?? 0,
        rejected_7d_reasons: Array.from(reasonMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([reason, n]) => ({ reason, n })),
        categories: Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).map(([category_key, n]) => ({ category_key, n })),
      });
    } catch (e) {
      toast.error(`Counts failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runScrub(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "scrub");
    try {
      const { data, error } = await supabase.functions.invoke<ScrubResult>("pinterest-quality-gate-scrub", {
        body: { dryRun, disableDirectCjVideo: !dryRun },
      });
      if (error) throw error;
      setScrub(data!);
      toast.success(
        dryRun
          ? `Scan: ${data!.pin_hits} pin / ${data!.video_hits} video hits`
          : `Rejected ${data!.rejected_pins} pins, ${data!.rejected_videos} videos`,
      );
      await loadCounts();
    } catch (e) {
      toast.error(`Scrub failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runGate(dryRun: boolean) {
    setBusy(dryRun ? "gate-dry" : "gate-apply");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-native-prepublish-gate", {
        body: { dryRun, sampleSize: 300, minScore: 55 },
      });
      if (error) throw error;
      setGate(data);
      toast.success(
        dryRun
          ? `Simulated ${data.sampleSize} pins • avg native ${data.avgNativeScore} • ${data.counts.reject} reject, ${data.counts.downrank} downrank`
          : `Rebalanced: ${data.applied.rejects} rejected, ${data.applied.downranks} downranked`,
      );
      await loadCounts();
    } catch (e) {
      toast.error(`Gate failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-7 h-7 text-primary" /> Pinterest Quality Gate
        </h1>
        <p className="text-muted-foreground max-w-3xl">
          Always-on publishing gate. Blocks supplier marketing slides, certificates, manuals,
          AliExpress/CJ artifacts, factory imagery and CJK text from reaching Pinterest. Direct
          CJ Video → Pinterest publishing is disabled here.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Published today</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{counts?.published_today ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Rejected today</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-destructive">{counts?.rejected_today ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Queue depth</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{counts?.queued ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Banned hits in queue</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold text-amber-600">
            {scrub ? scrub.pin_hits + scrub.video_hits : "—"}
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> Emergency Cleanup</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy !== null} onClick={() => runScrub(true)}>
            {busy === "dry" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Scan (dry-run)
          </Button>
          <Button variant="destructive" disabled={busy !== null} onClick={() => runScrub(false)}>
            {busy === "scrub" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />} Reject &amp; disable direct CJ video
          </Button>
          {scrub && (
            <div className="w-full text-sm text-muted-foreground">
              Last run <code>{scrub.traceId.slice(0, 8)}</code> — {scrub.dryRun ? "dry-run" : "applied"}.
              Autopilot disabled: <Badge variant={scrub.autopilot_disabled ? "default" : "secondary"}>{String(scrub.autopilot_disabled)}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Pre-publish Native Score Gate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Simulates the latest 300 pins on Helpful / Lifestyle / Educational axes,
            then auto-rebalances drafts that fail (rejects low-native showcase or over-represented buckets,
            downranks the rest).
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy !== null} onClick={() => runGate(true)}>
              {busy === "gate-dry" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />} Simulate (dry-run)
            </Button>
            <Button disabled={busy !== null} onClick={() => runGate(false)}>
              {busy === "gate-apply" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} Apply rebalance
            </Button>
          </div>
          {gate && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-sm">
              <div>
                <div className="font-medium mb-1">Mix vs target</div>
                <ul className="space-y-0.5">
                  {Object.entries(gate.mix as Record<string, { share: number; target: number; over: boolean }>).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span>{k}</span>
                      <span className={v.over ? "text-destructive" : "text-muted-foreground"}>
                        {(v.share * 100).toFixed(1)}% / {(v.target * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="font-medium mb-1">Summary</div>
                <ul className="space-y-0.5 text-muted-foreground">
                  <li>Avg native score: <span className="text-foreground font-medium">{gate.avgNativeScore}</span></li>
                  <li>Drafts evaluated: {gate.drafts}</li>
                  <li>Planned reject: {gate.counts.reject} • downrank: {gate.counts.downrank} • keep: {gate.counts.keep}</li>
                  <li>Applied: {gate.applied.rejects} rejected, {gate.applied.downranks} downranked</li>
                  <li>Over-share categories: {Object.keys(gate.overCategories).join(", ") || "none"}</li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Top rejection reasons (7d)</CardTitle></CardHeader>
          <CardContent>
            {counts?.rejected_7d_reasons?.length ? (
              <ul className="space-y-1 text-sm">
                {counts.rejected_7d_reasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-2">
                    <span className="truncate">{r.reason}</span><Badge variant="outline">{r.n}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Category diversity (last 100 published)</CardTitle></CardHeader>
          <CardContent>
            {counts?.categories?.length ? (
              <ul className="space-y-1 text-sm">
                {counts.categories.map((c) => (
                  <li key={String(c.category_key)} className="flex justify-between gap-2">
                    <span>{c.category_key ?? "(uncategorized)"}</span>
                    <Badge variant={c.n > 35 ? "destructive" : c.n > 20 ? "secondary" : "outline"}>{c.n}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No publishes yet.</p>}
          </CardContent>
        </Card>
      </div>

      {scrub?.top_terms?.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Banned terms detected</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {scrub.top_terms.map((t) => (
              <Badge key={t.term} variant="destructive">{t.term} × {t.count}</Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}