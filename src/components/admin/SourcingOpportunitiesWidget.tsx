import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, TrendingUp, Check, X, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SourcingOpportunity {
  id: string;
  competitor_product_id: string;
  product_name: string;
  competitor: string;
  current_rank: number;
  price: number | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
}

export function SourcingOpportunitiesWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['sourcing-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sourcing_opportunities')
        .select('*')
        .in('status', ['new', 'reviewed'])
        .order('current_rank', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as SourcingOpportunity[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('sourcing_opportunities')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sourcing-opportunities'] });
      toast({ title: 'Status bijgewerkt' });
    },
    onError: () => {
      toast({ title: 'Fout bij bijwerken', variant: 'destructive' });
    },
  });

  const getCompetitorColor = (competitor: string) => {
    switch (competitor.toLowerCase()) {
      case 'amazon':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'chewy':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'petco':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Sourcing Kansen
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          Sourcing Kansen
          {opportunities && opportunities.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {opportunities.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!opportunities || opportunities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Geen nieuwe sourcing kansen gevonden.
          </p>
        ) : (
          <div className="space-y-3">
            {opportunities.map((opportunity) => (
              <div
                key={opportunity.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="font-medium text-sm truncate">
                      #{opportunity.current_rank}
                    </span>
                    <Badge className={getCompetitorColor(opportunity.competitor)}>
                      {opportunity.competitor}
                    </Badge>
                    {opportunity.status === 'new' && (
                      <Badge variant="default" className="bg-yellow-500">
                        Nieuw
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {opportunity.product_name}
                  </p>
                  {opportunity.price && (
                    <p className="text-xs text-muted-foreground mt-1">
                      ${opportunity.price.toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                    onClick={() => updateStatus.mutate({ id: opportunity.id, status: 'sourced' })}
                    title="Markeer als gesourced"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                    onClick={() => updateStatus.mutate({ id: opportunity.id, status: 'dismissed' })}
                    title="Negeren"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
