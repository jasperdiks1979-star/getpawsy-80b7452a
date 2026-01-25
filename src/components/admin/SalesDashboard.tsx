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
  TrendingDown,
  Package, 
  Users,
  ArrowUpRight,
  ArrowDownRight,
  CalendarIcon,
  FileSpreadsheet,
  FileText,
  X,
  AlertTriangle,
  Mail,
  Loader2
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
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import StaleClaimsWidget from "./StaleClaimsWidget";
import { PackagingInventoryWidget } from "./PackagingInventoryWidget";
import { CJWebhooksWidget } from "./CJWebhooksWidget";
import { RecentOrdersWidget } from "./RecentOrdersWidget";
import { DisputesWidget } from "./DisputesWidget";
import { ContactMessagesWidget } from "./ContactMessagesWidget";
import { NewsletterSubscribersWidget } from "./NewsletterSubscribersWidget";
import { PerformanceMetricsWidget } from "./PerformanceMetricsWidget";
import { BlogPostsWidget } from "./BlogPostsWidget";
import { SecurityIssuesWidget } from "./SecurityIssuesWidget";
import { CronJobsWidget } from "./CronJobsWidget";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  product_id?: string;
  cost_price?: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  cost_price: number | null;
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

interface SalesDashboardProps {
  onNavigateToTab?: (tab: string) => void;
}

export const SalesDashboard = ({ onNavigateToTab }: SalesDashboardProps) => {
  // Date range filter state
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  
  // Use authenticated fetch hook for session refresh
  const { refreshSessionIfNeeded } = useAuthenticatedFetch();

  // Fetch all orders with automatic session refresh
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders-stats"],
    queryFn: async () => {
      // Ensure session is fresh before fetching
      await refreshSessionIfNeeded();
      
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch products for cost price lookup
  const { data: products } = useQuery({
    queryKey: ["admin-products-for-profit"],
    queryFn: async () => {
      await refreshSessionIfNeeded();
      
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, cost_price");
      
      if (error) throw error;
      return data as Product[];
    },
    refetchInterval: 60000,
  });

  // Create a product lookup map
  const productCostMap = useMemo(() => {
    const map: Record<string, { costPrice: number; name: string }> = {};
    products?.forEach(p => {
      map[p.id] = { 
        costPrice: p.cost_price || 0,
        name: p.name 
      };
    });
    return map;
  }, [products]);

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
    // Default empty stats object - always return arrays to prevent .length errors
    const emptyStats = {
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
      dailyData: [] as Array<{ date: string; revenue: number; orders: number }>,
      statusDistribution: [] as Array<{ name: string; value: number; color: string }>,
      topProducts: [] as Array<{ name: string; quantity: number; revenue: number }>,
      mostProfitableProducts: [] as Array<{ name: string; quantity: number; revenue: number; cost: number; profit: number; product_id?: string }>,
      lowMarginProducts: [] as Array<{ name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number; product_id?: string }>,
      negativeMarginProducts: [] as Array<{ name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number; product_id?: string }>,
      recentOrders: [] as Order[],
    };

    if (!filteredOrders || filteredOrders.length === 0) {
      return emptyStats;
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

    // Most profitable products - calculate profit based on cost_price
    const productProfits: Record<string, { 
      name: string; 
      quantity: number; 
      revenue: number; 
      cost: number; 
      profit: number;
      product_id?: string;
    }> = {};
    
    paidOrders.forEach(order => {
      const items = order.items as unknown as OrderItem[];
      if (Array.isArray(items)) {
        items.forEach(item => {
          const key = item.product_id || item.name || "Unknown";
          const qty = item.quantity || 1;
          const itemRevenue = (item.price || 0) * qty;
          
          // Get cost price from product map or from order item
          let itemCost = 0;
          if (item.product_id && productCostMap[item.product_id]) {
            itemCost = productCostMap[item.product_id].costPrice * qty;
          } else if (item.cost_price) {
            itemCost = item.cost_price * qty;
          }
          
          if (!productProfits[key]) {
            productProfits[key] = { 
              name: item.name || (item.product_id && productCostMap[item.product_id]?.name) || "Unknown",
              quantity: 0, 
              revenue: 0, 
              cost: 0, 
              profit: 0,
              product_id: item.product_id
            };
          }
          productProfits[key].quantity += qty;
          productProfits[key].revenue += itemRevenue;
          productProfits[key].cost += itemCost;
          productProfits[key].profit += (itemRevenue - itemCost);
        });
      }
    });
    
    const mostProfitableProducts = Object.values(productProfits)
      .filter(p => p.profit > 0) // Only show products with positive profit
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    // Low margin products (below 30% margin threshold)
    const LOW_MARGIN_THRESHOLD = 30;
    const lowMarginProducts = Object.values(productProfits)
      .filter(p => {
        if (p.revenue <= 0 || p.cost <= 0) return false; // Skip products without proper cost data
        const margin = (p.profit / p.revenue) * 100;
        return margin < LOW_MARGIN_THRESHOLD && margin >= 0; // Only positive but low margin
      })
      .map(p => ({
        ...p,
        margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => a.margin - b.margin) // Sort by lowest margin first
      .slice(0, 5);

    // Products with negative margin (loss-making)
    const negativeMarginProducts = Object.values(productProfits)
      .filter(p => p.profit < 0)
      .map(p => ({
        ...p,
        margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : -100,
      }))
      .sort((a, b) => a.margin - b.margin) // Sort by most negative first
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
      mostProfitableProducts,
      lowMarginProducts,
      negativeMarginProducts,
      recentOrders,
    };
  }, [filteredOrders, dateRangeDays, startDate, endDate, productCostMap]);

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
      ? `${format(startDate, "dd-MM-yyyy")} to ${format(endDate, "dd-MM-yyyy")}`
      : "All data";

    const headers = ["Date", "Order ID", "Customer Email", "Status", "Total ($)", "Item Count"];
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
        <StaleClaimsWidget onViewDisputes={() => onNavigateToTab?.("claims")} />
        <RecentOrdersWidget onNavigate={() => onNavigateToTab?.("orders")} />
        <DisputesWidget onNavigate={() => onNavigateToTab?.("claims")} />
        <ContactMessagesWidget onNavigate={() => onNavigateToTab?.("contact")} />
        <NewsletterSubscribersWidget onNavigate={() => onNavigateToTab?.("newsletter")} />
        <PerformanceMetricsWidget onNavigate={() => onNavigateToTab?.("performance")} />
        <BlogPostsWidget onNavigate={() => onNavigateToTab?.("blog")} />
        <SecurityIssuesWidget />
        <PackagingInventoryWidget 
          onNavigate={() => onNavigateToTab?.("packaging")} 
          onOpenCjConfig={() => {
            // Navigate to packaging tab and trigger CJ config dialog
            onNavigateToTab?.("packaging");
            // Dispatch custom event to open CJ config dialog
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-cj-config-dialog'));
            }, 100);
          }}
        />
        <CJWebhooksWidget onNavigate={() => onNavigateToTab?.("cj-webhooks")} />
        <CronJobsWidget />
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
                        name === "revenue" ? `$${value.toFixed(2)}` : value,
                        name === "revenue" ? "Revenue" : "Orders"
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

      {/* Profit Chart & Most Profitable Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit per Product Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Winst per Product
            </CardTitle>
            <CardDescription>Visualisatie van winst, omzet en kosten per product</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : stats.mostProfitableProducts.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.mostProfitableProducts.map(p => ({
                      name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
                      fullName: p.name,
                      Winst: p.profit / 100,
                      Omzet: p.revenue / 100,
                      Kosten: p.cost / 100,
                    }))}
                    layout="vertical"
                    margin={{ left: 20, right: 20, top: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                    <XAxis 
                      type="number" 
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `$${value.toFixed(0)}`}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      tick={{ fontSize: 11 }}
                      width={100}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      formatter={(value: number, name: string) => [
                        `$${value.toFixed(2)}`,
                        name
                      ]}
                      labelFormatter={(label, payload) => {
                        if (payload && payload[0]) {
                          return payload[0].payload.fullName;
                        }
                        return label;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Omzet" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Kosten" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Winst" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p>Nog geen winstgegevens beschikbaar.</p>
                  <p className="text-xs mt-1">Winst wordt berekend zodra er orders zijn met producten die een kostprijs hebben.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Profitable Products List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Meest Winstgevende Producten
            </CardTitle>
            <CardDescription>Top 5 producten gerangschikt op winst (omzet - kostprijs)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats.mostProfitableProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.mostProfitableProducts.map((product, index) => {
                  const marginPercent = product.revenue > 0 
                    ? ((product.profit / product.revenue) * 100).toFixed(0) 
                    : "0";
                  return (
                    <div 
                      key={product.name + index} 
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-primary w-8">
                          #{index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>{product.quantity}x verkocht</span>
                            <span>•</span>
                            <span>Omzet: {formatCurrency(product.revenue)}</span>
                            <span>•</span>
                            <span>Kosten: {formatCurrency(product.cost)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">
                          {formatCurrency(product.profit)}
                        </p>
                        <Badge variant="secondary" className="text-xs mt-1">
                          {marginPercent}% marge
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <p>Nog geen winstgegevens beschikbaar.</p>
                <p className="text-xs mt-1">Winst wordt berekend zodra er orders zijn met producten die een kostprijs hebben.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Margin Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Margin Products */}
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Lage Marge Producten
            </CardTitle>
            <CardDescription>Producten met een marge onder 30% die aandacht nodig hebben</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : stats.lowMarginProducts && Array.isArray(stats.lowMarginProducts) && stats.lowMarginProducts.length > 0 ? (
              <div className="space-y-3">
                {stats.lowMarginProducts.map((product, index) => (
                  <div 
                    key={product.name + index} 
                    className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900">
                        <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{product.quantity}x verkocht</span>
                          <span>•</span>
                          <span>Winst: {formatCurrency(product.profit)}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
                      {product.margin.toFixed(1)}% marge
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  💡 Tip: Overweeg prijsverhoging of zoek goedkopere leveranciers voor deze producten.
                </p>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                </div>
                <p className="font-medium text-green-600">Alle producten hebben gezonde marges!</p>
                <p className="text-xs mt-1">Geen producten met marge onder 30%.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Negative Margin Products (Loss-Making) */}
        <LossProductsCard 
          isLoading={isLoading} 
          products={stats.negativeMarginProducts} 
          formatCurrency={formatCurrency} 
        />
      </div>
    </div>
  );
};

// Extracted Loss Products Card component with email notification button
interface LossProductsCardProps {
  isLoading: boolean;
  products: Array<{
    name: string;
    quantity: number;
    profit: number;
    margin: number;
  }>;
  formatCurrency: (cents: number) => string;
}

const LossProductsCard = ({ isLoading, products, formatCurrency }: LossProductsCardProps) => {
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleSendNotification = async () => {
    setIsSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-loss-products');
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(`Email notificatie verstuurd voor ${data.products?.length || 0} product(en)`);
      } else {
        toast.info(data?.message || "Geen nieuwe verliesgevende producten om te melden");
      }
    } catch (error: any) {
      console.error("Error sending notification:", error);
      toast.error("Fout bij versturen notificatie: " + (error.message || "Onbekende fout"));
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-500" />
              Verliesgevende Producten
            </CardTitle>
            <CardDescription>Producten die verlies opleveren en directe actie vereisen</CardDescription>
          </div>
          {products && Array.isArray(products) && products.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendNotification}
              disabled={isSendingEmail}
              className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
            >
              {isSendingEmail ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Email Alert
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : products && Array.isArray(products) && products.length > 0 ? (
          <div className="space-y-3">
            {products.map((product, index) => (
              <div 
                key={product.name + index} 
                className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{product.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{product.quantity}x verkocht</span>
                      <span>•</span>
                      <span className="text-red-600 dark:text-red-400">Verlies: {formatCurrency(Math.abs(product.profit))}</span>
                    </div>
                  </div>
                </div>
                <Badge variant="destructive">
                  {product.margin.toFixed(1)}%
                </Badge>
              </div>
            ))}
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              ⚠️ Deze producten kosten meer dan ze opbrengen. Verhoog de prijs of stop met verkopen.
            </p>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <div className="flex justify-center mb-2">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="font-medium text-green-600">Geen verliesgevende producten!</p>
            <p className="text-xs mt-1">Alle verkochte producten zijn winstgevend.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
