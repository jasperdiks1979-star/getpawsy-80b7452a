import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  Euro, 
  ShoppingCart, 
  TrendingUp, 
  Package, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  X
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
import { format, subDays, startOfDay, endOfDay, parseISO, isWithinInterval, startOfMonth, endOfMonth, differenceInDays } from "date-fns";
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
  // Date range filter state
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());

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

  // Filter orders by date range
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    if (!startDate || !endDate) return orders;
    
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    
    return orders.filter((order) => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, { start, end });
    });
  }, [orders, startDate, endDate]);

  const dateRangeDays = useMemo(() => {
    if (!startDate || !endDate) return 30;
    return Math.max(1, differenceInDays(endDate, startDate) + 1);
  }, [startDate, endDate]);

  // Calculate statistics based on filtered orders
  const stats = useMemo(() => {
    if (!filteredOrders || filteredOrders.length === 0) {
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
    const paidOrders = filteredOrders.filter(o => paidStatuses.includes(o.status));

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
    const uniqueEmails = new Set(filteredOrders.filter(o => o.customer_email).map(o => o.customer_email));
    const uniqueCustomers = uniqueEmails.size;

    // Daily revenue for chart (based on date range)
    const dailyData = [];
    const chartDays = Math.min(dateRangeDays, 30); // Limit to 30 days for readability
    const chartStartDate = startDate || subDays(new Date(), chartDays);
    
    for (let i = chartDays - 1; i >= 0; i--) {
      const date = subDays(endDate || new Date(), i);
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
    filteredOrders.forEach(o => {
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
    const recentOrders = filteredOrders.slice(0, 5);

    return {
      totalRevenue,
      totalOrders: filteredOrders.length,
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
  }, [filteredOrders, dateRangeDays, startDate, endDate]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  const exportToCSV = () => {
    if (!filteredOrders || filteredOrders.length === 0) {
      toast.error("Geen data om te exporteren");
      return;
    }

    const dateRangeText = startDate && endDate 
      ? `${format(startDate, "dd-MM-yyyy")} t/m ${format(endDate, "dd-MM-yyyy")}`
      : "Alle data";

    const headers = ["Datum", "Order ID", "Klant Email", "Status", "Totaal (€)", "Aantal Items"];
    const rows = filteredOrders.map((order) => {
      const items = order.items as unknown as OrderItem[];
      const itemCount = Array.isArray(items) ? items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
      return [
        format(parseISO(order.created_at), "dd-MM-yyyy HH:mm"),
        order.id.slice(0, 8),
        order.customer_email || "Onbekend",
        STATUS_LABELS[order.status] || order.status,
        (Number(order.total_amount) / 100).toFixed(2),
        itemCount.toString(),
      ];
    });

    // Add summary rows
    rows.push([]);
    rows.push(["Periode", dateRangeText]);
    rows.push(["Totale omzet", formatCurrency(stats.totalRevenue)]);
    rows.push(["Totaal bestellingen", stats.totalOrders.toString()]);
    rows.push(["Gemiddelde orderwaarde", formatCurrency(stats.avgOrderValue)]);
    rows.push(["Unieke klanten", stats.uniqueCustomers.toString()]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `verkoop-rapport-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    
    toast.success("CSV geëxporteerd");
  };

  const exportToPDF = () => {
    if (!filteredOrders || filteredOrders.length === 0) {
      toast.error("Geen data om te exporteren");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup geblokkeerd. Sta popups toe om te exporteren.");
      return;
    }

    const dateRangeText = startDate && endDate 
      ? `${format(startDate, "d MMMM yyyy", { locale: nl })} t/m ${format(endDate, "d MMMM yyyy", { locale: nl })}`
      : "Alle data";

    const statusBreakdown = stats.statusDistribution
      .map((s) => `<tr><td>${s.name}</td><td>${s.value}</td></tr>`)
      .join("");

    const topProductsRows = stats.topProducts
      .map(
        (p) =>
          `<tr><td>${p.name}</td><td>${p.quantity}</td><td>${formatCurrency(p.revenue)}</td></tr>`
      )
      .join("");

    const ordersRows = filteredOrders
      .slice(0, 50)
      .map((order) => {
        const items = order.items as unknown as OrderItem[];
        const itemCount = Array.isArray(items)
          ? items.reduce((sum, item) => sum + (item.quantity || 1), 0)
          : 0;
        return `<tr>
          <td>${format(parseISO(order.created_at), "dd-MM-yyyy")}</td>
          <td>${order.id.slice(0, 8)}</td>
          <td>${order.customer_email || "Onbekend"}</td>
          <td>${STATUS_LABELS[order.status] || order.status}</td>
          <td>${formatCurrency(order.total_amount)}</td>
          <td>${itemCount}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Verkoop Rapport - GetPawsy</title>
        <style>
          * { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          body { padding: 40px; max-width: 900px; margin: 0 auto; color: #1a1a1a; }
          h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
          h2 { color: #374151; margin-top: 30px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
          .stat-card { background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #2563eb; }
          .stat-label { font-size: 12px; color: #6b7280; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          th { background: #f9fafb; font-weight: 600; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>📊 Verkoop Rapport - GetPawsy</h1>
        <p><strong>Periode:</strong> ${dateRangeText}</p>
        <p>Gegenereerd op: ${format(new Date(), "d MMMM yyyy HH:mm", { locale: nl })}</p>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${formatCurrency(stats.totalRevenue)}</div>
            <div class="stat-label">Totale Omzet</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.totalOrders}</div>
            <div class="stat-label">Totaal Bestellingen</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.uniqueCustomers}</div>
            <div class="stat-label">Unieke Klanten</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${formatCurrency(stats.avgOrderValue)}</div>
            <div class="stat-label">Gemiddelde Orderwaarde</div>
          </div>
        </div>

        <h2>📈 Status Verdeling</h2>
        <table>
          <thead><tr><th>Status</th><th>Aantal</th></tr></thead>
          <tbody>${statusBreakdown || "<tr><td colspan='2'>Geen data</td></tr>"}</tbody>
        </table>

        <h2>🏆 Top 5 Producten</h2>
        <table>
          <thead><tr><th>Product</th><th>Verkocht</th><th>Omzet</th></tr></thead>
          <tbody>${topProductsRows || "<tr><td colspan='3'>Geen data</td></tr>"}</tbody>
        </table>

        <h2>📋 Recente Bestellingen (max 50)</h2>
        <table>
          <thead>
            <tr><th>Datum</th><th>Order ID</th><th>Klant</th><th>Status</th><th>Totaal</th><th>Items</th></tr>
          </thead>
          <tbody>${ordersRows}</tbody>
        </table>

        <div class="footer">
          <p>Dit rapport is automatisch gegenereerd door GetPawsy Admin Dashboard.</p>
        </div>

        <button class="no-print" onclick="window.print()" style="margin-top: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 5px; cursor: pointer;">
          🖨️ Afdrukken / Opslaan als PDF
        </button>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    
    toast.success("PDF rapport geopend in nieuw tabblad");
  };

  const resetDateRange = () => {
    setStartDate(subDays(new Date(), 30));
    setEndDate(new Date());
  };

  const setPresetRange = (days: number) => {
    setStartDate(subDays(new Date(), days));
    setEndDate(new Date());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Verkoop Dashboard</h2>
            <p className="text-muted-foreground">Overzicht van je verkoop statistieken</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} disabled={isLoading}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF} disabled={isLoading}>
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">Periode:</span>
                
                {/* Start Date Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "d MMM yyyy", { locale: nl }) : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => date > new Date() || (endDate ? date > endDate : false)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-muted-foreground">t/m</span>

                {/* End Date Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "d MMM yyyy", { locale: nl }) : "Eind"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => date > new Date() || (startDate ? date < startDate : false)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                <Button variant="ghost" size="sm" onClick={resetDateRange}>
                  <X className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>

              {/* Quick presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Snel:</span>
                <Button variant="secondary" size="sm" onClick={() => setPresetRange(7)}>
                  7 dagen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPresetRange(30)}>
                  30 dagen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPresetRange(90)}>
                  90 dagen
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPresetRange(365)}>
                  1 jaar
                </Button>
              </div>
            </div>
            
            {/* Selected range info */}
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline">
                {filteredOrders.length} orders in geselecteerde periode
              </Badge>
              {startDate && endDate && (
                <Badge variant="secondary">
                  {dateRangeDays} dagen
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
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
