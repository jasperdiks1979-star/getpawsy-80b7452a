import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ImpactPayload {
  window_days: number;
  total_tiktok_sessions: number;
  old_rule: { definition: string; flagged_sessions: number; flagged_share_pct: number };
  new_rule: { definition: string; flagged_sessions: number; flagged_share_pct: number };
  delta: {
    freed_sessions: number;
    newly_flagged: number;
    still_flagged: number;
    net_change: number;
    old_false_positives_with_ui_event: number;
  };
}

export function TikTokBotDetectionImpactCard({ windowDays }: { windowDays: number }) {
  const [data, setData] = useState<ImpactPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: res, error: err } = await supabase.rpc(
        "get_tiktok_bot_detection_impact" as never,
        { p_window_days: windowDays } as never
      );
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setData(null);
      } else {
        setData(res as unknown as ImpactPayload);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          Bot detection impact
          <Badge variant="outline" className="text-[10px]">last {windowDays}d</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Computing…
          </div>
        )}
        {error && <div className="text-destructive text-xs">{error}</div>}
        {data && !loading && (
          <>
            <div className="text-xs text-muted-foreground">
              Total TikTok sessions: <span className="font-mono">{data.total_tiktok_sessions}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded border bg-muted/30 p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Old rule</div>
                <div className="text-[11px] text-muted-foreground">{data.old_rule.definition}</div>
                <div className="text-lg font-semibold">
                  {data.old_rule.flagged_sessions}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({data.old_rule.flagged_share_pct}%)
                  </span>
                </div>
              </div>
              <div className="rounded border border-primary/30 bg-primary/5 p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-primary">New rule</div>
                <div className="text-[11px] text-muted-foreground">{data.new_rule.definition}</div>
                <div className="text-lg font-semibold">
                  {data.new_rule.flagged_sessions}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({data.new_rule.flagged_share_pct}%)
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Metric label="Freed (false positives)" value={data.delta.freed_sessions} tone="positive" />
              <Metric label="Newly flagged" value={data.delta.newly_flagged} tone="warning" />
              <Metric label="Still flagged" value={data.delta.still_flagged} />
              <Metric
                label="Net change"
                value={(data.delta.net_change > 0 ? "+" : "") + data.delta.net_change}
                tone={data.delta.net_change <= 0 ? "positive" : "warning"}
              />
            </div>

            <div className="text-[11px] text-muted-foreground">
              {data.delta.old_false_positives_with_ui_event} session(s) flagged by the old rule
              had real cart/checkout activity — these are now correctly kept.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}