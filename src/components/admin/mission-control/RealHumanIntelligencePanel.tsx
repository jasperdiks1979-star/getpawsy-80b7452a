import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, ShieldCheck, Bot, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  REAL_HUMAN_COUNTERS_VIEW,
} from "@/lib/realHumanSession";

/**
 * Real Human Intelligence Panel — Constitution surface for Mission Control
 * and the Executive War Room. Reads only from the canonical `real_human_*`
 * views (single source of truth); adds NO new tables and duplicates NO logic.
 */

type Counters = {
  total_sessions_7d: number;
  real_human_sessions_7d: number;
  excluded_sessions_7d: number;
  real_human_us_sessions_7d: number;
};
type Funnel = {
  real_human_sessions: number;
  real_pdp_views: number;
  real_add_to_carts: number;
  real_checkouts: number;
  real_purchases: number;
  real_conversion_rate_pct: number | null;
};
type Channel = {
  channel: string;
  human_sessions: number;
  bot_sessions: number;
  human_pct: number | null;
  real_atc: number | null;
  real_purchases: number | null;
  real_revenue_cents: number | null;
  real_purchase_rate_pct: number | null;
};
type Confidence = {
  total_sessions: number;
  classified_human: number;
  classified_excluded: number;
  unknown_sessions: number;
  suspected_false_negatives: number;
  possible_false_positives: number;
  classifier_confidence_pct: number | null;
};

const num = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(n);

const usd = (cents: number | null | undefined) =>
  cents == null
    ? "$0"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function RealHumanIntelligencePanel() {
  const [counters, setCounters] = useState<Counters | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [c, f, ch, cf] = await Promise.all([
        supabase.from(REAL_HUMAN_COUNTERS_VIEW as any).select("*").maybeSingle(),
        supabase.from("real_human_funnel_7d" as any).select("*").maybeSingle(),
        supabase.from("real_human_channel_quality_7d" as any).select("*").limit(6),
        supabase.from("real_human_classifier_confidence_7d" as any).select("*").maybeSingle(),
      ]);
      if (!alive) return;
      setCounters((c.data as any) ?? null);
      setFunnel((f.data as any) ?? null);
      setChannels(((ch.data as any) ?? []) as Channel[]);
      setConfidence((cf.data as any) ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const humanPct =
    counters && counters.total_sessions_7d > 0
      ? (counters.real_human_sessions_7d / counters.total_sessions_7d) * 100
      : null;
  const botPct = humanPct == null ? null : 100 - humanPct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Real Human Intelligence — 7d (Constitution)
          </CardTitle>
          <div className="flex items-center gap-2">
            {confidence?.classifier_confidence_pct != null && (
              <Badge
                className={
                  (confidence.classifier_confidence_pct ?? 0) >= 95
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-500 text-white"
                }
              >
                Classifier {Math.round(confidence.classifier_confidence_pct)}%
              </Badge>
            )}
            <Badge variant="outline">Source of truth</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {/* Top row: humans / bots / US humans / funnel end */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat
                icon={<Users className="h-4 w-4" />}
                label="Real humans"
                value={num(counters?.real_human_sessions_7d)}
                sub={humanPct != null ? `${humanPct.toFixed(1)}% of ${num(counters?.total_sessions_7d)}` : undefined}
                tone="good"
              />
              <Stat
                icon={<Bot className="h-4 w-4" />}
                label="Excluded (bots/tests)"
                value={num(counters?.excluded_sessions_7d)}
                sub={botPct != null ? `${botPct.toFixed(1)}%` : undefined}
                tone="warn"
              />
              <Stat
                icon={<Users className="h-4 w-4" />}
                label="Real US humans"
                value={num(counters?.real_human_us_sessions_7d)}
              />
              <Stat
                icon={<Activity className="h-4 w-4" />}
                label="Real PDP views"
                value={num(funnel?.real_pdp_views)}
              />
              <Stat
                icon={<Activity className="h-4 w-4" />}
                label="Real purchases"
                value={num(funnel?.real_purchases)}
                sub={funnel?.real_conversion_rate_pct != null ? `${funnel.real_conversion_rate_pct}% CR` : undefined}
                tone={funnel && (funnel.real_purchases ?? 0) > 0 ? "good" : "warn"}
              />
            </div>

            {/* Funnel bar */}
            <div className="text-xs text-muted-foreground">Verified funnel (real humans only)</div>
            <div className="grid grid-cols-5 gap-1">
              {[
                { l: "Sessions", v: funnel?.real_human_sessions },
                { l: "PDP", v: funnel?.real_pdp_views },
                { l: "ATC", v: funnel?.real_add_to_carts },
                { l: "Checkout", v: funnel?.real_checkouts },
                { l: "Purchase", v: funnel?.real_purchases },
              ].map((s) => (
                <div key={s.l} className="rounded border bg-muted/30 p-2 text-center">
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                  <div className="text-lg font-semibold">{num(s.v as any)}</div>
                </div>
              ))}
            </div>

            {/* Channel quality table */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Traffic quality (real revenue &gt; vanity)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Channel</th>
                      <th className="text-right">Humans</th>
                      <th className="text-right">Bots</th>
                      <th className="text-right">Human %</th>
                      <th className="text-right">Real ATC</th>
                      <th className="text-right">Real Buys</th>
                      <th className="text-right">Real Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map((c) => (
                      <tr key={c.channel} className="border-t">
                        <td className="py-1 font-medium">{c.channel}</td>
                        <td className="text-right">{num(c.human_sessions)}</td>
                        <td className="text-right text-muted-foreground">{num(c.bot_sessions)}</td>
                        <td className="text-right">{c.human_pct != null ? `${c.human_pct}%` : "—"}</td>
                        <td className="text-right">{num(c.real_atc)}</td>
                        <td className="text-right">{num(c.real_purchases)}</td>
                        <td className="text-right font-semibold">{usd(c.real_revenue_cents)}</td>
                      </tr>
                    ))}
                    {channels.length === 0 && (
                      <tr><td colSpan={7} className="py-2 text-center text-muted-foreground">No channel data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Self-validation footer */}
            {confidence && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground border-t pt-2">
                <span>Classifier self-validation:</span>
                <span>humans <b className="text-foreground">{num(confidence.classified_human)}</b></span>
                <span>excluded <b className="text-foreground">{num(confidence.classified_excluded)}</b></span>
                <span>suspected FN <b className={confidence.suspected_false_negatives > 5 ? "text-amber-600" : "text-foreground"}>{num(confidence.suspected_false_negatives)}</b></span>
                <span>possible FP <b className={confidence.possible_false_positives > 5 ? "text-amber-600" : "text-foreground"}>{num(confidence.possible_false_positives)}</b></span>
                <span>unknown <b className="text-foreground">{num(confidence.unknown_sessions)}</b></span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  const toneCls =
    tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}