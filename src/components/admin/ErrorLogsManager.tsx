import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Bug, RefreshCw, Trash2, Clock, Globe, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  component_name: string | null;
  stack_trace: string | null;
  page_url: string | null;
  user_agent: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const ErrorLogsManager = () => {
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);

  const { data: errorLogs, isLoading, refetch } = useQuery({
    queryKey: ['frontend-error-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('frontend_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as ErrorLog[];
    },
  });

  const handleClearOldLogs = async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { error } = await supabase
      .from('frontend_error_logs')
      .delete()
      .lt('created_at', oneWeekAgo.toISOString());

    if (error) {
      toast.error('Fout bij verwijderen logs');
    } else {
      toast.success('Oude logs verwijderd');
      refetch();
    }
  };

  const getErrorTypeBadge = (type: string) => {
    const variants: Record<string, 'destructive' | 'secondary' | 'default' | 'outline'> = {
      'REACT_310': 'destructive',
      'NETWORK': 'secondary',
      'TYPE_ERROR': 'default',
      'REFERENCE_ERROR': 'default',
      'UNKNOWN': 'outline',
    };
    return variants[type] || 'outline';
  };

  const getDeviceType = (userAgent: string | null): string => {
    if (!userAgent) return 'Unknown';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Mac/i.test(userAgent)) return 'Mac';
    return 'Other';
  };

  const react310Count = errorLogs?.filter(e => e.error_type === 'REACT_310').length || 0;
  const totalCount = errorLogs?.length || 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Totaal Errors</CardDescription>
            <CardTitle className="text-3xl">{totalCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={react310Count > 0 ? 'border-destructive' : ''}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Bug className="w-4 h-4" />
              React #310 Errors
            </CardDescription>
            <CardTitle className="text-3xl text-destructive">{react310Count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Acties</CardDescription>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Vernieuwen
              </Button>
              <Button size="sm" variant="destructive" onClick={handleClearOldLogs}>
                <Trash2 className="w-4 h-4 mr-2" />
                Opruimen
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Error List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recente Errors</CardTitle>
            <CardDescription>Laatste 100 frontend errors</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            {errorLogs?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Geen errors gevonden</p>
              </div>
            ) : (
              <div className="space-y-2">
                {errorLogs?.map((log) => (
                  <div
                    key={log.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedError?.id === log.id ? 'bg-muted border-primary' : ''
                    }`}
                    onClick={() => setSelectedError(log)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getErrorTypeBadge(log.error_type)}>
                            {log.error_type}
                          </Badge>
                          {log.component_name && (
                            <span className="text-xs text-muted-foreground truncate">
                              {log.component_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">
                          {log.error_message}
                        </p>
                      </div>
                      <div className="flex flex-col items-end text-xs text-muted-foreground shrink-0">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(log.created_at), 'HH:mm', { locale: nl })}
                        </span>
                        <span>{format(new Date(log.created_at), 'd MMM', { locale: nl })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error Details */}
        <Card>
          <CardHeader>
            <CardTitle>Error Details</CardTitle>
            <CardDescription>
              {selectedError ? 'Klik op een error om details te zien' : 'Selecteer een error'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedError ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-1">Type</h4>
                  <Badge variant={getErrorTypeBadge(selectedError.error_type)}>
                    {selectedError.error_type}
                  </Badge>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Bericht</h4>
                  <p className="text-sm bg-muted p-3 rounded-lg break-words">
                    {selectedError.error_message}
                  </p>
                </div>

                {selectedError.component_name && (
                  <div>
                    <h4 className="font-medium mb-1">Component</h4>
                    <code className="text-sm bg-muted px-2 py-1 rounded">
                      {selectedError.component_name}
                    </code>
                  </div>
                )}

                {selectedError.page_url && (
                  <div>
                    <h4 className="font-medium mb-1 flex items-center gap-2">
                      <Globe className="w-4 h-4" /> URL
                    </h4>
                    <p className="text-sm text-muted-foreground break-all">
                      {selectedError.page_url}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-1 flex items-center gap-2">
                    <Smartphone className="w-4 h-4" /> Device
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {getDeviceType(selectedError.user_agent)}
                  </p>
                </div>

                {selectedError.stack_trace && (
                  <div>
                    <h4 className="font-medium mb-1">Stack Trace</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                      {selectedError.stack_trace}
                    </pre>
                  </div>
                )}

                {selectedError.metadata && Object.keys(selectedError.metadata).length > 0 && (
                  <div>
                    <h4 className="font-medium mb-1">Metadata</h4>
                    <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-40">
                      {JSON.stringify(selectedError.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <p>Session ID: {selectedError.session_id || 'N/A'}</p>
                  <p>Timestamp: {format(new Date(selectedError.created_at), 'PPpp', { locale: nl })}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Bug className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Selecteer een error om details te bekijken</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ErrorLogsManager;
