import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

type FeedQuality = {
  window: number;
  feed_discovery_score: number;
  feed_fatigue_index: number;
  diversity_by_dimension: Record<string, number>;
  top_repetitive: Array<{ dimension: string; label: string; value: string; share: number }>;
  suggested_corrections: Array<{ dimension: string; action: string; share: number }>;
  real_performance: { sample_size: number; save_rate_avg: number; ctr_avg: number; outbound_rate_avg: number };
  probabilities: { follow_probability: number; feed_save_density: number; session_depth_est: number };
  verdict: "publish" | "regenerate" | "hold";
};

const VERDICT_TONE: Record<FeedQuality["verdict"], string> = {
  publish: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  regenerate: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  hold: "bg-destructive/15 text-destructive border-destructive/30",
};

export function FeedQualityCard() {
  const [data, setData] = useState<FeedQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowSize, setWindowSize] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const run = async (w = windowSize) => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("gv41-feed-quality", {
      body: { window: w, persist: true },
    });
    if (error) setError(error.message);
    else setData(data as FeedQuality);
    setLoading(false);
  };

  useEffect(() => { run(100); }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Feed Quality · Genesis V4.1
        </CardTitle>
        <div className="flex gap-1">
          {[50, 100, 200].map((n) => (
            <Button key={n} size="sm" variant={windowSize === n ? "default" : "outline"}
              onClick={() => { setWindowSize(n); run(n); }} disabled={loading}>
              {n}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => run(windowSize)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && <p className="text-sm text-muted-foreground">Analyzing latest {windowSize} pins…</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Discovery Score" value={`${data.feed_discovery_score}`} tone={data.feed_discovery_score >= 70 ? "good" : data.feed_discovery_score >= 55 ? "warn" : "bad"} />
              <Metric label="Fatigue Index" value={`${data.feed_fatigue_index}`} tone={data.feed_fatigue_index <= 35 ? "good" : data.feed_fatigue_index <= 60 ? "warn" : "bad"} />
              <Metric label="Follow Prob" value={`${(data.probabilities.follow_probability * 100).toFixed(2)}%`} />
              <Metric label="Session Depth" value={`${data.probabilities.session_depth_est.toFixed(1)} pins`} />
            </div>

            <div className="flex items-center gap-2">
              <Badge className={`border ${VERDICT_TONE[data.verdict]}`}>verdict: {data.verdict}</Badge>
              <span className="text-xs text-muted-foreground">
                window {data.window} pins · perf sample {data.real_performance.sample_size} ·
                save {(data.real_performance.save_rate_avg * 100).toFixed(2)}% ·
                outbound {(data.real_performance.outbound_rate_avg * 100).toFixed(2)}%
              </span>
            </div>

            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">Diversity by dimension</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(data.diversity_by_dimension).map(([dim, v]) => (
                  <div key={dim} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="capitalize">{dim.replace(/_/g, " ")}</span>
                      <span className="tabular-nums">{v.toFixed(0)}</span>
                    </div>
                    <Progress value={v} className="h-1.5" />
                  </div>
                ))}
              </div>
            </div>

            {data.top_repetitive.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Top repetitive dimensions</p>
                <ul className="space-y-1 text-xs">
                  {data.top_repetitive.slice(0, 6).map((r, i) => (
                    <li key={i} className="flex justify-between gap-2 border-l-2 border-amber-500/40 pl-2">
                      <span><b>{r.label}</b> · "{r.value || "—"}"</span>
                      <span className="tabular-nums text-muted-foreground">{(r.share * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.suggested_corrections.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Suggested corrections</p>
                <ul className="space-y-1 text-xs">
                  {data.suggested_corrections.map((s, i) => (
                    <li key={i} className="border-l-2 border-primary/60 pl-2">{s.action}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "bad" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}