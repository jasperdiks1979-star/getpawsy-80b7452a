import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Calendar, Loader2 } from "lucide-react";
import { useCronJobSummaries, type CronJobSummary } from "@/hooks/useCronJobLogs";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CronJobsWidgetProps {
  onNavigate?: () => void;
}

const getStatusIcon = (summary: CronJobSummary) => {
  if (!summary.last_run) {
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
  
  if (summary.last_run.status === 'running') {
    return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  }
  
  if (summary.last_run.success === true) {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  
  if (summary.last_run.success === false) {
    return <XCircle className="h-4 w-4 text-red-500" />;
  }
  
  return <AlertCircle className="h-4 w-4 text-yellow-500" />;
};

const getStatusBadge = (summary: CronJobSummary) => {
  if (!summary.last_run) {
    return <Badge variant="outline" className="text-xs">Geen data</Badge>;
  }
  
  if (summary.last_run.status === 'running') {
    return <Badge className="bg-blue-500/10 text-blue-500 text-xs">Actief</Badge>;
  }
  
  if (summary.last_run.success === true) {
    return <Badge className="bg-green-500/10 text-green-500 text-xs">Geslaagd</Badge>;
  }
  
  if (summary.last_run.success === false) {
    return <Badge className="bg-red-500/10 text-red-500 text-xs">Mislukt</Badge>;
  }
  
  return <Badge variant="outline" className="text-xs">Onbekend</Badge>;
};

const formatLastRun = (summary: CronJobSummary) => {
  if (!summary.last_run) return 'Nog niet uitgevoerd';
  
  return formatDistanceToNow(new Date(summary.last_run.started_at), {
    addSuffix: true,
    locale: nl,
  });
};

export const CronJobsWidget = ({ onNavigate }: CronJobsWidgetProps) => {
  const { data: summaries, isLoading, refetch, isRefetching } = useCronJobSummaries();

  const overallHealth = summaries ? 
    summaries.every(s => !s.last_run || s.last_run.success !== false) : true;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onNavigate}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Geplande Taken</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={overallHealth ? "default" : "destructive"}
              className={overallHealth ? "bg-green-500/10 text-green-500" : ""}
            >
              {overallHealth ? "Gezond" : "Problemen"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                refetch();
              }}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : summaries && summaries.length > 0 ? (
          <TooltipProvider>
            {summaries.map((summary) => (
              <div 
                key={summary.job_name}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(summary)}
                  <div>
                    <p className="text-sm font-medium">{summary.display_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{summary.schedule}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getStatusBadge(summary)}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-help">
                        {formatLastRun(summary)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <p><strong>Runs (24u):</strong> {summary.runs_24h}</p>
                        <p><strong>Succes rate:</strong> {summary.success_rate_24h}%</p>
                        {summary.last_run?.items_processed !== undefined && summary.last_run.items_processed > 0 && (
                          <p><strong>Items verwerkt:</strong> {summary.last_run.items_processed}</p>
                        )}
                        {summary.last_run?.error_message && (
                          <p className="text-red-400"><strong>Fout:</strong> {summary.last_run.error_message}</p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </TooltipProvider>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nog geen cron job logs beschikbaar
          </p>
        )}
      </CardContent>
    </Card>
  );
};
