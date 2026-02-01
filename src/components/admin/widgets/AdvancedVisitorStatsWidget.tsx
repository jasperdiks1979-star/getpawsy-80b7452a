import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Monitor, 
  Smartphone, 
  Tablet,
  Globe,
  Clock,
  Eye,
  ShoppingBag,
  TrendingUp,
  Chrome,
  Search,
  Share2,
  Mail,
  CreditCard,
  Users
} from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";
import { useAdvancedVisitorStats, AdvancedTimeRange } from "@/hooks/useAdvancedVisitorStats";
import { useState } from "react";

const DEVICE_COLORS = {
  desktop: "hsl(217, 91%, 60%)",
  mobile: "hsl(142, 76%, 36%)",
  tablet: "hsl(262, 83%, 58%)",
};

const REFERRER_COLORS = {
  google: "hsl(217, 91%, 60%)",
  social: "hsl(330, 81%, 60%)",
  direct: "hsl(142, 76%, 36%)",
  email: "hsl(45, 93%, 47%)",
  paid: "hsl(0, 84%, 60%)",
  organic: "hsl(180, 70%, 45%)",
  other: "hsl(0, 0%, 60%)",
};

const REFERRER_LABELS: Record<string, string> = {
  google: "Google",
  social: "Social Media",
  direct: "Direct",
  email: "E-mail",
  paid: "Betaald",
  organic: "Organisch",
  other: "Overig",
};

const REFERRER_ICONS: Record<string, React.ReactNode> = {
  google: <Search className="h-3 w-3" />,
  social: <Share2 className="h-3 w-3" />,
  direct: <Globe className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  paid: <CreditCard className="h-3 w-3" />,
  organic: <TrendingUp className="h-3 w-3" />,
  other: <Users className="h-3 w-3" />,
};

const TIME_RANGE_LABELS: Record<AdvancedTimeRange, string> = {
  "15m": "15 min",
  "1h": "1 uur",
  "6h": "6 uur",
  "24h": "24 uur",
  "7d": "7 dagen",
  "30d": "30 dagen",
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}u ${Math.floor((seconds % 3600) / 60)}m`;
};

export const AdvancedVisitorStatsWidget = () => {
  const [timeRange, setTimeRange] = useState<AdvancedTimeRange>("24h");
  const { stats, isLoading, error } = useAdvancedVisitorStats(timeRange);

  if (error) {
    return (
      <Card className="col-span-full">
        <CardContent className="p-6">
          <p className="text-destructive">Fout bij laden van statistieken: {error}</p>
        </CardContent>
      </Card>
    );
  }

  const deviceData = [
    { name: "Desktop", value: stats.byDevice.desktop, icon: Monitor, color: DEVICE_COLORS.desktop },
    { name: "Mobiel", value: stats.byDevice.mobile, icon: Smartphone, color: DEVICE_COLORS.mobile },
    { name: "Tablet", value: stats.byDevice.tablet, icon: Tablet, color: DEVICE_COLORS.tablet },
  ].filter(d => d.value > 0);

  const referrerData = Object.entries(stats.byReferrer)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: REFERRER_LABELS[key] || key,
      value,
      color: REFERRER_COLORS[key as keyof typeof REFERRER_COLORS] || REFERRER_COLORS.other,
      icon: REFERRER_ICONS[key] || REFERRER_ICONS.other,
    }))
    .sort((a, b) => b.value - a.value);

  const browserData = Object.entries(stats.byBrowser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  const totalDevices = deviceData.reduce((sum, d) => sum + d.value, 0);
  const totalReferrers = referrerData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Bezoekersanalyse
            </CardTitle>
            <CardDescription>
              Gedetailleerde inzichten in bezoekers, apparaten en verkeersbronnen
            </CardDescription>
          </div>
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as AdvancedTimeRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIME_RANGE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricBox
            icon={<Users className="h-5 w-5 text-primary" />}
            label="Sessies"
            value={stats.totalSessions}
            loading={isLoading}
          />
          <MetricBox
            icon={<Clock className="h-5 w-5 text-primary" />}
            label="Gem. Sessieduur"
            value={formatDuration(stats.avgSessionDuration)}
            loading={isLoading}
          />
          <MetricBox
            icon={<Eye className="h-5 w-5 text-primary" />}
            label="Top Pagina's"
            value={stats.topPages.length}
            loading={isLoading}
          />
          <MetricBox
            icon={<ShoppingBag className="h-5 w-5 text-primary" />}
            label="Producten Bekeken"
            value={stats.topProducts.length}
            loading={isLoading}
          />
        </div>

        <Tabs defaultValue="devices" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="devices">Apparaten</TabsTrigger>
            <TabsTrigger value="sources">Bronnen</TabsTrigger>
            <TabsTrigger value="pages">Pagina's</TabsTrigger>
            <TabsTrigger value="products">Producten</TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Device Pie Chart */}
              <div className="h-64">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : deviceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {deviceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [`${value} (${((value / totalDevices) * 100).toFixed(1)}%)`, 'Sessies']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Geen apparaatdata beschikbaar
                  </div>
                )}
              </div>

              {/* Device List */}
              <div className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))
                ) : deviceData.length > 0 ? (
                  deviceData.map((device) => {
                    const Icon = device.icon;
                    const percentage = totalDevices > 0 ? ((device.value / totalDevices) * 100).toFixed(1) : '0';
                    return (
                      <div
                        key={device.name}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="p-2 rounded-lg" 
                            style={{ backgroundColor: `${device.color}20` }}
                          >
                            <Icon className="h-5 w-5" style={{ color: device.color }} />
                          </div>
                          <span className="font-medium">{device.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold">{device.value}</span>
                          <Badge variant="secondary">{percentage}%</Badge>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-center py-4">Geen data</p>
                )}
              </div>
            </div>

            {/* Browser Stats */}
            <div className="mt-6">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Chrome className="h-4 w-4" />
                Top Browsers
              </h4>
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : browserData.length > 0 ? (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={browserData} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">Geen browserdata</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sources" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Referrer Pie Chart */}
              <div className="h-64">
                {isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : referrerData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={referrerData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {referrerData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => [`${value} (${((value / totalReferrers) * 100).toFixed(1)}%)`, 'Sessies']}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Geen brondata beschikbaar
                  </div>
                )}
              </div>

              {/* Referrer List */}
              <ScrollArea className="h-64">
                <div className="space-y-3 pr-4">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))
                  ) : referrerData.length > 0 ? (
                    referrerData.map((source) => {
                      const percentage = totalReferrers > 0 ? ((source.value / totalReferrers) * 100).toFixed(1) : '0';
                      return (
                        <div
                          key={source.name}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="p-2 rounded-lg" 
                              style={{ backgroundColor: `${source.color}20` }}
                            >
                              <span style={{ color: source.color }}>{source.icon}</span>
                            </div>
                            <span className="font-medium">{source.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-semibold">{source.value}</span>
                            <Badge variant="secondary">{percentage}%</Badge>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted-foreground text-center py-4">Geen data</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="pages">
            <ScrollArea className="h-80">
              <div className="space-y-2 pr-4">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))
                ) : stats.topPages.length > 0 ? (
                  stats.topPages.map((page, index) => (
                    <div
                      key={page.page}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">
                          #{index + 1}
                        </span>
                        <span className="font-medium truncate max-w-[300px]">
                          {page.page === "/" ? "Homepage" : page.page}
                        </span>
                      </div>
                      <Badge variant="outline">{page.views} views</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nog geen paginaweergaven geregistreerd
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="products">
            <ScrollArea className="h-80">
              <div className="space-y-2 pr-4">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))
                ) : stats.topProducts.length > 0 ? (
                  stats.topProducts.map((product, index) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">
                          #{index + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium truncate max-w-[250px]">
                            {product.name}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline">{product.views} views</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nog geen productweergaven geregistreerd
                  </p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

interface MetricBoxProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
}

const MetricBox = ({ icon, label, value, loading }: MetricBoxProps) => {
  if (loading) {
    return (
      <div className="p-4 rounded-lg bg-muted/50 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-24" />
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
};

export default AdvancedVisitorStatsWidget;
