import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Rocket, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Certified PCIE2 Wave 2 parameters — DO NOT MODIFY.
// Uses ONLY the certified pcie2-publisher queue_drain flow.
const WAVE_PARAMS = {
  mode: "queue_drain",
  live: true,
  dry_run: false,
  limit: 10,
  product_cap: 1,
  board_cap: 3,
  min_ci_score: 75,
} as const;

type PublishResult = {
  published?: number;
  failed?: number;
  skipped?: number;
  pin_ids?: string[];
  published_pins?: Array<{ pin_id?: string; board_id?: string; product_id?: string; category?: string }>;
  board_distribution?: Record<string, number>;
  product_distribution?: Record<string, number>;
  category_distribution?: Record<string, number>;
  api_errors?: Array<{ code?: string; message?: string }>;
  rate_limits?: { hit?: boolean; retry_after_ms?: number } | null;
  queue_status?: string;
  duration_ms?: number;
  [k: string]: unknown;
};

function tally(items: Array<Record<string, unknown>> | undefined, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  (items ?? []).forEach((it) => {
    const v = (it?.[key] as string) ?? "unknown";
    out[v] = (out[v] ?? 0) + 1;
  });
  return out;
}

export function RunWave2Card() {
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"PASS" | "FAIL" | null>(null);

  async function runWave() {
    setRunning(true);
    setError(null);
    setResult(null);
    setVerdict(null);
    const started = performance.now();
    try {
      const { data, error: fnError } = await supabase.functions.invoke("pcie2-publisher", {
        body: WAVE_PARAMS,
      });
      if (fnError) throw new Error(fnError.message);
      const r = (data ?? {}) as PublishResult;

      // Derive distributions if publisher only returned raw pin rows.
      const pins = r.published_pins ?? [];
      const board_distribution = r.board_distribution ?? tally(pins as any, "board_id");
      const product_distribution = r.product_distribution ?? tally(pins as any, "product_id");
      const category_distribution = r.category_distribution ?? tally(pins as any, "category");
      const pin_ids = r.pin_ids ?? pins.map((p) => p.pin_id).filter(Boolean) as string[];

      const enriched: PublishResult = {
        ...r,
        pin_ids,
        board_distribution,
        product_distribution,
        category_distribution,
        duration_ms: r.duration_ms ?? Math.round(performance.now() - started),
      };
      setResult(enriched);

      const published = Number(enriched.published ?? 0);
      const failed = Number(enriched.failed ?? 0);
      const pass = published === 10 && failed === 0;
      setVerdict(pass ? "PASS" : "FAIL");
      if (pass) toast.success("Wave 2 PASS — 10 pins published, 0 failed");
      else toast.error(`Wave 2 FAIL — published=${published}, failed=${failed}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setVerdict("FAIL");
      toast.error("Wave 2 blocker", { description: msg });
    } finally {
      setRunning(false);
    }
  }

  const published = Number(result?.published ?? 0);
  const failed = Number(result?.failed ?? 0);
  const skipped = Number(result?.skipped ?? 0);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          PCIE2 Wave 2 — one-click publish
        </CardTitle>
        <CardDescription>
          Runs the certified <code className="font-mono text-xs">pcie2-publisher</code> in{" "}
          <code className="font-mono text-xs">queue_drain</code> mode. No new publisher, no content
          regeneration, no queue mutation beyond the normal publish flow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">limit=10</Badge>
          <Badge variant="outline">product_cap=1</Badge>
          <Badge variant="outline">board_cap=3</Badge>
          <Badge variant="outline">min_ci_score=75</Badge>
          <Badge variant="outline">live=true</Badge>
          <Badge variant="outline">dry_run=false</Badge>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button size="lg" disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              {running ? "Publishing…" : "Run Wave 2 (publish 10 pins)"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish 10 new Pinterest pins?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>This will invoke the certified PCIE2 publisher LIVE and publish up to 10 pins from the READY queue.</div>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    <li>1 pin per product · max 3 pins per board · CI ≥ 75</li>
                    <li>Guardian, CI, board/product/quality gates enforced</li>
                    <li>No content regeneration, no image generation</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={runWave}>Publish now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {verdict && (
          <div className={`rounded-md border p-3 flex items-center gap-2 ${verdict === "PASS" ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
            {verdict === "PASS" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
            <div className="font-semibold">{verdict}</div>
            <div className="text-xs text-muted-foreground ml-auto">
              published={published} · failed={failed} · skipped={skipped}
              {result?.duration_ms ? ` · ${Math.round(result.duration_ms)}ms` : ""}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> Blocker
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">{error}</pre>
          </div>
        )}

        {result && (
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            <Section title="Pinterest pin IDs">
              {result.pin_ids && result.pin_ids.length ? (
                <ul className="text-xs font-mono space-y-0.5 max-h-40 overflow-auto">
                  {result.pin_ids.map((id) => <li key={id}>{id}</li>)}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No pin IDs returned.</p>}
            </Section>
            <Section title="Board distribution">
              <DistList data={result.board_distribution} />
            </Section>
            <Section title="Product distribution">
              <DistList data={result.product_distribution} />
            </Section>
            <Section title="Category distribution">
              <DistList data={result.category_distribution} />
            </Section>
            <Section title="API errors">
              {result.api_errors && result.api_errors.length ? (
                <ul className="text-xs space-y-1">
                  {result.api_errors.map((e, i) => (
                    <li key={i} className="font-mono">{e.code ?? "ERR"}: {e.message}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">None</p>}
            </Section>
            <Section title="Rate limits / queue">
              <div className="text-xs space-y-1">
                <div>Rate-limited: <span className="font-mono">{result.rate_limits?.hit ? "yes" : "no"}</span></div>
                {result.rate_limits?.retry_after_ms ? <div>Retry after: <span className="font-mono">{result.rate_limits.retry_after_ms}ms</span></div> : null}
                <div>Queue status: <span className="font-mono">{result.queue_status ?? "unknown"}</span></div>
              </div>
            </Section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function DistList({ data }: { data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <ul className="text-xs space-y-0.5 max-h-40 overflow-auto">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-2 font-mono">
          <span className="truncate">{k}</span><span>{v}</span>
        </li>
      ))}
    </ul>
  );
}