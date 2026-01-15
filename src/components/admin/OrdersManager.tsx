import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Package, Search, Eye, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

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
  created_at: string;
  updated_at: string;
}

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

  return (
    <div className="space-y-6">
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
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Bestellingen
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Ververs
            </Button>
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
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Bestellingen laden...</p>
            </div>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Klant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Bedrag</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-xs">
                        {order.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        {format(new Date(order.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate">
                          {order.customer_email || "Onbekend"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(status) => 
                            updateStatusMutation.mutate({ orderId: order.id, status })
                          }
                        >
                          <SelectTrigger className="w-36 h-8">
                            <Badge 
                              variant="outline" 
                              className={STATUS_COLORS[order.status] || STATUS_COLORS.pending}
                            >
                              {STATUS_LABELS[order.status] || order.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">In afwachting</SelectItem>
                            <SelectItem value="paid">Betaald</SelectItem>
                            <SelectItem value="processing">In behandeling</SelectItem>
                            <SelectItem value="shipped">Verzonden</SelectItem>
                            <SelectItem value="delivered">Geleverd</SelectItem>
                            <SelectItem value="cancelled">Geannuleerd</SelectItem>
                            <SelectItem value="refunded">Terugbetaald</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(order.total_amount), order.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openOrderDetails(order)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
                    {formatCurrency(Number(selectedOrder.total_amount), selectedOrder.currency)}
                  </p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Klantgegevens</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">E-mail</p>
                    <p>{selectedOrder.customer_email || "Onbekend"}</p>
                  </div>
                  {selectedOrder.shipping_address && (
                    <div>
                      <p className="text-muted-foreground">Verzendadres</p>
                      <p>{selectedOrder.shipping_address.name}</p>
                      <p>{selectedOrder.shipping_address.address}</p>
                      <p>{selectedOrder.shipping_address.postal_code} {selectedOrder.shipping_address.city}</p>
                      <p>{selectedOrder.shipping_address.country}</p>
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
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Aantal: {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium">
                        {formatCurrency(item.price * item.quantity, selectedOrder.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

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
    </div>
  );
}
