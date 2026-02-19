import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export function CompetitorIntelWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['competitor-content-intel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_content_intelligence')
        .select('*')
        .order('structural_advantage_score', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Card className="p-6"><Skeleton className="h-48 w-full" /></Card>;

  const avgScore = data?.length
    ? Math.round(data.reduce((s, d) => s + Number(d.structural_advantage_score || 0), 0) / data.length)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Competitor Structural Edge
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-3">
          <div className="text-2xl font-bold">{avgScore}</div>
          <div className="text-xs text-muted-foreground">Avg structural advantage score</div>
        </div>
        {!data?.length ? (
          <p className="text-xs text-muted-foreground">No data yet. Run the pipeline to analyze.</p>
        ) : (
          <ScrollArea className="h-36">
            <div className="space-y-1.5">
              {data.map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate max-w-[180px]" title={d.keyword}>{d.keyword}</span>
                  <div className="flex items-center gap-2">
                    {Number(d.structural_advantage_score) > 60 && (
                      <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    )}
                    <Badge variant={Number(d.structural_advantage_score) > 60 ? 'destructive' : 'secondary'} className="text-[10px]">
                      {d.structural_advantage_score}
                    </Badge>
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
