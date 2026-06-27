import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Block = {
  visitors: number; sessions: number; product_views: number;
  add_to_cart: number; checkout: number; purchases: number;
  revenue: number; conversion_rate: number; revenue_per_visitor: number;
};

type Report = {
  ok: boolean;
  generated_at: string;
  window_days: number;
  principle: string;
  layers: {
    layer1_organic_truth: Block;
    layer2_paid_performance: Block;
    layer3_business_reality: Block;
  };
  organic_share_pct: number;
  modules: { module: string; mixes_paid: boolean; status: string; note: string }[];
  risks: string[];
};

const eur = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(n || 0);
const pct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;

export default function OrganicFirstPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("organic-first-audit", { body: {} });
    if (error) setErr(error.message); else setReport(data as Report);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <>
      <Helmet><title>Organic-First Intelligence | GetPawsy Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">🌱 Organic-First Intelligence</h1>
            <p className="text-muted-foreground max-w-3xl">
              Organic performance is the primary source of truth. Paid traffic is isolated in Layer 2 and
              only used to evaluate scaling efficiency — never as evidence of product quality.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {err && <Card><CardContent className="pt-6 text-destructive">{err}</CardContent></Card>}

        {report && (
          <>
            <div className="grid md:grid-cols-3 gap-4">
              <LayerCard tone="emerald" title="Layer 1 — Organic Truth" subtitle="PRIMARY AI learning source" block={report.layers.layer1_organic_truth} />
              <LayerCard tone="violet"  title="Layer 2 — Paid Performance" subtitle="Scaling efficiency only (ROAS / CPA)" block={report.layers.layer2_paid_performance} />
              <LayerCard tone="slate"   title="Layer 3 — Business Reality" subtitle="Blended — reporting only" block={report.layers.layer3_business_reality} />
            </div>

            <Card>
              <CardHeader><CardTitle>Organic Share — Last {report.window_days} days</CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{report.organic_share_pct}%</div>
                <p className="text-sm text-muted-foreground">Share of visitors acquired organically (excluding bots & internal).</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Engine Audit</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {report.modules.map((m) => (
                  <div key={m.module} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
                    <div className="flex-1 min-w-[12rem]">
                      <div className="font-medium">{m.module}</div>
                      <div className="text-xs text-muted-foreground">{m.note}</div>
                    </div>
                    <Badge variant={m.status === "compliant" ? "default" : m.status === "review" ? "secondary" : "destructive"}>
                      {m.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {report.risks.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Open Risks</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {report.risks.map((r, i) => <div key={i}>• {r}</div>)}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">Generated {new Date(report.generated_at).toLocaleString()} · {report.principle}</p>
          </>
        )}
        {!report && !err && <p className="text-muted-foreground">Loading audit…</p>}
      </div>
    </>
  );

  function LayerCard({ title, subtitle, block, tone }: { title: string; subtitle: string; block: Block; tone: "emerald" | "violet" | "slate" }) {
    const ring = tone === "emerald" ? "ring-emerald-500/40" : tone === "violet" ? "ring-violet-500/40" : "ring-slate-500/30";
    return (
      <Card className={`ring-1 ${ring}`}>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Row k="Visitors"        v={block.visitors.toLocaleString()} />
          <Row k="Sessions"        v={block.sessions.toLocaleString()} />
          <Row k="Product views"   v={block.product_views.toLocaleString()} />
          <Row k="Add-to-cart"     v={block.add_to_cart.toLocaleString()} />
          <Row k="Checkout"        v={block.checkout.toLocaleString()} />
          <Row k="Purchases"       v={block.purchases.toLocaleString()} />
          <Row k="Revenue"         v={eur(block.revenue)} />
          <Row k="Conversion rate" v={pct(block.conversion_rate)} />
          <Row k="Revenue / visitor" v={eur(block.revenue_per_visitor)} />
        </CardContent>
      </Card>
    );
  }
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}