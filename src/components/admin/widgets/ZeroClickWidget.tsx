import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Eye, CheckCircle, XCircle } from 'lucide-react';

interface ZeroClickPage {
  id: string;
  page_url: string;
  zero_click_ready: boolean;
  visibility_score: number | null;
  has_direct_answer: boolean;
  has_definition_schema: boolean;
  has_comparison_table: boolean;
  has_quick_answer: boolean;
}

export function ZeroClickWidget() {
  const { data: pages, isLoading } = useQuery({
    queryKey: ['zero-click-widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zero_click_pages')
        .select('*')
        .order('visibility_score', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ZeroClickPage[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-24 w-full" /></CardContent>
      </Card>
    );
  }

  const total = pages?.length || 0;
  const ready = pages?.filter(p => p.zero_click_ready).length || 0;
  const readyPct = total > 0 ? Math.round((ready / total) * 100) : 0;
  const avgScore = total > 0 ? Math.round((pages?.reduce((s, p) => s + (p.visibility_score || 0), 0) || 0) / total) : 0;

  const featureCounts = {
    directAnswer: pages?.filter(p => p.has_direct_answer).length || 0,
    definition: pages?.filter(p => p.has_definition_schema).length || 0,
    comparison: pages?.filter(p => p.has_comparison_table).length || 0,
    quickAnswer: pages?.filter(p => p.has_quick_answer).length || 0,
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          Zero-Click Visibility Index
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!total ? (
          <p className="text-xs text-muted-foreground text-center py-4">No zero-click data yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                {ready}/{total} ready
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Avg score: {avgScore}
              </Badge>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                <span>Readiness</span>
                <span>{readyPct}%</span>
              </div>
              <Progress value={readyPct} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-1">
                {featureCounts.directAnswer > 0 ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground/40" />}
                <span>Direct Answers: {featureCounts.directAnswer}</span>
              </div>
              <div className="flex items-center gap-1">
                {featureCounts.definition > 0 ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground/40" />}
                <span>Definitions: {featureCounts.definition}</span>
              </div>
              <div className="flex items-center gap-1">
                {featureCounts.comparison > 0 ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground/40" />}
                <span>Comparisons: {featureCounts.comparison}</span>
              </div>
              <div className="flex items-center gap-1">
                {featureCounts.quickAnswer > 0 ? <CheckCircle className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground/40" />}
                <span>Quick Answers: {featureCounts.quickAnswer}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
