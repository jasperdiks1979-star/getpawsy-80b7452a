import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link2, AlertTriangle, Target, Shield, Layers, TrendingUp } from 'lucide-react';
import { buildGuideMetrics, detectFlags, getLinkHealthColor, getTierMap } from '@/lib/link-injection-engine';

interface LinkInjectionWidgetProps {
  onNavigate?: () => void;
}

export const LinkInjectionWidget = ({ onNavigate }: LinkInjectionWidgetProps) => {
  const stats = useMemo(() => {
    const metrics = buildGuideMetrics({});
    const totalGuides = metrics.length;
    const underSupported = metrics.filter(m => m.inboundInternalLinks < 4).length;
    const avgInbound = totalGuides > 0
      ? Math.round((metrics.reduce((s, m) => s + m.inboundInternalLinks, 0) / totalGuides) * 10) / 10
      : 0;
    const healthColor = getLinkHealthColor(avgInbound);
    
    // DAS & Tier stats
    const tiers = getTierMap(metrics);
    const avgDAS = totalGuides > 0
      ? Math.round(metrics.reduce((s, m) => s + m.das, 0) / totalGuides)
      : 0;

    // Over-optimization check: exact anchor ratio estimate
    const overOptRisk = avgInbound > 12 ? 'high' : avgInbound > 8 ? 'medium' : 'low';

    return { totalGuides, underSupported, avgInbound, healthColor, tiers, avgDAS, overOptRisk };
  }, []);

  const colorMap = {
    red: 'text-destructive',
    orange: 'text-orange-500',
    green: 'text-green-600',
  };

  const riskColorMap = {
    low: 'bg-green-500/10 text-green-700',
    medium: 'bg-orange-500/10 text-orange-700',
    high: 'bg-destructive/10 text-destructive',
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onNavigate}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4 text-blue-500" />
          Internal Link Authority Engine
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Avg DAS
            </span>
            <span className="text-lg font-bold">{stats.avgDAS}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Layers className="h-3 w-3" /> Tiers
            </span>
            <div className="flex gap-1.5 text-xs">
              <Badge variant="default" className="text-[10px] px-1.5">{stats.tiers.tier1.length} T1</Badge>
              <Badge variant="secondary" className="text-[10px] px-1.5">{stats.tiers.tier2.length} T2</Badge>
              <Badge variant="outline" className="text-[10px] px-1.5">{stats.tiers.tier3.length} T3</Badge>
            </div>
          </div>
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
              <Target className="h-3 w-3" /> Over-opt Risk
            </span>
            <Badge className={riskColorMap[stats.overOptRisk]}>
              {stats.overOptRisk}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Click to view injection log →
        </p>
      </CardContent>
    </Card>
  );
};
