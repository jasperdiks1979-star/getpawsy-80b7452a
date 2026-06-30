import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Row = {
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  crs: number;
  trust_score: number;
  mobile_score: number;
  image_score: number;
  copy_score: number;
  signal_score: number;
  expected_revenue_lift: number;
  expected_conv_lift: number;
  frictions: string[];
  confidence: number;
  computed_at: string;
};

type Run = {
  id: string;
  products_analyzed: number;
  products_improved: number;
  avg_crs: number | null;
  avg_trust: number | null;
  total_expected_revenue_lift: number | null;
  first_sale_eta_hours: number | null;
  finished_at: string | null;
};

export default function ConversionIntelligencePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: runs }] = await Promise.all([
      supabase.from("gci_scores").select("*").order("expected_revenue_lift", { ascending: false }).limit(100),
      supabase.from("gci_runs").select("*").order("started_at", { ascending: false }).limit(1),
    ]);
    setRows((r as Row[]) ?? []);
    setRun(((runs as Run[]) ?? [])[0] ?? null);
  };

  useEffect(() => { void load(); }, []);

  const runNow = async () => {
    setBusy(true);
    try {
      await supabase.functions.invoke("genesis-conversion-intelligence", { body: {} });
      await load();
    } finally { setBusy(false); }
  };

  const topCrs = [...rows].sort((a, b) => b.crs - a.crs).slice(0, 10);
  const topFriction = [...rows].sort((a, b) => (b.frictions?.length ?? 0) - (a.frictions?.length ?? 0)).slice(0, 10);
  const lowTrust = [...rows].sort((a, b) => a.trust_score - b.trust_score).slice(0, 10);
  const lowMobile = [...rows].sort((a, b) => a.mobile_score - b.mobile_score).slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Genesis V6.1 — Conversion Intelligence</h1>
          <p className="text-sm text-muted-foreground">Orchestration layer for First Sale optimisation. Reuses FSPS, Revenue Brain, Pin Queue.</p>
        </div>
        <Button onClick={runNow} disabled={busy}>{busy ? "Running..." : "Run cycle"}</Button>
      </header>

      {run && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Analyzed" value={run.products_analyzed} />
          <Stat label="Reprioritized" value={run.products_improved} />
          <Stat label="Avg CRS" value={(run.avg_crs ?? 0).toFixed(1)} />
          <Stat label="Avg Trust" value={(run.avg_trust ?? 0).toFixed(1)} />
          <Stat label="First-sale ETA (h)" value={run.first_sale_eta_hours ?? "—"} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Top Conversion Readiness" rows={topCrs} field="crs" />
        <Panel title="Highest Expected Revenue Lift" rows={rows.slice(0, 10)} field="expected_revenue_lift" />
        <Panel title="Highest Friction" rows={topFriction} field={(r) => r.frictions?.length ?? 0} />
        <Panel title="Weakest Trust" rows={lowTrust} field="trust_score" />
        <Panel title="Weakest Mobile" rows={lowMobile} field="mobile_score" />
        <FrictionSummary rows={rows} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value as any}</div>
    </Card>
  );
}

function Panel({ title, rows, field }: { title: string; rows: Row[]; field: keyof Row | ((r: Row) => number) }) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ol className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.product_id} className="flex items-center justify-between gap-2">
            <a href={`/products/${r.product_slug}`} target="_blank" rel="noreferrer" className="truncate hover:underline">{r.product_name ?? r.product_id}</a>
            <span className="font-mono tabular-nums text-muted-foreground">
              {typeof field === "function" ? field(r) : String(r[field] ?? "")}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function FrictionSummary({ rows }: { rows: Row[] }) {
  const tally = new Map<string, number>();
  for (const r of rows) for (const f of r.frictions ?? []) tally.set(f, (tally.get(f) ?? 0) + 1);
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Truthful Bottlenecks (top 100)</h3>
      <ul className="space-y-1 text-sm">
        {sorted.map(([k, v]) => (
          <li key={k} className="flex justify-between"><span>{k}</span><span className="font-mono">{v}</span></li>
        ))}
      </ul>
    </Card>
  );
}