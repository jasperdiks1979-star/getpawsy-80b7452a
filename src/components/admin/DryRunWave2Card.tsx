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
import { Loader2, FlaskConical, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// Certified PCIE2 Wave 2 DRY-RUN parameters — mirrors the live wave, but publishes nothing.
const DRY_RUN_PARAMS = {
  mode: "queue_drain",
  live: false,
  dry_run: true,
  limit: 10,
  product_cap: 1,
  board_cap: 3,
  min_ci_score: 75,
} as const;

type PublishResult = {
  published?: number;
  failed?: number;
  failed_count?: number;
  skipped?: number;
  skipped_count?: number;
  pin_ids?: string[];
  selected_count?: number;
  would_post?: number;
  selected_ids?: string[];
  published_pins?: Array<{ pin_id?: string; board_id?: string; product_id?: string; category?: string }>;
  planned_pins?: Array<{ pin_id?: string; board_id?: string; product_id?: string; category?: string }>;
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

export function DryRunWave2Card() {
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"PASS" | "FAIL" | null>(null);

  async function runDry() {
    setRunning(true);
    setError(null);
    setResult(null);
    setVerdict(null);
    const started = performance.now();
    try {
      const { data, error: fnError } = await supabase.functions.invoke("pcie2-publisher", {
        body: DRY_RUN_PARAMS,
      });
      if (fnError) throw new Error(fnError.message);
      const r = (data ?? {}) as PublishResult;

      // Dry runs return selected_count / would_post / selected_ids, not published / planned_pins.
      const pins = (r.published_pins ?? r.planned_pins ?? r.selected_ids?.map((id) => ({ pin_id: id })) ?? []) as Array<Record<string, unknown>>;
      const board_distribution = r.board_distribution ?? tally(pins, "board_id");
      const product_distribution = r.product_distribution ?? tally(pins, "product_id");
      const category_distribution = r.category_distribution ?? tally(pins, "category");
      const pin_ids = r.selected_ids ?? r.pin_ids ?? (pins.map((p) => p.pin_id).filter(Boolean) as string[]);

      const enriched: PublishResult = {
        ...r,
        pin_ids,
        board_distribution,
        product_distribution,
        category_distribution,
        duration_ms: r.duration_ms ?? Math.round(performance.now() - started),
      };
      setResult(enriched);

      // Dry-run PASS: publisher reports 10 eligible/planned with no failures.
      const planned = Number(r.would_post ?? r.selected_count ?? pins.length ?? 0);
      const failed = Number(r.failed_count ?? r.failed ?? 0);
      const skipped = Number(r.skipped_count ?? r.skipped ?? 0);
      const pass = planned === 10 && failed === 0;
      setVerdict(pass ? "PASS" : "FAIL");
      if (pass) toast.success("Dry-run PASS — 10 pins would publish, 0 failed");
      else toast.error(`Dry-run FAIL — planned=${planned}, failed=${failed}, skipped=${skipped}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setVerdict("FAIL");
      toast.error("Dry-run blocker", { description: msg });
    } finally {
      setRunning(false);
    }
  }

  const planned = Number(result?.would_post ?? result?.selected_count ?? 0);
  const failed = Number(result?.failed_count ?? result?.failed ?? 0);
  const skipped = Number(result?.skipped_count ?? result?.skipped ?? 0);

  return (
    <Card className="border-muted-foreground/30 bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          PCIE2 Wave 2 — dry run
        </CardTitle>
        <CardDescription>
          Simulates the certified <code className="font-mono text-xs">pcie2-publisher</code>{" "}
          <code className="font-mono text-xs">queue_drain</code> with{" "}
          <code className="font-mono text-xs">live=false, dry_run=true</code>. Nothing is published;
          same verifier output as the live wave.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">limit=10</Badge>
          <Badge variant="outline">product_cap=1</Badge>
          <Badge variant="outline">board_cap=3</Badge>
          <Badge variant="outline">min_ci_score=75</Badge>
          <Badge variant="outline">live=false</Badge>
          <Badge variant="outline">dry_run=true</Badge>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button size="lg" variant="secondary" disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
              {running ? "Simulating…" : "Dry Run Wave 2 (simulate 10 pins)"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Simulate Wave 2 (no publishing)?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <div>This will invoke the certified PCIE2 publisher in dry-run mode. No pins will be published and the queue will not be mutated.</div>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    <li>1 pin per product · max 3 pins per board · CI ≥ 75</li>
                    <li>Guardian, CI, board/product/quality gates evaluated</li>
                    <li>No Pinterest API writes, no content or image generation</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={runDry}>Simulate now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {verdict && (
          <div className={`rounded-md border p-3 flex items-center gap-2 ${verdict === "PASS" ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
            {verdict === "PASS" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
            <div className="font-semibold">{verdict}</div>
            <div className="text-xs text-muted-foreground ml-auto">
              planned={planned} · failed={failed} · skipped={skipped}
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
            <Section title="Planned pin IDs">
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