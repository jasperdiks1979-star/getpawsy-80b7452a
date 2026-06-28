import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";

type Review = {
  id: string;
  week_start: string;
  generated_at: string;
  kpis: any;
  ceo_summary: string | null;
  top_3_actions: any[];
  markdown: string | null;
  evidence: any;
};

export default function FounderReviewPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("fos_reviews")
      .select("*").order("week_start", { ascending: false }).limit(1).maybeSingle();
    setReview(data as Review | null);
    setLoading(false);
  }

  async function regenerate() {
    setBusy(true);
    try {
      await supabase.functions.invoke("fos-generate-review", { body: { trigger: "manual" } });
      await load();
    } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  const k = review?.kpis ?? {};
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Helmet><title>Founder Operating Review | GetPawsy</title></Helmet>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Founder Operating Review</h1>
          <p className="text-muted-foreground text-sm">The only document you need to read this week.</p>
        </div>
        <Button onClick={regenerate} disabled={busy}>
          {busy ? "Generating…" : "Regenerate now"}
        </Button>
      </div>

      {loading && <div className="text-muted-foreground">Loading…</div>}
      {!loading && !review && (
        <Card><CardContent className="pt-6">
          <p>No review yet. Click <strong>Regenerate now</strong> to produce the first one.</p>
        </CardContent></Card>
      )}

      {review && (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Mission Status — week of {review.week_start}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Kpi label="Verified orders (7d)" value={k.verified_orders_7d ?? "—"} />
              <Kpi label="Verified revenue (7d)" value={`€${k.verified_revenue_7d ?? 0}`} />
              <Kpi label="Conversion rate" value={`${k.conversion_rate_7d ?? 0}%`} />
              <Kpi label="Revenue / visitor" value={`€${k.revenue_per_visitor_7d ?? 0}`} />
              <Kpi label="AOV" value={`€${k.aov_7d ?? 0}`} />
              <Kpi label="Sessions (7d)" value={k.sessions_7d ?? 0} />
              <Kpi label="Organic share" value={`${k.organic_session_share ?? 0}%`} />
              <Kpi label="Stripe abandon" value={k.stripe_abandon_rate_7d !== null && k.stripe_abandon_rate_7d !== undefined ? `${Math.round(k.stripe_abandon_rate_7d * 100)}%` : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>CEO Summary</CardTitle></CardHeader>
            <CardContent><p className="text-base leading-relaxed">{review.ceo_summary}</p></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>The Only Three Decisions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(review.top_3_actions ?? []).map((a: any) => (
                <div key={a.rank} className="border-l-4 border-primary pl-4">
                  <div className="font-semibold">ACTION #{a.rank} — {a.title}</div>
                  <div className="text-sm text-muted-foreground mt-1"><strong>Why:</strong> {a.why}</div>
                  <div className="text-sm mt-1"><strong>Expected lift:</strong> {a.expected_revenue_lift}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Confidence: {a.confidence} · Cost: {a.cost} · Validation: {a.validation}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Funnel (7d)</CardTitle></CardHeader>
            <CardContent>
              <div className="font-mono text-sm">
                view_item {k.funnel_7d?.view_item ?? 0} → add_to_cart {k.funnel_7d?.add_to_cart ?? 0} → begin_checkout {k.funnel_7d?.begin_checkout ?? 0} → payment {k.funnel_7d?.payment ?? 0} → purchase {k.funnel_7d?.purchase ?? 0}
              </div>
            </CardContent>
          </Card>

          {review.evidence?.forecast && (
            <Card>
              <CardHeader><CardTitle>Mission Zero Forecast</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-5 gap-3 text-xs">
                {(["to_10","to_25","to_100","to_500","to_1000"] as const).map(key => {
                  const f = review.evidence.forecast[key];
                  return (
                    <div key={key} className="border rounded p-2">
                      <div className="text-muted-foreground">{f.target} sales</div>
                      <div className="text-lg font-semibold">{f.weeks_to_target}w</div>
                      <div className="text-[10px] uppercase">{f.confidence}</div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {(review as any).biggest_wins?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Biggest Wins</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(review as any).biggest_wins.map((w: any, i: number) => (
                  <div key={i} className="border-l-4 border-green-500 pl-3">
                    <div className="font-medium">{w.title}</div>
                    <div className="text-muted-foreground">{w.reason}</div>
                    <div className="text-xs">Impact: {w.business_impact}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(review as any).biggest_losses?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Biggest Losses</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(review as any).biggest_losses.map((l: any, i: number) => (
                  <div key={i} className="border-l-4 border-red-500 pl-3">
                    <div className="font-medium">{l.title}</div>
                    <div className="text-xs text-muted-foreground">Root cause: {l.root_cause}</div>
                    <div className="text-xs">Difficulty: {l.difficulty} · Time to fix: {l.time_to_fix} · ROI: {l.roi}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {review.evidence?.competitor_intel?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Competitor Intelligence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {review.evidence.competitor_intel.map((c: any, i: number) => (
                  <div key={i}>• {c.observation} <span className="text-muted-foreground">— {c.reverse_engineered_why}</span></div>
                ))}
              </CardContent>
            </Card>
          )}

          {review.evidence?.organic_intelligence?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Organic Intelligence — Why products succeed</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {review.evidence.organic_intelligence.map((o: any, i: number) => (
                  <div key={i}><strong>{o.product_id}</strong> — {o.why} <span className="text-xs text-muted-foreground">(conf {o.confidence})</span></div>
                ))}
              </CardContent>
            </Card>
          )}

          {review.evidence?.top_10_opportunities?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Top 10 Revenue Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {review.evidence.top_10_opportunities.map((o: any, i: number) => (
                  <div key={i} className="border-b pb-2">
                    <div className="font-medium">{i+1}. {o.title}</div>
                    <div className="text-xs text-muted-foreground">
                      Expected: {String(o.expected_revenue)} · Conf: {o.confidence} · Risk: {o.risk} · ETA: {o.implementation_time}
                    </div>
                    <div className="text-xs">Why: {o.why}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {review.evidence?.execution_plan?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Execution Plan</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {review.evidence.execution_plan.map((p: any, i: number) => (
                  <div key={i} className="border-l-2 border-primary pl-3">
                    <div className="font-medium">{p.action}</div>
                    <div className="text-xs">Owner: {p.owner} · KPI: {p.expected_kpi} · Deadline: {p.deadline}</div>
                    <div className="text-xs text-muted-foreground">Validation: {p.validation_method} · Rollback: {p.rollback_strategy}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <details className="border rounded-md p-4">
            <summary className="cursor-pointer text-sm font-medium">Full markdown</summary>
            <pre className="text-xs whitespace-pre-wrap mt-3">{review.markdown}</pre>
          </details>

          <p className="text-xs text-muted-foreground">
            Generated {new Date(review.generated_at).toLocaleString()}. FOS reads only from existing tables — no duplicate metric logic.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{String(value)}</div>
    </div>
  );
}