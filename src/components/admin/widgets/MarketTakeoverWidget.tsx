import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target } from 'lucide-react';

export function MarketTakeoverWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['market-share-simulations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_share_simulations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Card className="p-6"><Skeleton className="h-48 w-full" /></Card>;

  const scenarioColors: Record<string, 'default' | 'secondary' | 'destructive'> = {
    conservative: 'secondary',
    aggressive: 'default',
    dominance: 'destructive',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Market Takeover Simulation
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-xs text-muted-foreground">No simulations yet. Run the pipeline.</p>
        ) : (
          <div className="space-y-3">
            {data.map(sim => (
              <div key={sim.id} className="border rounded p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Badge variant={scenarioColors[sim.scenario] || 'outline'} className="text-[10px] capitalize">
                    {sim.scenario}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Confidence: {sim.confidence_score}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-bold">{Math.round(Number(sim.projected_traffic_90d)).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Traffic 90d</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">${Math.round(Number(sim.projected_revenue_90d)).toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Revenue 90d</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold">+{sim.projected_market_share_gain}%</div>
                    <div className="text-[10px] text-muted-foreground">Share gain</div>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Top 3: {Number(sim.top3_share_pct).toFixed(1)}%</span>
                  <span>Top 10: {Number(sim.top10_share_pct).toFixed(1)}%</span>
                  <span>Pressure: {sim.competitive_pressure}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
