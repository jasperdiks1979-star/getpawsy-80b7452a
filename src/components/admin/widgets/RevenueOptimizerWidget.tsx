import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, Shield } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function RevenueOptimizerWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['seo-revenue-matrix'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seo_revenue_matrix')
        .select('*')
        .order('revenue_potential_90d', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Card className="p-6"><Skeleton className="h-48 w-full" /></Card>;

  const totalRev = data?.reduce((s, d) => s + Number(d.revenue_potential_90d || 0), 0) || 0;
  const pushCount = data?.filter(d => d.action_taken === 'ranking_push').length || 0;
  const defenseCount = data?.filter(d => d.defense_mode).length || 0;

  const actionColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    ranking_push: 'default',
    content_overshoot: 'destructive',
    defense_lock: 'secondary',
    monitor: 'outline',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          SEO Revenue Acceleration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-3">
          <div>
            <div className="text-2xl font-bold">${Math.round(totalRev).toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">90d revenue potential</div>
          </div>
          <div className="flex gap-2">
            <div className="text-center">
              <div className="text-sm font-semibold">{pushCount}</div>
              <div className="text-[10px] text-muted-foreground">Push</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold flex items-center gap-0.5"><Shield className="h-3 w-3" />{defenseCount}</div>
              <div className="text-[10px] text-muted-foreground">Defense</div>
            </div>
          </div>
        </div>
        {!data?.length ? (
          <p className="text-xs text-muted-foreground">No data yet. Run the pipeline.</p>
        ) : (
          <ScrollArea className="h-36">
            <div className="space-y-1.5">
              {data.slice(0, 10).map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate max-w-[140px]" title={d.keyword}>{d.keyword}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={actionColors[d.action_taken || 'monitor']} className="text-[10px]">
                      {d.action_taken}
                    </Badge>
                    <span className="font-medium">${Math.round(Number(d.revenue_potential_90d))}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
