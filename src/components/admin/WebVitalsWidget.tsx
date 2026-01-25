import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Zap, Move, Clock, Server } from 'lucide-react';
import { useWebVitals } from '@/hooks/useWebVitals';
import { formatMetricValue, getRatingColor } from '@/lib/web-vitals';
import { Skeleton } from '@/components/ui/skeleton';

const metricIcons: Record<string, React.ReactNode> = {
  LCP: <Activity className="h-4 w-4" />,
  FID: <Zap className="h-4 w-4" />,
  CLS: <Move className="h-4 w-4" />,
  FCP: <Clock className="h-4 w-4" />,
  TTFB: <Server className="h-4 w-4" />,
};

const metricDescriptions: Record<string, string> = {
  LCP: 'Largest Contentful Paint',
  FID: 'First Input Delay',
  CLS: 'Cumulative Layout Shift',
  FCP: 'First Contentful Paint',
  TTFB: 'Time to First Byte',
};

const WebVitalsWidget = memo(function WebVitalsWidget() {
  const { metrics, isLoading, getOverallScore } = useWebVitals();
  const overallScore = getOverallScore();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Core Web Vitals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Core Web Vitals
          </CardTitle>
          <Badge 
            variant={overallScore >= 80 ? 'default' : overallScore >= 50 ? 'secondary' : 'destructive'}
            className="text-sm"
          >
            Score: {overallScore}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Overall Performance</span>
            <span>{overallScore}%</span>
          </div>
          <Progress 
            value={overallScore} 
            className="h-2"
          />
        </div>

        {/* Individual Metrics */}
        <div className="space-y-3 pt-2">
          {metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Metrics worden verzameld tijdens het browsen...
            </p>
          ) : (
            metrics.map((metric) => (
              <div 
                key={metric.name} 
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <div className="text-muted-foreground">
                    {metricIcons[metric.name]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{metric.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {metricDescriptions[metric.name]}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-mono font-semibold ${getRatingColor(metric.rating)}`}>
                    {formatMetricValue(metric.name, metric.value)}
                  </p>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getRatingColor(metric.rating)}`}
                  >
                    {metric.rating === 'good' ? '✓ Goed' : 
                     metric.rating === 'needs-improvement' ? '⚠ Matig' : 
                     '✗ Slecht'}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Thresholds Info */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Gebaseerd op Google's Core Web Vitals thresholds. 
            LCP &lt; 2.5s, FID &lt; 100ms, CLS &lt; 0.1
          </p>
        </div>
      </CardContent>
    </Card>
  );
});

export default WebVitalsWidget;
