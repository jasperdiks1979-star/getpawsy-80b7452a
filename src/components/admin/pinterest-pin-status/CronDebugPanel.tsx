import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type DebugRow = {
  id: string;
  product_slug: string | null;
  category_key: string | null;
  board_id: string | null;
  pin_title: string | null;
  scheduled_at: string | null;
  us_audience_score: number;
  eligible: boolean;
  exclusion_reasons: string[];
};

type DebugResp = {
  ok: boolean;
  now: string;
  runtime: Record<string, unknown>;
  status_counts: Record<string, number>;
  base_query: { sql: string; candidate_count: number; error: string | null };
  selected_pin_id: string | null;
  next_candidate: DebugRow | null;
  candidates: DebugRow[];
};

export default function CronDebugPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["pinterest-cron-debug"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<DebugResp>(
        "pinterest-cron-debug",
        { body: {} },
      );
      if (error) throw error;
      return data!;
    },
    refetchInterval: 30_000,
  });

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Cron Debug — selector replay</CardTitle>
        <button
          onClick={() => refetch()}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          {isFetching ? "refreshing…" : "refresh"}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Replaying selector…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Selected pin</div>
                <div className="font-mono break-all">
                  {data.selected_pin_id ?? "—"}
                </div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Candidates returned</div>
                <div>{data.base_query.candidate_count}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">auto_approve_queue</div>
                <div>{String((data.runtime as any).auto_approve_queue)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">US score threshold</div>
                <div>{String((data.runtime as any).us_score_threshold)}</div>
              </div>
            </div>
            <div className="text-xs rounded bg-muted/40 p-2 font-mono">
              {data.base_query.sql}
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Status counts: </span>
              {Object.entries(data.status_counts).map(([k, v]) => (
                <Badge key={k} variant="outline" className="mr-1">
                  {k}: {v}
                </Badge>
              ))}
            </div>
            <div className="overflow-auto max-h-96 border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Pin</th>
                    <th className="p-2">Slug / Category</th>
                    <th className="p-2">Score</th>
                    <th className="p-2">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2 font-mono">{r.id.slice(0, 8)}</td>
                      <td className="p-2">
                        <div className="font-medium">{r.product_slug || "—"}</div>
                        <div className="text-muted-foreground">{r.category_key || "—"}</div>
                      </td>
                      <td className="p-2">{r.us_audience_score.toFixed(2)}</td>
                      <td className="p-2">
                        {r.eligible ? (
                          <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> eligible
                          </Badge>
                        ) : (
                          <div className="space-y-0.5">
                            <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">
                              <AlertTriangle className="h-3 w-3 mr-1" /> excluded
                            </Badge>
                            <div className="text-amber-700">
                              {r.exclusion_reasons.join(", ")}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}