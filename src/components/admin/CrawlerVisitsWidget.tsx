import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bot, Clock, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface CrawlerVisit {
  id: string;
  page_url: string;
  user_agent: string;
  is_googlebot: boolean;
  bot_type: string | null;
  ip_address: string | null;
  referrer: string | null;
  created_at: string;
}

export const CrawlerVisitsWidget = () => {
  const { data: visits, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['crawler-visits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crawler_visits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as CrawlerVisit[];
    },
  });

  const googlebotVisits = visits?.filter(v => v.is_googlebot) || [];
  const otherBotVisits = visits?.filter(v => !v.is_googlebot && v.bot_type) || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Crawler Bezoeken</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">Googlebot</span>
            </div>
            <p className="text-2xl font-bold mt-1">{googlebotVisits.length}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Globe className="h-4 w-4" />
              <span className="text-sm font-medium">Andere Bots</span>
            </div>
            <p className="text-2xl font-bold mt-1">{otherBotVisits.length}</p>
          </div>
        </div>

        {/* Visits Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Laden...
          </div>
        ) : visits && visits.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tijd</TableHead>
                  <TableHead>Pagina</TableHead>
                  <TableHead>Bot Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {format(new Date(visit.created_at), 'dd MMM HH:mm', { locale: nl })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {visit.page_url}
                      </code>
                    </TableCell>
                    <TableCell>
                      {visit.is_googlebot ? (
                        <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">
                          {visit.bot_type || 'Googlebot'}
                        </Badge>
                      ) : visit.bot_type ? (
                        <Badge variant="secondary">
                          {visit.bot_type}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nog geen crawler bezoeken geregistreerd</p>
          </div>
        )}

        {/* Latest Googlebot Visit Highlight */}
        {googlebotVisits.length > 0 && (
          <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Laatste Googlebot bezoek:</span>{' '}
              {format(new Date(googlebotVisits[0].created_at), "d MMMM yyyy 'om' HH:mm:ss", { locale: nl })}
              {' — '}
              <code className="text-xs">{googlebotVisits[0].page_url}</code>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
