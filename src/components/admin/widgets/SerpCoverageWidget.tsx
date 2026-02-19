import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Sparkles, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface SerpFeature {
  id: string;
  feature_type: string;
  status: string;
}

const FEATURE_LABELS: Record<string, string> = {
  faq: 'FAQ Rich Results',
  paa: 'People Also Ask',
  featured_snippet: 'Featured Snippets',
  review_stars: 'Review Stars',
  product_rich: 'Product Rich',
  sitelinks: 'Sitelinks',
};

export function SerpCoverageWidget() {
  const { data: features, isLoading } = useQuery({
    queryKey: ['serp-features-widget'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('serp_features')
        .select('id, feature_type, status')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as SerpFeature[];
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

  const total = features?.length || 0;
  const captured = features?.filter(f => f.status === 'captured').length || 0;
  const eligible = features?.filter(f => f.status === 'eligible').length || 0;
  const missing = features?.filter(f => f.status === 'missing').length || 0;
  const capturedPct = total > 0 ? Math.round((captured / total) * 100) : 0;

  // Group by feature type
  const byType = features?.reduce((acc, f) => {
    acc[f.feature_type] = acc[f.feature_type] || { captured: 0, eligible: 0, missing: 0, total: 0 };
    acc[f.feature_type][f.status as 'captured' | 'eligible' | 'missing']++;
    acc[f.feature_type].total++;
    return acc;
  }, {} as Record<string, { captured: number; eligible: number; missing: number; total: number }>);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          SERP Feature Coverage
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!total ? (
          <p className="text-xs text-muted-foreground text-center py-4">No SERP data yet. Run pipeline to analyze.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <Badge variant="outline" className="gap-1"><CheckCircle className="h-3 w-3 text-green-500" />{captured} captured</Badge>
              <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3 text-yellow-500" />{eligible} eligible</Badge>
              <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3 text-destructive" />{missing} missing</Badge>
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                <span>Capture Rate</span>
                <span>{capturedPct}%</span>
              </div>
              <Progress value={capturedPct} className="h-2" />
            </div>
            <div className="space-y-1.5">
              {Object.entries(byType || {}).map(([type, counts]) => (
                <div key={type} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{FEATURE_LABELS[type] || type}</span>
                  <span className="font-mono">
                    <span className="text-green-500">{counts.captured}</span>
                    <span className="text-muted-foreground/50"> / {counts.total}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
