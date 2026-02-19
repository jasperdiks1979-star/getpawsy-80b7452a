import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Magnet } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function BacklinkHeatmapWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['backlink-outreach-scores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('backlink_outreach_scores')
        .select('*')
        .order('outreach_priority_score', { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Card className="p-6"><Skeleton className="h-48 w-full" /></Card>;

  const tierCounts = { A: 0, B: 0, C: 0 };
  data?.forEach(d => { tierCounts[d.tier as keyof typeof tierCounts]++; });

  const tierColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    A: 'default', B: 'secondary', C: 'outline',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Magnet className="h-4 w-4 text-primary" />
          Backlink Opportunity Heatmap
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-3">
          {Object.entries(tierCounts).map(([tier, count]) => (
            <div key={tier} className="text-center">
              <Badge variant={tierColors[tier]} className="text-[10px]">Tier {tier}</Badge>
              <div className="text-lg font-bold mt-1">{count}</div>
            </div>
          ))}
        </div>
        {!data?.length ? (
          <p className="text-xs text-muted-foreground">No data yet. Run the pipeline.</p>
        ) : (
          <ScrollArea className="h-32">
            <div className="space-y-1.5">
              {data.slice(0, 8).map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate max-w-[140px]">{d.suggested_pitch_topic}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={tierColors[d.tier]} className="text-[10px]">{d.tier}</Badge>
                    <span className="text-muted-foreground">{d.outreach_priority_score}</span>
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
