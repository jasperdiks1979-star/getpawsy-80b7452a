import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StrategyEntry {
  id: string;
  ranking_velocity: number | null;
  ctr_growth: number | null;
  gap_closure_rate: number | null;
  serp_capture_pct: number | null;
  strategy_action: string | null;
  reasoning: string | null;
  created_at: string;
}

function TrendIcon({ value }: { value: number | null }) {
  if (!value || value === 0) return <Minus className="h-3 w-3 text-muted-foreground" />;
  return value > 0 ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-destructive" />;
}

export function StrategyAdaptationWidget() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['strategy-state-widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategy_state_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as StrategyEntry[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  const latest = entries?.[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          AI Strategy Adaptation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!entries?.length ? (
          <p className="text-xs text-muted-foreground text-center py-4">No strategy data yet.</p>
        ) : (
          <div className="space-y-3">
            {latest && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1">
                  <TrendIcon value={latest.ranking_velocity} />
                  <span>Rank velocity: {latest.ranking_velocity?.toFixed(1) || '–'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendIcon value={latest.ctr_growth} />
                  <span>CTR growth: {latest.ctr_growth?.toFixed(1) || '–'}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendIcon value={latest.gap_closure_rate} />
                  <span>Gap closure: {latest.gap_closure_rate?.toFixed(1) || '–'}%</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>SERP capture: {latest.serp_capture_pct?.toFixed(0) || '–'}%</span>
                </div>
              </div>
            )}
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {entries.map(entry => (
                  <div key={entry.id} className="text-[11px] py-1.5 px-2 rounded border border-transparent hover:border-border hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">{entry.strategy_action || 'evaluate'}</Badge>
                      <span className="text-muted-foreground/60">{new Date(entry.created_at).toLocaleDateString()}</span>
                    </div>
                    {entry.reasoning && (
                      <p className="text-muted-foreground mt-1 line-clamp-2">{entry.reasoning}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
