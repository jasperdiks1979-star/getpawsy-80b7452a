import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";

type Row = {
  session_id: string;
  entry_page: string | null;
  utm_source: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  first_seen_at: string;
  time_on_site_seconds: number | null;
  max_scroll_depth: number | null;
  rage_clicks: number;
  dead_clicks: number;
  cart_opened: boolean;
  checkout_started: boolean;
  purchased: boolean;
  exit_reason: string;
};
type Step = { session_id: string; step: string; ts: string };

const EXIT_COLORS: Record<string, string> = {
  purchased: "bg-emerald-600 text-white",
  payment_fail: "bg-red-600 text-white",
  checkout_abandon: "bg-orange-500 text-white",
  cart_abandon: "bg-amber-500 text-white",
  short_visit: "bg-slate-500 text-white",
  bounce: "bg-slate-400 text-white",
};

export function SessionJourneysPanel() {
  const [humansOnly, setHumansOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const view = humansOnly ? "session_forensics_human" : "session_forensics";
  const sessions = useQuery({
    queryKey: ["session-forensics", view],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from(view)
        .select("session_id,entry_page,utm_source,device,browser,country,first_seen_at,time_on_site_seconds,max_scroll_depth,rage_clicks,dead_clicks,cart_opened,checkout_started,purchased,exit_reason")
        .gte("first_seen_at", since)
        .order("first_seen_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const journey = useQuery({
    queryKey: ["session-journey", expanded],
    enabled: !!expanded,
    queryFn: async (): Promise<Step[]> => {
      const { data, error } = await (supabase as any)
        .from("session_journey_steps")
        .select("session_id,step,ts")
        .eq("session_id", expanded)
        .order("ts", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Step[];
    },
  });

  const rows = sessions.data ?? [];
  const totals = rows.reduce(
    (a, r) => {
      a[r.exit_reason] = (a[r.exit_reason] ?? 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Session Journeys · Last 24h ({rows.length})</CardTitle>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={humansOnly ? "default" : "outline"}
            onClick={() => setHumansOnly(true)}
          >
            Humans only
          </Button>
          <Button
            size="sm"
            variant={!humansOnly ? "default" : "outline"}
            onClick={() => setHumansOnly(false)}
          >
            All (incl. bots)
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(totals).map(([k, v]) => (
            <Badge key={k} className={EXIT_COLORS[k] ?? ""}>
              {k}: {v}
            </Badge>
          ))}
        </div>

        {sessions.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
          </div>
        )}
        {sessions.error && (
          <div className="text-sm text-destructive">
            {(sessions.error as Error).message}
          </div>
        )}

        <div className="divide-y rounded border">
          {rows.map((r) => {
            const isOpen = expanded === r.session_id;
            return (
              <div key={r.session_id} className="p-3 text-sm">
                <button
                  className="w-full text-left flex items-start gap-2"
                  onClick={() => setExpanded(isOpen ? null : r.session_id)}
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={EXIT_COLORS[r.exit_reason] ?? ""}>
                        {r.exit_reason}
                      </Badge>
                      <span className="font-mono text-xs truncate">
                        {r.entry_page ?? "—"}
                      </span>
                      {r.utm_source && (
                        <Badge variant="outline">src: {r.utm_source}</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      <span>{r.country ?? "??"}</span>
                      <span>{r.device ?? "?"}</span>
                      <span>{r.browser ?? "?"}</span>
                      <span>{r.time_on_site_seconds ?? 0}s</span>
                      <span>scroll {r.max_scroll_depth ?? 0}%</span>
                      {r.rage_clicks > 0 && (
                        <span className="text-red-600">rage×{r.rage_clicks}</span>
                      )}
                      {r.dead_clicks > 0 && (
                        <span className="text-amber-600">dead×{r.dead_clicks}</span>
                      )}
                      {r.cart_opened && <span className="text-emerald-600">cart</span>}
                      {r.checkout_started && (
                        <span className="text-emerald-700">checkout</span>
                      )}
                      {r.purchased && (
                        <span className="text-emerald-800 font-semibold">
                          PURCHASED
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 ml-6 border-l pl-4 space-y-1">
                    {journey.isLoading && (
                      <div className="text-xs text-muted-foreground">Loading…</div>
                    )}
                    {(journey.data ?? []).map((s, i) => (
                      <div
                        key={`${s.step}-${s.ts}-${i}`}
                        className="text-xs font-mono flex gap-3"
                      >
                        <span className="text-muted-foreground">
                          {new Date(s.ts).toLocaleTimeString()}
                        </span>
                        <span>{s.step}</span>
                      </div>
                    ))}
                    {journey.data && journey.data.length === 0 && (
                      <div className="text-xs text-muted-foreground">
                        No journey steps recorded for this session.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!sessions.isLoading && rows.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No sessions in the last 24h for this filter.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}