import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Euro, 
  ShoppingCart, 
  TrendingUp, 
  Package, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from "lucide-react";
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
  Legend
} from "recharts";
import { format, subDays, startOfDay, endOfDay, parseISO, isWithinInterval, startOfMonth, endOfMonth } from "date-fns";
import { nl } from "date-fns/locale";
import { Json } from "@/integrations/supabase/types";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  product_id?: string;
}

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  currency: string;
  items: Json;
  customer_email: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "hsl(45, 93%, 47%)",
  paid: "hsl(142, 76%, 36%)",
  processing: "hsl(217, 91%, 60%)",
  shipped: "hsl(262, 83%, 58%)",
  delivered: "hsl(142, 76%, 36%)",
  cancelled: "hsl(0, 84%, 60%)",
  refunded: "hsl(0, 84%, 60%)",
  failed: "hsl(0, 84%, 60%)",
  expired: "hsl(0, 0%, 45%)",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "In afwachting",
  paid: "Betaald",
  processing: "In verwerking",
  shipped: "Verzonden",
  delivered: "Afgeleverd",
  cancelled: "Geannuleerd",
  refunded: "Terugbetaald",
  failed: "Mislukt",
  expired: "Verlopen",
};

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
  loading?: boolean;
}

const MetricCard = ({ title, value, change, icon, subtitle, loading }: MetricCardProps) => {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-12 w-12 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {change !== undefined && (
              <div className={`flex items-center gap-1 text-sm ${change >= 0 ? "text-green-600" : "text-red-600"}`}>
                {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span>{Math.abs(change).toFixed(1)}% vs vorige periode</span>
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
};

export const SalesDashboard = () => {
  // Fetch all orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Calculate statistics
  const stats = useMemo(() => {
    if (!orders || orders.length === 0) {
      return {
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        uniqueCustomers: 0,
        todayRevenue: 0,
        todayOrders: 0,
        weekRevenue: 0,
        weekOrders: 0,
        monthRevenue: 0,
        monthOrders: 0,
        revenueChange: 0,
        ordersChange: 0,
        dailyData: [],
        statusDistribution: [],
        topProducts: [],
        recentOrders: [],
      };
    }

    const now = new Date();
    const today = startOfDay(now);
    const weekAgo = subDays(today, 7);
    const twoWeeksAgo = subDays(today, 14);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Filter paid/successful orders for revenue calculations
    const paidStatuses = ["paid", "processing", "shipped", "delivered"];
    const paidOrders = orders.filter(o => paidStatuses.includes(o.status));

    // Today's stats
    const todayOrders = paidOrders.filter(o => 
      isWithinInterval(parseISO(o.created_at), { start: today, end: endOfDay(now) })
    );
    const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // This week's stats
    const thisWeekOrders = paidOrders.filter(o => 
      isWithinInterval(parseISO(o.created_at), { start: weekAgo, end: now })
    );
    const weekRevenue = thisWeekOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // Last week's stats (for comparison)
    const lastWeekOrders = paidOrders.filter(o => 
      isWithinInterval(parseISO(o.created_at), { start: twoWeeksAgo, end: weekAgo })
    );
    const lastWeekRevenue = lastWeekOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // This month's stats
    const monthOrders = paidOrders.filter(o => 
      isWithinInterval(parseISO(o.created_at), { start: monthStart, end: monthEnd })
    );
    const monthRevenue = monthOrders.reduce((sum, o) => sum + o.total_amount, 0);

    // Calculate percentage changes
    const revenueChange = lastWeekRevenue > 0 
      ? ((weekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 
      : weekRevenue > 0 ? 100 : 0;
    const ordersChange = lastWeekOrders.length > 0 
      ? ((thisWeekOrders.length - lastWeekOrders.length) / lastWeekOrders.length) * 100 
      : thisWeekOrders.length > 0 ? 100 : 0;

    // Total stats
    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    // Unique customers
    const uniqueEmails = new Set(orders.filter(o => o.customer_email).map(o => o.customer_email));
    const uniqueCustomers = uniqueEmails.size;

    // Daily revenue for chart (last 14 days)
    const dailyData = [];
    for (let i = 13; i >= 0; i--) {
      const date = subDays(now, i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);
      
      const dayOrders = paidOrders.filter(o => 
        isWithinInterval(parseISO(o.created_at), { start: dayStart, end: dayEnd })
      );
      
      dailyData.push({
        date: format(date, "dd MMM", { locale: nl }),
        revenue: dayOrders.reduce((sum, o) => sum + o.total_amount, 0) / 100, // Convert cents to euros
        orders: dayOrders.length,
      });
    }

    // Status distribution
    const statusCounts: Record<string, number> = {};
    orders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "hsl(0, 0%, 60%)",
    }));

    // Top products
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    paidOrders.forEach(order => {
      const items = order.items as unknown as OrderItem[];
      if (Array.isArray(items)) {
        items.forEach(item => {
          const key = item.name || "Unknown";
          if (!productSales[key]) {
            productSales[key] = { name: key, quantity: 0, revenue: 0 };
          }
          productSales[key].quantity += item.quantity || 1;
          productSales[key].revenue += (item.price || 0) * (item.quantity || 1);
        });
      }
    });
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Recent orders
    const recentOrders = orders.slice(0, 5);

    return {
      totalRevenue,
      totalOrders: orders.length,
      avgOrderValue,
      uniqueCustomers,
      todayRevenue,
      todayOrders: todayOrders.length,
      weekRevenue,
      weekOrders: thisWeekOrders.length,
      monthRevenue,
      monthOrders: monthOrders.length,
      revenueChange,
      ordersChange,
      dailyData,
      statusDistribution,
      topProducts,
      recentOrders,
    };
  }, [orders]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Verkoop Dashboard</h2>
          <p className="text-muted-foreground">Overzicht van je verkoop statistieken</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          <Calendar className="w-3 h-3" />
          {format(new Date(), "d MMMM yyyy", { locale: nl })}
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Totale Omzet"
          value={formatCurrency(stats.totalRevenue)}
          icon={<Euro className="w-5 h-5" />}
          subtitle="Alle betaalde orders"
          loading={isLoading}
        />
        <MetricCard
          title="Omzet Deze Week"
          value={formatCurrency(stats.weekRevenue)}
          change={stats.revenueChange}
          icon={<TrendingUp className="w-5 h-5" />}
          loading={isLoading}
        />
        <MetricCard
          title="Totaal Orders"
          value={stats.totalOrders.toLocaleString("nl-NL")}
          icon={<ShoppingCart className="w-5 h-5" />}
          subtitle={`${stats.weekOrders} deze week`}
          loading={isLoading}
        />
        <MetricCard
          title="Gem. Orderwaarde"
          value={formatCurrency(stats.avgOrderValue)}
          icon={<Package className="w-5 h-5" />}
          subtitle={`${stats.uniqueCustomers} unieke klanten`}
          loading={isLoading}
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vandaag</p>
                <p className="text-xl font-bold">{formatCurrency(stats.todayRevenue)}</p>
              </div>
              <Badge variant="secondary">{stats.todayOrders} orders</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Deze Week</p>
                <p className="text-xl font-bold">{formatCurrency(stats.weekRevenue)}</p>
              </div>
              <Badge variant="secondary">{stats.weekOrders} orders</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Deze Maand</p>
                <p className="text-xl font-bold">{formatCurrency(stats.monthRevenue)}</p>
              </div>
              <Badge variant="secondary">{stats.monthOrders} orders</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Omzet & Orders (14 dagen)</CardTitle>
            <CardDescription>Dagelijkse omzet en orderaantallen</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.dailyData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      formatter={(value: number, name: string) => [
                        name === "revenue" ? `€${value.toFixed(2)}` : value,
                        name === "revenue" ? "Omzet" : "Orders"
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name="revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
            <CardDescription>Verdeling per status</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : stats.statusDistribution.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {stats.statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [value, "Orders"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground">
                Geen orders gevonden
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Top Producten</CardTitle>
            <CardDescription>Best verkopende producten</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : stats.topProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.topProducts.map((product, index) => (
                  <div 
                    key={product.name} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-6">
                        {index + 1}.
                      </span>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.quantity} verkocht
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {formatCurrency(product.revenue)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Nog geen producten verkocht
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Recente Orders</CardTitle>
            <CardDescription>Laatste 5 orders</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : stats.recentOrders.length > 0 ? (
              <div className="space-y-3">
                {stats.recentOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {order.customer_email || "Gast"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(order.created_at), "d MMM HH:mm", { locale: nl })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        style={{ 
                          borderColor: STATUS_COLORS[order.status],
                          color: STATUS_COLORS[order.status]
                        }}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                      <span className="font-medium text-sm">
                        {formatCurrency(order.total_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Nog geen orders ontvangen
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
