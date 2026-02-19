import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Target, TrendingUp, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompetitorGap {
  id: string;
  keyword: string;
  competitor_url: string | null;
  competitor_position: number | null;
  our_position: number | null;
  content_gap_score: number | null;
  estimated_gain_if_matched: number | null;
  created_at: string;
}

export function CompetitorGapWidget() {
  const { data: gaps, isLoading } = useQuery({
    queryKey: ['competitor-gaps-widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_gaps')
        .select('*')
        .order('estimated_gain_if_matched', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as CompetitorGap[];
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

  const totalGain = gaps?.reduce((sum, g) => sum + (g.estimated_gain_if_matched || 0), 0) || 0;

  return (
    <Card className="border-destructive/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-destructive" />
          Competitive Weak Spots
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!gaps?.length ? (
          <p className="text-xs text-muted-foreground text-center py-4">No gap data yet. Run pipeline to populate.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs gap-1">
                <TrendingUp className="h-3 w-3" />
                Est. gain: +{Math.round(totalGain)} clicks/mo
              </Badge>
            </div>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {gaps.map(gap => (
                  <div key={gap.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-muted/50 border border-transparent hover:border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{gap.keyword}</p>
                      <p className="text-muted-foreground">
                        Us: pos {gap.our_position?.toFixed(0) || '?'} → Them: pos {gap.competitor_position?.toFixed(0) || '?'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={cn(
                        'font-mono text-[11px]',
                        (gap.content_gap_score || 0) > 50 ? 'text-destructive' : 'text-yellow-500'
                      )}>
                        Gap: {gap.content_gap_score?.toFixed(0) || 0}
                      </span>
                      {(gap.estimated_gain_if_matched || 0) > 0 && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <ArrowUpRight className="h-2.5 w-2.5" />
                          +{Math.round(gap.estimated_gain_if_matched || 0)}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
