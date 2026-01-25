import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface StaleClaim {
  id: string;
  customer_email: string;
  dispute_type: string;
  status: string;
  updated_at: string;
  created_at: string;
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  not_received: 'Niet ontvangen',
  damaged: 'Beschadigd',
  wrong_item: 'Verkeerd artikel',
  quality_issue: 'Kwaliteitsprobleem',
  other: 'Overig',
};

const StaleClaimsWidget = memo(function StaleClaimsWidget({ 
  onViewDisputes 
}: { 
  onViewDisputes?: () => void 
}) {
  const { data: staleClaims, isLoading } = useQuery({
    queryKey: ['stale-claims-widget'],
    queryFn: async () => {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('disputes')
        .select('id, customer_email, dispute_type, status, updated_at, created_at')
        .in('status', ['pending', 'under_review'])
        .lt('updated_at', fortyEightHoursAgo)
        .order('updated_at', { ascending: true })
        .limit(5);

      if (error) throw error;
      return data as StaleClaim[];
    },
    refetchInterval: 60000, // Refetch every minute
  });

  const { data: totalCount } = useQuery({
    queryKey: ['stale-claims-count'],
    queryFn: async () => {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { count, error } = await supabase
        .from('disputes')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'under_review'])
        .lt('updated_at', fortyEightHoursAgo);

      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Wachtende Claims
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const count = totalCount ?? 0;

  return (
    <Card className={count > 0 ? 'border-destructive/50' : ''}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${count > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            Wachtende Claims
          </CardTitle>
          <Badge 
            variant={count > 0 ? 'destructive' : 'secondary'}
            className="text-sm"
          >
            {count} {count === 1 ? 'claim' : 'claims'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Claims zonder update in 48+ uur
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <div className="text-center py-4">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Alle claims zijn up-to-date!
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {staleClaims?.map((claim) => (
                <div 
                  key={claim.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {claim.customer_email}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{DISPUTE_TYPE_LABELS[claim.dispute_type] || claim.dispute_type}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(claim.updated_at), { 
                          addSuffix: true,
                          locale: nl 
                        })}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0 ml-2">
                    {claim.status === 'pending' ? 'In afwachting' : 'In behandeling'}
                  </Badge>
                </div>
              ))}
            </div>
            
            {count > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{count - 5} meer wachtende claims
              </p>
            )}

            {onViewDisputes && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={onViewDisputes}
              >
                Bekijk alle claims
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});

export default StaleClaimsWidget;
