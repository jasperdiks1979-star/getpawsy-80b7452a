import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Config {
  id: number;
  enabled: boolean;
  auto_mode: boolean;
  model: string;
  nightly_scan_enabled: boolean;
  incremental_scan_enabled: boolean;
  immediate_new_product_scan: boolean;
  max_products_per_run: number;
  estimated_credits_per_product: number;
  daily_credit_cap: number;
  intelligence_version: number;
}

interface RunRow { id: string; mode: string; status: string; products_scanned: number; products_failed: number; credits_used: number; created_at: string; }

interface DryRunResult {
  total_active_products: number;
  already_enriched: number;
  already_complete: number;
  products_requiring_enrichment: number;
  missing_google_category: number;
  missing_pinterest_mapping: number;
  missing_seo_title: number;
  missing_seo_description: number;
  missing_keywords: number;
  missing_board_assignments: number;
  feed_issues: number;
  requires_rebuild: number;
  estimated_credits: number;
  credits_per_product: number;
  estimated_runtime_seconds: number;
  engine_enabled: boolean;
  coverage: {
    catalog_health_pct: number;
    seo_coverage_pct: number;
    pinterest_coverage_pct: number;
    google_category_coverage_pct: number;
    feed_quality_pct: number;
  };
}

export default function ProductIntelligencePage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [coverage, setCoverage] = useState<{ total: number; scanned: number; ok: number; failed: number; high: number; veryHigh: number; feedIssues: number; trending: number; converters: number }>({ total: 0, scanned: 0, ok: 0, failed: 0, high: 0, veryHigh: 0, feedIssues: 0, trending: 0, converters: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: cfg }, { data: rs }, { data: pi }, { count: totalCount }] = await Promise.all([
      supabase.from("product_intelligence_config").select("*").eq("id", 1).maybeSingle(),
      supabase.from("product_intelligence_runs").select("id,mode,status,products_scanned,products_failed,credits_used,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("product_intelligence").select("scan_status,opportunity_score,trend_score,conversion_score,priority_level,feed_optimization_status"),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
    ]);
    setConfig(cfg as Config | null);
    setRuns((rs as RunRow[]) ?? []);
    const arr = (pi as { scan_status: string; opportunity_score: number | null; trend_score: number | null; conversion_score: number | null; priority_level: string | null; feed_optimization_status: string | null }[] | null) ?? [];
    setCoverage({
      total: totalCount ?? 0,
      scanned: arr.length,
      ok: arr.filter((r) => r.scan_status === "ok").length,
      failed: arr.filter((r) => r.scan_status === "failed").length,
      high: arr.filter((r) => (r.opportunity_score ?? 0) >= 90).length,
      veryHigh: arr.filter((r) => r.priority_level === "Very High").length,
      feedIssues: arr.filter((r) => r.feed_optimization_status === "needs_attention").length,
      trending: arr.filter((r) => (r.trend_score ?? 0) >= 70).length,
      converters: arr.filter((r) => (r.conversion_score ?? 0) >= 70).length,
    });
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const updateConfig = async (patch: Partial<Config>) => {
    if (!config) return;
    const { error } = await supabase.from("product_intelligence_config").update(patch).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Config updated");
    void load();
  };

  const invoke = async (mode: string, label: string) => {
    setBusy(label);
    const { data, error } = await supabase.functions.invoke("product-intelligence-orchestrator", { body: { mode, trigger_source: "manual" } });
    setBusy(null);
    if (error) return toast.error(error.message);
    if (mode === "dry_run" && data && (data as DryRunResult).total_active_products !== undefined) {
      setDryRun(data as DryRunResult);
      toast.success(`Dry run complete — ${(data as DryRunResult).estimated_credits} credits estimated`);
    } else if ((data as { killed?: boolean })?.killed) {
      toast.warning((data as { message?: string }).message ?? "Engine disabled");
    } else {
      toast.success(`${label} complete`);
    }
    void load();
  };

  const exportCsv = async () => {
    const { data } = await supabase
      .from("product_intelligence")
      .select("product_id,priority_level,opportunity_score,conversion_score,trend_score,merchant_feed_quality_score,intent_type,primary_board,seo_title,pinterest_title,feed_optimization_status");
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) { toast.info("No intelligence rows yet"); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `product-intelligence-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <>
      <Helmet><title>Product Intelligence Engine | GetPawsy Admin</title></Helmet>
      <div className="container max-w-6xl mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Product Intelligence Engine</h1>
            <p className="text-muted-foreground mt-1">Autonomous product enrichment — Google category, Pinterest topics/boards, SEO, intent, opportunity score.</p>
          </div>
          <Badge variant={config?.enabled ? "default" : "destructive"} className="text-sm">{config?.enabled ? "ACTIVE" : "DORMANT"}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle>Master Controls</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Engine enabled (master switch)" value={!!config?.enabled} onChange={(v) => updateConfig({ enabled: v })} />
            <Row label="Auto mode" value={!!config?.auto_mode} onChange={(v) => updateConfig({ auto_mode: v })} />
            <Row label="Nightly scan (02:00 UTC)" value={!!config?.nightly_scan_enabled} onChange={(v) => updateConfig({ nightly_scan_enabled: v })} />
            <Row label="Incremental scan (30min)" value={!!config?.incremental_scan_enabled} onChange={(v) => updateConfig({ incremental_scan_enabled: v })} />
            <Row label="Immediate scan on new product" value={!!config?.immediate_new_product_scan} onChange={(v) => updateConfig({ immediate_new_product_scan: v })} />
            <div className="grid grid-cols-3 gap-4 pt-2 text-sm">
              <div><div className="text-muted-foreground">Model</div><div className="font-mono">{config?.model}</div></div>
              <div><div className="text-muted-foreground">Est. credits/product</div><div>{config?.estimated_credits_per_product}</div></div>
              <div><div className="text-muted-foreground">Max per run</div><div>{config?.max_products_per_run}</div></div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Active products" value={coverage.total} />
          <Stat label="Scanned" value={coverage.scanned} />
          <Stat label="OK" value={coverage.ok} />
          <Stat label="Failed" value={coverage.failed} />
          <Stat label="Very High priority" value={coverage.veryHigh} />
          <Stat label="Trending (≥70)" value={coverage.trending} />
          <Stat label="High converters" value={coverage.converters} />
          <Stat label="Feed issues" value={coverage.feedIssues} />
          <Stat label="Opportunity ≥90" value={coverage.high} />
        </div>

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => invoke("dry_run", "Dry run")} disabled={!!busy} variant="outline">{busy === "Dry run" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dry run"}</Button>
            <Button onClick={() => invoke("scan", "Scan batch")} disabled={!!busy || !config?.enabled}>{busy === "Scan batch" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan batch"}</Button>
            <Button onClick={() => invoke("scan_all", "Scan all")} disabled={!!busy || !config?.enabled} variant="secondary">{busy === "Scan all" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Scan all"}</Button>
            <Button onClick={() => invoke("force_rebuild", "Force rebuild")} disabled={!!busy || !config?.enabled} variant="destructive">{busy === "Force rebuild" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Force rebuild"}</Button>
            <Button onClick={() => invoke("rebuild_category", "Rebuild category")} disabled={!!busy || !config?.enabled} variant="outline">Rebuild category</Button>
            <Button onClick={() => invoke("rebuild_pinterest", "Rebuild Pinterest")} disabled={!!busy || !config?.enabled} variant="outline">Rebuild Pinterest</Button>
            <Button onClick={() => invoke("rebuild_seo", "Rebuild SEO")} disabled={!!busy || !config?.enabled} variant="outline">Rebuild SEO</Button>
            <Button onClick={exportCsv} variant="outline">Export CSV</Button>
          </CardContent>
        </Card>

        {dryRun && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Dry Run Results</span>
                <Badge variant={dryRun.engine_enabled ? "default" : "secondary"}>
                  {dryRun.engine_enabled ? "Engine ON" : "Engine OFF · 0 credits used"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Catalog health" value={dryRun.coverage.catalog_health_pct} suffix="%" />
                <Stat label="SEO coverage" value={dryRun.coverage.seo_coverage_pct} suffix="%" />
                <Stat label="Pinterest coverage" value={dryRun.coverage.pinterest_coverage_pct} suffix="%" />
                <Stat label="Google category" value={dryRun.coverage.google_category_coverage_pct} suffix="%" />
                <Stat label="Feed quality" value={dryRun.coverage.feed_quality_pct} suffix="%" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Estimated cost (credits)" value={dryRun.estimated_credits} />
                <Stat label="Est. runtime (sec)" value={dryRun.estimated_runtime_seconds} />
                <Stat label="Requiring enrichment" value={dryRun.products_requiring_enrichment} />
                <Stat label="Already complete" value={dryRun.already_complete} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Missing Google cat." value={dryRun.missing_google_category} />
                <Stat label="Missing Pinterest map" value={dryRun.missing_pinterest_mapping} />
                <Stat label="Missing SEO title" value={dryRun.missing_seo_title} />
                <Stat label="Missing SEO desc." value={dryRun.missing_seo_description} />
                <Stat label="Missing keywords" value={dryRun.missing_keywords} />
                <Stat label="Missing board assign." value={dryRun.missing_board_assignments} />
                <Stat label="Feed issues" value={dryRun.feed_issues} />
                <Stat label="Requires rebuild" value={dryRun.requires_rebuild} />
              </div>
              <p className="text-xs text-muted-foreground">
                Dry run is always free. {dryRun.products_requiring_enrichment} products × {dryRun.credits_per_product} cr/product = {dryRun.estimated_credits} credits to fully enrich.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
          <CardContent>
            {runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : (
              <div className="space-y-2">
                {runs.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b py-2">
                    <div className="flex items-center gap-3">
                      <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                      <span className="font-mono">{r.mode}</span>
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-muted-foreground">scanned {r.products_scanned} · failed {r.products_failed} · {Number(r.credits_used).toFixed(1)} cr</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between"><span className="text-sm">{label}</span><Switch checked={value} onCheckedChange={onChange} /></div>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></CardContent></Card>
  );
}