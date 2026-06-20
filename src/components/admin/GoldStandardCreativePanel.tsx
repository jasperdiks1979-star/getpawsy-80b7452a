import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, RefreshCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface AuditResult {
  ok: boolean;
  scanned: number;
  gold: number;
  medium: number;
  low: number;
  gold_pct: number;
  thresholds: { min: number; priority: number };
  benchmark: { id: string; name: string; product_slug: string } | null;
}

export default function GoldStandardCreativePanel() {
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(fn: string, label: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      if (fn === "gold-standard-audit" && data?.ok) setAudit(data as AuditResult);
      toast.success(`${label}: ${JSON.stringify(data).slice(0, 160)}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" /> Gold Standard Creative System
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" disabled={!!busy} onClick={() => run("gold-standard-audit", "Audit")}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Audit videos
          </Button>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("gold-standard-winner-clone", "Winner DNA")}>
            <Sparkles className="h-4 w-4 mr-1" /> Capture winner DNA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {audit ? (
          <>
            <div className="text-xs text-muted-foreground">
              Benchmark: <span className="font-semibold">{audit.benchmark?.name ?? "—"}</span>{" "}
              · Min score {audit.thresholds.min} · Priority {audit.thresholds.priority}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Scanned" value={String(audit.scanned)} />
              <Stat label="Gold Standard" value={`${audit.gold} (${audit.gold_pct}%)`} accent="text-amber-600" />
              <Stat label="Medium" value={String(audit.medium)} />
              <Stat label="Low quality" value={String(audit.low)} accent="text-destructive" />
            </div>
            <p className="text-xs text-muted-foreground">
              Low-tier videos are blocked from publishing automatically. New generations are biased toward Gold benchmarks and winner DNA.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Click <strong>Audit videos</strong> to score every cinematic ad against the Gold Standard benchmark
            (Voice · Motion · Product Visibility · Conversion · Brand).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${accent ?? ""}`}>{value}</div>
    </div>
  );
}