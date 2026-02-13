import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, AlertTriangle, Target, Shield } from 'lucide-react';
import { buildGuideMetrics, detectFlags, getLinkHealthColor } from '@/lib/link-injection-engine';

interface LinkInjectionWidgetProps {
  onNavigate?: () => void;
}

export const LinkInjectionWidget = ({ onNavigate }: LinkInjectionWidgetProps) => {
  const stats = useMemo(() => {
    // Build with empty GSC data to show structural link analysis
    const metrics = buildGuideMetrics({});
    const totalGuides = metrics.length;
    const underSupported = metrics.filter(m => m.inboundInternalLinks < 4).length;
    const avgInbound = totalGuides > 0
      ? Math.round((metrics.reduce((s, m) => s + m.inboundInternalLinks, 0) / totalGuides) * 10) / 10
      : 0;
    const healthColor = getLinkHealthColor(avgInbound);

    return { totalGuides, underSupported, avgInbound, healthColor };
  }, []);

  const colorMap = {
    red: 'text-destructive',
    orange: 'text-orange-500',
    green: 'text-green-600',
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onNavigate}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-blue-500" />
          Internal Link Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" /> Avg Inbound
            </span>
            <span className={`text-lg font-bold ${colorMap[stats.healthColor]}`}>
              {stats.avgInbound}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Under-supported
            </span>
            <Badge variant={stats.underSupported > 0 ? 'destructive' : 'secondary'}>
              {stats.underSupported}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Total Guides
            </span>
            <span className="text-sm font-medium">{stats.totalGuides}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Click to view injection log →
        </p>
      </CardContent>
    </Card>
  );
};
