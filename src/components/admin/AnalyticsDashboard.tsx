import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Users, 
  Eye, 
  TrendingUp, 
  Globe, 
  Smartphone, 
  Monitor,
  Clock,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Activity,
  Zap,
  MapPin,
  MousePointerClick
} from "lucide-react";
import { motion } from "framer-motion";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";

// Demo data - will be replaced with real GA4 data when credentials are added
const demoOverviewData = {
  activeUsers: 127,
  totalPageViews: 3842,
  avgSessionDuration: "2m 34s",
  bounceRate: 42.5,
  newUsers: 89,
  returningUsers: 38,
  conversionRate: 3.2,
  revenue: 1247.50,
};

const demoTrafficData = [
  { date: "Ma", users: 145, pageViews: 423, sessions: 189 },
  { date: "Di", users: 132, pageViews: 387, sessions: 165 },
  { date: "Wo", users: 178, pageViews: 512, sessions: 223 },
  { date: "Do", users: 156, pageViews: 445, sessions: 198 },
  { date: "Vr", users: 189, pageViews: 567, sessions: 245 },
  { date: "Za", users: 234, pageViews: 689, sessions: 312 },
  { date: "Zo", users: 198, pageViews: 578, sessions: 267 },
];

const demoRealtimeData = [
  { time: "Nu", users: 127 },
  { time: "1m", users: 119 },
  { time: "2m", users: 134 },
  { time: "3m", users: 128 },
  { time: "4m", users: 115 },
  { time: "5m", users: 142 },
];

const demoTopPages = [
  { page: "/", views: 1245, avgTime: "1m 23s" },
  { page: "/products", views: 892, avgTime: "2m 45s" },
  { page: "/products/kat-speelgoed", views: 567, avgTime: "3m 12s" },
  { page: "/cart", views: 345, avgTime: "1m 56s" },
  { page: "/checkout", views: 234, avgTime: "4m 23s" },
];

const demoDeviceData = [
  { name: "Mobile", value: 58, color: "hsl(25, 65%, 45%)" },
  { name: "Desktop", value: 35, color: "hsl(140, 25%, 45%)" },
  { name: "Tablet", value: 7, color: "hsl(80, 25%, 45%)" },
];

const demoCountryData = [
  { country: "Nederland", users: 2345, flag: "🇳🇱" },
  { country: "België", users: 567, flag: "🇧🇪" },
  { country: "Duitsland", users: 234, flag: "🇩🇪" },
  { country: "Frankrijk", users: 123, flag: "🇫🇷" },
  { country: "Verenigd Koninkrijk", users: 89, flag: "🇬🇧" },
];

const demoEcommerceData = {
  transactions: 47,
  revenue: 2847.50,
  avgOrderValue: 60.58,
  cartAbandonment: 68.5,
  topProducts: [
    { name: "Interactief Kattenspeelgoed", sales: 23, revenue: 459.77 },
    { name: "Honden Knuffelbed XL", sales: 15, revenue: 524.85 },
    { name: "Premium Krabpaal", sales: 12, revenue: 419.88 },
    { name: "Automatische Voerbak", sales: 9, revenue: 314.91 },
  ],
};

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
}

const MetricCard = ({ title, value, change, icon, subtitle }: MetricCardProps) => (
  <Card className="relative overflow-hidden">
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
              {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>{Math.abs(change)}% vs vorige week</span>
            </div>
          )}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

interface AnalyticsDashboardProps {
  isConfigured?: boolean;
}

export const AnalyticsDashboard = ({ isConfigured = false }: AnalyticsDashboardProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [realtimeUsers, setRealtimeUsers] = useState(127);

  // Simulate realtime user count changes
  useEffect(() => {
    if (!isConfigured) return;
    
    const interval = setInterval(() => {
      setRealtimeUsers(prev => {
        const change = Math.floor(Math.random() * 21) - 10;
        return Math.max(50, prev + change);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isConfigured]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsRefreshing(false);
  };

  if (!isConfigured) {
    return (
      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-primary/10 rounded-full mb-6">
            <BarChart3 className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Google Analytics Koppeling</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Koppel je Google Analytics 4 account om realtime inzichten, 
            bezoekersstatistieken en e-commerce data te bekijken.
          </p>
          
          <div className="bg-muted/50 rounded-lg p-6 max-w-lg text-left space-y-4 mb-6">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              Wat heb je nodig?
            </h4>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                <span>Een Google Cloud Project met de <strong>Analytics Data API</strong> ingeschakeld</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                <span>Een <strong>Service Account</strong> met Viewer toegang tot je GA4 property</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                <span>De <strong>JSON key</strong> van het service account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                <span>Je <strong>GA4 Property ID</strong> (te vinden in GA4 Admin → Property Settings)</span>
              </li>
            </ol>
          </div>

          <Badge variant="secondary" className="text-sm">
            Deel je credentials via de chat om de koppeling te voltooien
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Realtime inzichten van je webshop</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-2">
            <Activity className="w-3 h-3 text-green-500 animate-pulse" />
            Live
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Vernieuwen
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overzicht
          </TabsTrigger>
          <TabsTrigger value="realtime" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Realtime
          </TabsTrigger>
          <TabsTrigger value="audience" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Publiek
          </TabsTrigger>
          <TabsTrigger value="ecommerce" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            E-commerce
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Actieve Gebruikers"
              value={demoOverviewData.activeUsers.toLocaleString()}
              change={12.5}
              icon={<Users className="w-5 h-5" />}
              subtitle="Laatste 30 minuten"
            />
            <MetricCard
              title="Paginaweergaven"
              value={demoOverviewData.totalPageViews.toLocaleString()}
              change={8.3}
              icon={<Eye className="w-5 h-5" />}
              subtitle="Vandaag"
            />
            <MetricCard
              title="Gem. Sessieduur"
              value={demoOverviewData.avgSessionDuration}
              change={-2.1}
              icon={<Clock className="w-5 h-5" />}
            />
            <MetricCard
              title="Conversieratio"
              value={`${demoOverviewData.conversionRate}%`}
              change={5.7}
              icon={<TrendingUp className="w-5 h-5" />}
            />
          </div>

          {/* Traffic Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Verkeer Overzicht</CardTitle>
              <CardDescription>Gebruikers en paginaweergaven van de afgelopen week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={demoTrafficData}>
                    <defs>
                      <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(25, 65%, 45%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(25, 65%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPageViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(140, 25%, 45%)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(140, 25%, 45%)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }} 
                    />
                    <Area
                      type="monotone"
                      dataKey="users"
                      stroke="hsl(25, 65%, 45%)"
                      fillOpacity={1}
                      fill="url(#colorUsers)"
                      name="Gebruikers"
                    />
                    <Area
                      type="monotone"
                      dataKey="pageViews"
                      stroke="hsl(140, 25%, 45%)"
                      fillOpacity={1}
                      fill="url(#colorPageViews)"
                      name="Paginaweergaven"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle>Top Pagina's</CardTitle>
              <CardDescription>Meest bezochte pagina's vandaag</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoTopPages.map((page, index) => (
                  <div key={page.page} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                      <span className="font-medium">{page.page}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {page.views.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {page.avgTime}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Realtime Tab */}
        <TabsContent value="realtime" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Counter */}
            <Card className="lg:col-span-1">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <motion.div
                  key={realtimeUsers}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center"
                >
                  <div className="text-6xl font-bold text-primary mb-2">{realtimeUsers}</div>
                  <p className="text-muted-foreground">Gebruikers nu actief</p>
                </motion.div>
                <div className="flex items-center gap-2 mt-4">
                  <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">Live bijgewerkt</span>
                </div>
              </CardContent>
            </Card>

            {/* Realtime Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Gebruikers per Minuut
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={demoRealtimeData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="users"
                        stroke="hsl(25, 65%, 45%)"
                        strokeWidth={2}
                        dot={{ fill: "hsl(25, 65%, 45%)" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Pages */}
          <Card>
            <CardHeader>
              <CardTitle>Actieve Pagina's</CardTitle>
              <CardDescription>Waar gebruikers nu zijn</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {demoTopPages.slice(0, 5).map((page) => (
                  <div key={page.page} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <MousePointerClick className="w-4 h-4 text-primary" />
                      <span className="font-medium">{page.page}</span>
                    </div>
                    <Badge variant="secondary">{Math.floor(Math.random() * 20) + 5} actief</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Apparaten</CardTitle>
                <CardDescription>Verdeling per apparaattype</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={demoDeviceData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {demoDeviceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  {demoDeviceData.map((device) => (
                    <div key={device.name} className="flex items-center gap-2 text-sm">
                      {device.name === "Mobile" && <Smartphone className="w-4 h-4" style={{ color: device.color }} />}
                      {device.name === "Desktop" && <Monitor className="w-4 h-4" style={{ color: device.color }} />}
                      {device.name === "Tablet" && <Smartphone className="w-4 h-4" style={{ color: device.color }} />}
                      <span>{device.name}: {device.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Countries */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  Landen
                </CardTitle>
                <CardDescription>Top landen op basis van gebruikers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {demoCountryData.map((country, index) => (
                    <div key={country.country} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{country.flag}</span>
                        <span className="font-medium">{country.country}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${(country.users / demoCountryData[0].users) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-16 text-right">
                          {country.users.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* User Types */}
          <Card>
            <CardHeader>
              <CardTitle>Nieuwe vs Terugkerende Gebruikers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center p-6 bg-primary/5 rounded-lg">
                  <div className="text-4xl font-bold text-primary mb-2">
                    {demoOverviewData.newUsers}
                  </div>
                  <p className="text-muted-foreground">Nieuwe Gebruikers</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {Math.round((demoOverviewData.newUsers / (demoOverviewData.newUsers + demoOverviewData.returningUsers)) * 100)}%
                  </p>
                </div>
                <div className="text-center p-6 bg-secondary/50 rounded-lg">
                  <div className="text-4xl font-bold text-secondary-foreground mb-2">
                    {demoOverviewData.returningUsers}
                  </div>
                  <p className="text-muted-foreground">Terugkerende Gebruikers</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {Math.round((demoOverviewData.returningUsers / (demoOverviewData.newUsers + demoOverviewData.returningUsers)) * 100)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* E-commerce Tab */}
        <TabsContent value="ecommerce" className="space-y-6">
          {/* E-commerce Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Transacties"
              value={demoEcommerceData.transactions}
              change={15.2}
              icon={<ShoppingCart className="w-5 h-5" />}
              subtitle="Vandaag"
            />
            <MetricCard
              title="Omzet"
              value={`€${demoEcommerceData.revenue.toFixed(2)}`}
              change={22.8}
              icon={<TrendingUp className="w-5 h-5" />}
              subtitle="Vandaag"
            />
            <MetricCard
              title="Gem. Orderwaarde"
              value={`€${demoEcommerceData.avgOrderValue.toFixed(2)}`}
              change={3.5}
              icon={<BarChart3 className="w-5 h-5" />}
            />
            <MetricCard
              title="Winkelwagen Verlating"
              value={`${demoEcommerceData.cartAbandonment}%`}
              change={-5.2}
              icon={<AlertCircle className="w-5 h-5" />}
            />
          </div>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle>Top Verkochte Producten</CardTitle>
              <CardDescription>Best presterende producten vandaag</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {demoEcommerceData.topProducts.map((product, index) => (
                  <div key={product.name} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-muted-foreground">#{index + 1}</span>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.sales} verkocht</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">€{product.revenue.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">omzet</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Omzet Trend</CardTitle>
              <CardDescription>Dagelijkse omzet van de afgelopen week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demoTrafficData.map((d, i) => ({ ...d, revenue: (i + 1) * 120 + Math.random() * 200 }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `€${v}`} />
                    <Tooltip 
                      formatter={(value: number) => [`€${value.toFixed(2)}`, "Omzet"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }} 
                    />
                    <Bar dataKey="revenue" fill="hsl(25, 65%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
