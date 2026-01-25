import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Package, Search, Eye, RefreshCw, ExternalLink, Download, Truck, Warehouse } from "lucide-react";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh-container";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { safeString, safeNumber, safeCurrency } from "@/lib/safe-render";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image_url?: string;
}

interface ShippingAddress {
  name?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
}

interface CJShippingInfo {
  trackingNumber?: string;
  logisticName?: string;
  status?: string;
  warehouse?: string;
  warehouseName?: string;
  logisticPrice?: number;
  estimatedDays?: number;
  optimizationScore?: number;
  details?: Array<{
    date: string;
    status: string;
    description: string;
  }>;
  lastUpdated?: string;
}

interface Order {
  id: string;
  user_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  total_amount: number;
  currency: string;
  customer_email: string | null;
  shipping_address: ShippingAddress | null;
  items: OrderItem[];
  tracking_number: string | null;
  tracking_carrier: string | null;
  cj_order_id: string | null;
  cj_order_status: string | null;
  cj_shipping_info: CJShippingInfo | null;
  created_at: string;
  updated_at: string;
}

const CARRIER_TRACKING_URLS: Record<string, string> = {
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  ups: "https://www.ups.com/track?tracknum=",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=",
  dhl: "https://www.dhl.com/us-en/home/tracking.html?tracking-id=",
  ontrac: "https://www.ontrac.com/tracking/?number=",
  lasership: "https://www.lasership.com/track/",
  cjpacket: "https://track.yw56.com.cn/cn/querydel?nums=",
  chinapost: "https://track.yw56.com.cn/cn/querydel?nums=",
  yuntrack: "https://www.yuntrack.com/Track/Detail?",
  "4px": "https://track.4px.com/#/result/0/",
  other: "",
};

const CJ_STATUS_LABELS: Record<string, string> = {
  CREATED: "Aangemaakt",
  PENDING: "In afwachting",
  AWAITING_PAYMENT: "Wacht op betaling",
  IN_CART: "In winkelwagen",
  UNSHIPPED: "Nog niet verzonden",
  SHIPPED: "Verzonden",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
  ON_HOLD: "In wacht",
};

const CARRIER_LABELS: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  ontrac: "OnTrac",
  lasership: "LaserShip",
  cjpacket: "CJ Packet",
  chinapost: "China Post",
  yuntrack: "Yuntrack",
  "4px": "4PX",
  postnl: "PostNL",
  dpd: "DPD",
  other: "Anders",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  paid: "bg-green-500/10 text-green-600 border-green-500/20",
  processing: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  shipped: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
  refunded: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  failed: "bg-red-500/10 text-red-600 border-red-500/20",
  expired: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "In afwachting",
  paid: "Betaald",
  processing: "In behandeling",
  shipped: "Verzonden",
  delivered: "Geleverd",
  cancelled: "Geannuleerd",
  refunded: "Terugbetaald",
  failed: "Mislukt",
  expired: "Verlopen",
};

// Virtualized orders table component
function VirtualizedOrdersTable({
  orders,
  onOpenDetails,
  onUpdateStatus,
  formatCurrency,
}: {
  orders: Order[];
  onOpenDetails: (order: Order) => void;
  onUpdateStatus: (orderId: string, status: string) => void;
  formatCurrency: (amount: number, currency: string) => string;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Geen bestellingen gevonden.</p>
      </div>
    );
  }

  // Helper to get warehouse display info
  const getWarehouseInfo = (order: Order) => {
    const shippingInfo = order.cj_shipping_info;
    if (!shippingInfo?.warehouse) return null;
    
    return {
      code: shippingInfo.warehouse,
      name: shippingInfo.warehouseName || shippingInfo.warehouse,
      logistic: shippingInfo.logisticName,
      days: shippingInfo.estimatedDays,
    };
  };

  return (
    <div className="rounded-md border">
      {/* Header */}
      <div className="flex border-b bg-muted/50">
        <div className="w-24 px-4 py-3 text-sm font-medium text-muted-foreground">Order ID</div>
        <div className="w-32 px-4 py-3 text-sm font-medium text-muted-foreground">Datum</div>
        <div className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground">Klant</div>
        <div className="w-36 px-4 py-3 text-sm font-medium text-muted-foreground">Status</div>
        <div className="w-32 px-4 py-3 text-sm font-medium text-muted-foreground">CJ Warehouse</div>
        <div className="w-24 px-4 py-3 text-sm font-medium text-muted-foreground text-right">Bedrag</div>
        <div className="w-20 px-4 py-3 text-sm font-medium text-muted-foreground text-right">Acties</div>
      </div>

      {/* Virtualized Body */}
      <div
        ref={parentRef}
        style={{ maxHeight: 500, overflow: 'auto' }}
        className="relative"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const order = orders[virtualRow.index];
            const warehouseInfo = getWarehouseInfo(order);

            return (
              <div
                key={order.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex border-b hover:bg-muted/50 transition-colors"
              >
                <div className="w-24 px-4 py-4 text-xs font-mono flex items-center">
                  {order.id.slice(0, 8)}...
                </div>
                <div className="w-32 px-4 py-4 text-sm flex items-center">
                  {order.created_at ? format(new Date(order.created_at), "d MMM HH:mm", { locale: nl }) : '-'}
                </div>
                <div className="flex-1 px-4 py-4 text-sm truncate flex items-center">
                  {safeString(order.customer_email) || "Onbekend"}
                </div>
                <div className="w-36 px-4 py-2 flex items-center">
                  <Select
                    value={order.status}
                    onValueChange={(status) => onUpdateStatus(order.id, status)}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <Badge 
                        variant="outline" 
                        className={STATUS_COLORS[order.status] || STATUS_COLORS.pending}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-lg z-50">
                      <SelectItem value="pending">In afwachting</SelectItem>
                      <SelectItem value="paid">Betaald</SelectItem>
                      <SelectItem value="processing">In behandeling</SelectItem>
                      <SelectItem value="shipped">Verzonden</SelectItem>
                      <SelectItem value="delivered">Geleverd</SelectItem>
                      <SelectItem value="cancelled">Geannuleerd</SelectItem>
                      <SelectItem value="refunded">Terugbetaald</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 px-4 py-4 flex items-center">
                  {warehouseInfo ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <Warehouse className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium">{warehouseInfo.code}</span>
                      </div>
                      {warehouseInfo.logistic && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={warehouseInfo.logistic}>
                          {warehouseInfo.logistic}
                        </span>
                      )}
                    </div>
                  ) : order.cj_order_id ? (
                    <span className="text-xs text-muted-foreground">-</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">N/A</span>
                  )}
                </div>
                <div className="w-24 px-4 py-4 text-sm font-medium text-right flex items-center justify-end">
                  {formatCurrency(safeNumber(order.total_amount), safeString(order.currency) || 'eur')}
                </div>
                <div className="w-20 px-4 py-4 flex items-center justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenDetails(order)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function OrdersManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch orders
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Transform the data to match our Order type
      return (data || []).map((order) => ({
        ...order,
        items: (order.items as unknown as OrderItem[]) || [],
        shipping_address: order.shipping_address as unknown as ShippingAddress | null,
        cj_shipping_info: order.cj_shipping_info as unknown as CJShippingInfo | null,
      })) as Order[];
    },
  });

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", orderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order status bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error) => {
      toast.error(`Fout bij bijwerken: ${error.message}`);
    },
  });

  // Update tracking info mutation
  const updateTrackingMutation = useMutation({
    mutationFn: async ({ 
      orderId, 
      trackingNumber, 
      trackingCarrier 
    }: { 
      orderId: string; 
      trackingNumber: string; 
      trackingCarrier: string;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ 
          tracking_number: trackingNumber || null,
          tracking_carrier: trackingCarrier,
          status: trackingNumber ? "shipped" : undefined,
          updated_at: new Date().toISOString() 
        })
        .eq("id", orderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tracking informatie bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error) => {
      toast.error(`Fout bij bijwerken: ${error.message}`);
    },
  });

  // Sync CJ tracking mutation
  const syncCJTrackingMutation = useMutation({
    mutationFn: async (orderId?: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Niet ingelogd");
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-cj-tracking`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(orderId ? { orderId } : {}),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Sync mislukt");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast.success(`${data.synced}/${data.total} orders gesynchroniseerd`);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error) => {
      toast.error(`Sync fout: ${error.message}`);
    },
  });

  // Filter orders
  const filteredOrders = orders?.filter((order) => {
    // Status filter
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }
    
    // Search filter
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      const matchesEmail = order.customer_email?.toLowerCase().includes(search);
      const matchesId = order.id.toLowerCase().includes(search);
      const matchesStripeId = order.stripe_session_id?.toLowerCase().includes(search) ||
                              order.stripe_payment_intent_id?.toLowerCase().includes(search);
      if (!matchesEmail && !matchesId && !matchesStripeId) {
        return false;
      }
    }
    
    return true;
  }) || [];

  const openOrderDetails = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredOrders.length) {
      toast.error("Geen orders om te exporteren");
      return;
    }

    // CSV headers
    const headers = [
      "Order ID",
      "Datum",
      "Status",
      "Klant Email",
      "Naam",
      "Adres",
      "Postcode",
      "Stad",
      "Land",
      "Producten",
      "Aantal Items",
      "Subtotaal",
      "Valuta",
      "Stripe Payment Intent",
      "Stripe Session ID",
    ];

    // CSV rows
    const rows = filteredOrders.map((order) => {
      const itemsSummary = order.items
        ?.map((item) => `${item.name} (x${item.quantity})`)
        .join("; ") || "";
      const totalItems = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      
      return [
        order.id,
        format(new Date(order.created_at), "yyyy-MM-dd HH:mm:ss"),
        STATUS_LABELS[order.status] || order.status,
        order.customer_email || "",
        order.shipping_address?.name || "",
        order.shipping_address?.address || "",
        order.shipping_address?.postal_code || "",
        order.shipping_address?.city || "",
        order.shipping_address?.country || "",
        itemsSummary,
        totalItems.toString(),
        Number(order.total_amount).toFixed(2),
        order.currency.toUpperCase(),
        order.stripe_payment_intent_id || "",
        order.stripe_session_id || "",
      ];
    });

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Build CSV content
    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Add BOM for Excel compatibility with UTF-8
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `orders-export-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`${filteredOrders.length} orders geëxporteerd naar CSV`);
  };

  // Calculate stats
  const stats = {
    total: orders?.length || 0,
    pending: orders?.filter(o => o.status === "pending").length || 0,
    paid: orders?.filter(o => o.status === "paid").length || 0,
    processing: orders?.filter(o => o.status === "processing").length || 0,
    shipped: orders?.filter(o => o.status === "shipped").length || 0,
    revenue: orders
      ?.filter(o => ["paid", "processing", "shipped", "delivered"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total_amount), 0) || 0,
  };
  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <PullToRefreshContainer onRefresh={handleRefresh} className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Totaal orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">In afwachting</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">Betaald</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            <p className="text-xs text-muted-foreground">In behandeling</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{stats.shipped}</div>
            <p className="text-xs text-muted-foreground">Verzonden</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(stats.revenue, "eur")}
            </div>
            <p className="text-xs text-muted-foreground">Omzet</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Bestellingen
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => syncCJTrackingMutation.mutate(undefined)}
                disabled={syncCJTrackingMutation.isPending}
              >
                <Truck className="w-4 h-4 mr-2" />
                {syncCJTrackingMutation.isPending ? "Syncing..." : "Sync CJ"}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToCSV}
                disabled={filteredOrders.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Ververs
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op e-mail, order ID of Stripe ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter op status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="pending">In afwachting</SelectItem>
                <SelectItem value="paid">Betaald</SelectItem>
                <SelectItem value="processing">In behandeling</SelectItem>
                <SelectItem value="shipped">Verzonden</SelectItem>
                <SelectItem value="delivered">Geleverd</SelectItem>
                <SelectItem value="cancelled">Geannuleerd</SelectItem>
                <SelectItem value="refunded">Terugbetaald</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <TableSkeleton 
              columns={6} 
              rows={8} 
              headerWidths={["w-24", "w-32", "w-40", "w-24", "w-20", "w-20"]}
              cellWidths={["w-20", "w-28", "w-36", "w-20", "w-16", "w-24"]}
            />
          ) : filteredOrders.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== "all"
                  ? "Geen bestellingen gevonden met deze filters."
                  : "Nog geen bestellingen."}
              </p>
            </div>
          ) : (
            <VirtualizedOrdersTable
              orders={filteredOrders}
              onOpenDetails={openOrderDetails}
              onUpdateStatus={(orderId, status) => updateStatusMutation.mutate({ orderId, status })}
              formatCurrency={formatCurrency}
            />
          )}
        </CardContent>
      </Card>

      {/* Order Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Order ID</p>
                  <p className="font-mono text-sm">{selectedOrder.id}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge 
                    variant="outline" 
                    className={STATUS_COLORS[selectedOrder.status] || STATUS_COLORS.pending}
                  >
                    {STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Datum</p>
                  <p>{format(new Date(selectedOrder.created_at), "d MMMM yyyy HH:mm", { locale: nl })}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Totaal</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(safeNumber(selectedOrder.total_amount), safeString(selectedOrder.currency) || 'eur')}
                  </p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Klantgegevens</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">E-mail</p>
                    <p>{safeString(selectedOrder.customer_email) || "Onbekend"}</p>
                  </div>
                  {selectedOrder.shipping_address && (
                    <div>
                      <p className="text-muted-foreground">Verzendadres</p>
                      <p>{safeString(selectedOrder.shipping_address.name)}</p>
                      <p>{safeString(selectedOrder.shipping_address.address)}</p>
                      <p>{safeString(selectedOrder.shipping_address.postal_code)} {safeString(selectedOrder.shipping_address.city)}</p>
                      <p>{safeString(selectedOrder.shipping_address.country)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Producten ({selectedOrder.items?.length || 0})</h4>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      {item.image_url && (
                        <img 
                          src={item.image_url} 
                          alt={item.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-sm">{safeString(item.name)}</p>
                        <p className="text-xs text-muted-foreground">
                          Aantal: {safeNumber(item.quantity)}
                        </p>
                      </div>
                      <p className="font-medium">
                        {formatCurrency(safeNumber(item.price) * safeNumber(item.quantity), safeString(selectedOrder.currency) || 'eur')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tracking Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Track & Trace
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Vervoerder</label>
                    <Select
                      value={selectedOrder.tracking_carrier || "postnl"}
                      onValueChange={(carrier) => 
                        updateTrackingMutation.mutate({
                          orderId: selectedOrder.id,
                          trackingNumber: selectedOrder.tracking_number || "",
                          trackingCarrier: carrier,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="postnl">PostNL</SelectItem>
                        <SelectItem value="dhl">DHL</SelectItem>
                        <SelectItem value="ups">UPS</SelectItem>
                        <SelectItem value="fedex">FedEx</SelectItem>
                        <SelectItem value="dpd">DPD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Tracking Nummer</label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Voer tracking nummer in..."
                        defaultValue={selectedOrder.tracking_number || ""}
                        onBlur={(e) => {
                          if (e.target.value !== selectedOrder.tracking_number) {
                            updateTrackingMutation.mutate({
                              orderId: selectedOrder.id,
                              trackingNumber: e.target.value,
                              trackingCarrier: selectedOrder.tracking_carrier || "postnl",
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const target = e.target as HTMLInputElement;
                            updateTrackingMutation.mutate({
                              orderId: selectedOrder.id,
                              trackingNumber: target.value,
                              trackingCarrier: selectedOrder.tracking_carrier || "postnl",
                            });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
                {selectedOrder.tracking_number && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          {CARRIER_LABELS[selectedOrder.tracking_carrier || "postnl"]}
                        </span>
                        <code className="text-xs bg-background px-2 py-1 rounded">
                          {selectedOrder.tracking_number}
                        </code>
                      </div>
                      <a
                        href={`${CARRIER_TRACKING_URLS[selectedOrder.tracking_carrier || "postnl"]}${selectedOrder.tracking_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm flex items-center gap-1"
                      >
                        Volg zending
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* CJ Dropshipping Info */}
              {selectedOrder.cj_order_id && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      CJ Dropshipping
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncCJTrackingMutation.mutate(selectedOrder.id)}
                      disabled={syncCJTrackingMutation.isPending}
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${syncCJTrackingMutation.isPending ? 'animate-spin' : ''}`} />
                      Sync
                    </Button>
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">CJ Order ID</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{safeString(selectedOrder.cj_order_id)}</code>
                      </div>
                      <div>
                        <p className="text-muted-foreground">CJ Status</p>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                          {CJ_STATUS_LABELS[safeString(selectedOrder.cj_order_status)] || safeString(selectedOrder.cj_order_status) || "Onbekend"}
                        </Badge>
                      </div>
                    </div>

                    {/* CJ Shipping Details */}
                    {selectedOrder.cj_shipping_info && (
                      <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                        {/* Warehouse Info */}
                        {selectedOrder.cj_shipping_info.warehouse && (
                          <div className="flex items-center gap-2 pb-2 border-b">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                              {selectedOrder.cj_shipping_info.warehouse}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                Warehouse: {safeString(selectedOrder.cj_shipping_info.warehouseName) || selectedOrder.cj_shipping_info.warehouse}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {selectedOrder.cj_shipping_info.estimatedDays && (
                                  <span>~{selectedOrder.cj_shipping_info.estimatedDays} dagen</span>
                                )}
                                {selectedOrder.cj_shipping_info.logisticPrice && (
                                  <span>• ${selectedOrder.cj_shipping_info.logisticPrice.toFixed(2)}</span>
                                )}
                                {selectedOrder.cj_shipping_info.optimizationScore !== undefined && (
                                  <Badge variant="secondary" className="text-xs">
                                    Score: {(selectedOrder.cj_shipping_info.optimizationScore * 100).toFixed(0)}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">
                              {safeString(selectedOrder.cj_shipping_info.logisticName) || "Verzending"}
                            </span>
                            {selectedOrder.cj_shipping_info.trackingNumber && (
                              <code className="text-xs bg-background px-2 py-1 rounded">
                                {safeString(selectedOrder.cj_shipping_info.trackingNumber)}
                              </code>
                            )}
                          </div>
                          {selectedOrder.cj_shipping_info.status && (
                            <Badge variant="outline" className="text-xs">
                              {safeString(selectedOrder.cj_shipping_info.status)}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Tracking timeline */}
                        {selectedOrder.cj_shipping_info.details && selectedOrder.cj_shipping_info.details.length > 0 && (
                          <div className="mt-3 pt-3 border-t space-y-2 max-h-40 overflow-y-auto">
                            <p className="text-xs text-muted-foreground font-medium">Tracking historie</p>
                            {selectedOrder.cj_shipping_info.details.slice(0, 5).map((detail, index) => (
                              <div key={index} className="text-xs flex gap-2">
                                <span className="text-muted-foreground shrink-0">{safeString(detail.date)}</span>
                                <span>{safeString(detail.description) || safeString(detail.status)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {selectedOrder.cj_shipping_info.lastUpdated && (
                          <p className="text-xs text-muted-foreground pt-2">
                            Laatst bijgewerkt: {new Date(selectedOrder.cj_shipping_info.lastUpdated).toLocaleString("nl-NL")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stripe Info */}
              {(selectedOrder.stripe_session_id || selectedOrder.stripe_payment_intent_id) && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Stripe Gegevens</h4>
                  <div className="space-y-2 text-sm">
                    {selectedOrder.stripe_session_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Session ID:</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {selectedOrder.stripe_session_id}
                        </code>
                        <a
                          href={`https://dashboard.stripe.com/payments/${selectedOrder.stripe_payment_intent_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                    {selectedOrder.stripe_payment_intent_id && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Payment Intent:</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {selectedOrder.stripe_payment_intent_id}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PullToRefreshContainer>
  );
}
