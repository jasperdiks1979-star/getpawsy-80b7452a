import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Search } from 'lucide-react';

interface KeywordRanking {
  keyword: string;
  position: number | null;
  clicks: number;
  impressions: number;
}

interface KeywordRankingWidgetProps {
  onNavigate?: () => void;
}

export const KeywordRankingWidget = ({ onNavigate }: KeywordRankingWidgetProps) => {
  const { data: topKeywords, isLoading } = useQuery({
    queryKey: ['top-keywords-widget'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-keyword-rankings', {
        body: { action: 'get_top_keywords' },
      });
      if (error) throw error;
      return (data.keywords as KeywordRanking[])?.slice(0, 5) || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const getPositionColor = (position: number | null) => {
    if (!position) return 'bg-muted';
    if (position <= 3) return 'bg-yellow-500 text-yellow-50';
    if (position <= 10) return 'bg-green-500 text-green-50';
    if (position <= 20) return 'bg-blue-500 text-blue-50';
    return 'bg-muted';
  };

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow" 
      onClick={onNavigate}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Top Keywords (USA)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : topKeywords && topKeywords.length > 0 ? (
          <div className="space-y-2">
            {topKeywords.map((kw, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-[150px]" title={kw.keyword}>
                  {kw.keyword}
                </span>
                <Badge className={getPositionColor(kw.position)}>
                  #{kw.position?.toFixed(0) || '-'}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No data yet</p>
          </div>
        )}
        {topKeywords && topKeywords.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Click to view all rankings
          </p>
        )}
      </CardContent>
    </Card>
  );
};
