import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Bell, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface PerformanceAlert {
  id: string;
  metric_name: string;
  threshold_type: 'warning' | 'critical';
  current_value: number;
  threshold_value: number;
  sample_count: number;
  notified_at: string;
}

const PerformanceAlertsWidget = memo(function PerformanceAlertsWidget() {
  const { data: alerts, isLoading } = useQuery({
    queryKey: ['performance-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_alerts')
        .select('*')
        .order('notified_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as PerformanceAlert[];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Performance Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const formatValue = (name: string, value: number) => {
    if (name === 'CLS') return value.toFixed(3);
    return `${Math.round(value)}ms`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Performance Alerts
          </CardTitle>
          {alerts && alerts.length > 0 && (
            <Badge variant="secondary">{alerts.length} recent</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!alerts || alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
            <p className="font-medium text-green-700">Geen alerts</p>
            <p className="text-sm text-muted-foreground">
              Alle Core Web Vitals zijn binnen de budgetten
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.threshold_type === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-4 w-4 ${
                      alert.threshold_type === 'critical'
                        ? 'text-red-600'
                        : 'text-yellow-600'
                    }`}
                  />
                  <span className="font-medium">{alert.metric_name}</span>
                  <Badge
                    variant={alert.threshold_type === 'critical' ? 'destructive' : 'secondary'}
                    className="text-xs"
                  >
                    {alert.threshold_type === 'critical' ? 'Critical' : 'Warning'}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatValue(alert.metric_name, alert.current_value)} / {formatValue(alert.metric_name, alert.threshold_value)} budget
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(alert.notified_at), { 
                    addSuffix: true,
                    locale: nl 
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gebaseerd op {alert.sample_count} metingen
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
});

export default PerformanceAlertsWidget;
