import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SyncProgress {
  current: number;
  total: number;
  status: 'idle' | 'syncing' | 'completed' | 'error' | 'retrying';
  currentItem?: string;
  synced?: number;
  errors?: number;
  retryAttempt?: number;
  maxRetries?: number;
}

interface SyncProgressIndicatorProps {
  progress: SyncProgress | null;
  title: string;
  className?: string;
}

export function SyncProgressIndicator({ progress, title, className }: SyncProgressIndicatorProps) {
  if (!progress) return null;

  const percentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'syncing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'retrying':
        return <RefreshCw className="h-4 w-4 animate-spin text-warning" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (progress.status) {
      case 'syncing':
        return progress.currentItem 
          ? `Syncing: ${progress.currentItem}` 
          : `Processing ${progress.current}/${progress.total}...`;
      case 'retrying':
        return `Retrying (${progress.retryAttempt}/${progress.maxRetries})...`;
      case 'completed':
        return progress.errors && progress.errors > 0
          ? `Completed with ${progress.errors} error(s)`
          : 'Completed successfully!';
      case 'error':
        return 'Failed';
      default:
        return 'Preparing...';
    }
  };

  const getProgressColor = () => {
    switch (progress.status) {
      case 'error':
        return 'bg-destructive';
      case 'retrying':
        return 'bg-warning';
      case 'completed':
        return progress.errors && progress.errors > 0 ? 'bg-warning' : 'bg-green-500';
      default:
        return 'bg-primary';
    }
  };

  return (
    <Card className={cn("border-muted", className)}>
      <CardContent className="py-3 px-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">{title}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {percentage}%
            </span>
          </div>

          <Progress 
            value={percentage} 
            className={cn("h-2", progress.status === 'error' && "[&>div]:bg-destructive")}
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate max-w-[200px]">{getStatusText()}</span>
            {(progress.synced !== undefined || progress.errors !== undefined) && (
              <div className="flex items-center gap-2">
                {progress.synced !== undefined && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    {progress.synced}
                  </span>
                )}
                {progress.errors !== undefined && progress.errors > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {progress.errors}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
