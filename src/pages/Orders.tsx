import { useEffect, memo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Package, ChevronRight, ShoppingBag, Truck, ExternalLink, AlertCircle } from "lucide-react";
import OrderClaimButton from "@/components/orders/OrderClaimButton";
import { format } from "date-fns";
import { getConversionFlag } from "@/lib/conversionFlags";

// Order card skeleton component
const OrderCardSkeleton = memo(() => (
  <Card className="overflow-hidden">
    <CardContent className="p-0">
      <div className="p-6">
        {/* Order Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16" />
          </div>
        </div>

        {/* Order Items Preview */}
        <div className="flex items-center gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="w-16 h-16 rounded-lg shrink-0" />
          ))}
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-full max-w-[200px]" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>

        {/* Tracking placeholder */}
        <div className="mt-4 pt-4 border-t">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </CardContent>
  </Card>
));
OrderCardSkeleton.displayName = 'OrderCardSkeleton';

const OrdersPageSkeleton = memo(() => (
  <div className="container mx-auto px-4 py-8">
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>

      {/* Order cards */}
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  </div>
));
OrdersPageSkeleton.displayName = 'OrdersPageSkeleton';

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
  status: string;
  total_amount: number;
  currency: string;
  items: OrderItem[];
  shipping_address: ShippingAddress | null;
  tracking_number: string | null;
  tracking_carrier: string | null;
  created_at: string;
}

const CARRIER_TRACKING_URLS: Record<string, string> = {
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=",
  ups: "https://www.ups.com/track?tracknum=",
  fedex: "https://www.fedex.com/fedextrack/?trknbr=",
  dhl: "https://www.dhl.com/us-en/home/tracking.html?tracking-id=",
  ontrac: "https://www.ontrac.com/tracking/?number=",
  lasership: "https://www.lasership.com/track/",
};

const CARRIER_LABELS: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  ontrac: "OnTrac",
  lasership: "LaserShip",
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
  pending: "Pending",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
  expired: "Expired",
};

const Orders = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const premiumV1 = getConversionFlag('premiumOrders');

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  // Fetch user's orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["user-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_amount, currency, items, shipping_address, tracking_number, tracking_carrier, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((order) => ({
        ...order,
        items: (order.items as unknown as OrderItem[]) || [],
        shipping_address: order.shipping_address as unknown as ShippingAddress | null,
      })) as Order[];
    },
    enabled: !!user,
  });

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  if (authLoading) {
    return (
      <Layout>
        <OrdersPageSkeleton />
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              {premiumV1 && (
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-1">
                  Account · Orders
                </p>
              )}
              <h1 className={premiumV1 ? "font-display text-3xl font-semibold text-foreground tracking-tight" : "text-3xl font-bold text-foreground"}>
                {premiumV1 ? "Your orders" : "My Orders"}
              </h1>
              <p className="text-muted-foreground mt-1">
                {premiumV1 ? "Review past orders and track shipments." : "View your previous orders and their status"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/my-claims">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  My Claims
                </Link>
              </Button>
              {premiumV1 ? (
                <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground border border-border/60 rounded-full px-3 py-1.5">
                  <Package className="w-3.5 h-3.5" />
                  {orders?.length || 0} {(orders?.length || 0) === 1 ? 'order' : 'orders'}
                </span>
              ) : (
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <Package className="w-4 h-4 mr-2" />
                  {orders?.length || 0} orders
                </Badge>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <OrderCardSkeleton key={i} />
              ))}
            </div>
          ) : orders && orders.length > 0 ? (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card
                  key={order.id}
                  className={
                    premiumV1
                      ? "overflow-hidden border-border/60 shadow-none"
                      : "overflow-hidden hover:shadow-md transition-shadow"
                  }
                >
                  <CardContent className="p-0">
                    <div className="p-6">
                      {/* Order Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div>
                          {premiumV1 ? (
                            <>
                              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-1">
                                Order
                              </p>
                              <p className="font-mono text-sm font-medium text-foreground">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </p>
                            </>
                          ) : (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-muted-foreground">Order</span>
                              <span className="font-mono text-sm font-medium">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(order.created_at), "MMMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {premiumV1 ? (
                            <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground border border-border/60 rounded-full px-2.5 py-1">
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className={STATUS_COLORS[order.status] || STATUS_COLORS.pending}
                            >
                              {STATUS_LABELS[order.status] || order.status}
                            </Badge>
                          )}
                          <span className="text-lg font-bold text-primary">
                            {formatCurrency(Number(order.total_amount), order.currency)}
                          </span>
                        </div>
                      </div>

                      {/* Order Items Preview */}
                      <div className="flex items-center gap-3 overflow-x-auto pb-2">
                        {order.items.slice(0, 4).map((item, index) => (
                          <div
                            key={index}
                            className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted"
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                            {item.quantity > 1 && (
                              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-medium rounded-full w-5 h-5 flex items-center justify-center">
                                {item.quantity}
                              </span>
                            )}
                          </div>
                        ))}
                        {order.items.length > 4 && (
                          <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              +{order.items.length - 4}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground truncate">
                            {order.items.map((item) => item.name).join(", ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)
                          </p>
                        </div>
                      </div>

                      {/* Tracking Info */}
                      {order.tracking_number && (
                        <div className="mt-4 pt-4 border-t">
                          <a
                            href={`${CARRIER_TRACKING_URLS[order.tracking_carrier || "postnl"]}${order.tracking_number}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              premiumV1
                                ? "flex items-center gap-2 p-3 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors group"
                                : "flex items-center gap-2 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors group"
                            }
                          >
                            <Truck className={premiumV1 ? "w-5 h-5 text-muted-foreground" : "w-5 h-5 text-primary"} />
                            <div className="flex-1">
                              {premiumV1 && (
                                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
                                  Tracking
                                </p>
                              )}
                              <p className="text-sm font-medium">{premiumV1 ? "Track your shipment" : "Track your shipment"}</p>
                              <p className="text-xs text-muted-foreground">
                                {CARRIER_LABELS[order.tracking_carrier || "usps"]} • {order.tracking_number}
                              </p>
                            </div>
                            <ExternalLink className={premiumV1 ? "w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" : "w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity"} />
                          </a>
                        </div>
                      )}

                      {/* Shipping Address (if available and no tracking) */}
                      {!order.tracking_number && order.shipping_address && order.shipping_address.city && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            Shipped to: {order.shipping_address.city}, {order.shipping_address.country}
                          </p>
                        </div>
                      )}

                      {/* Report Issue / Claim Button */}
                      <div className="mt-4 pt-4 border-t flex justify-end">
                        <OrderClaimButton 
                          orderId={order.id} 
                          orderEmail={user?.email || ""} 
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className={premiumV1 ? "border-border/60 shadow-none" : undefined}>
              <CardContent className="py-16 text-center">
                {premiumV1 ? (
                  <div className="mx-auto mb-5 inline-flex items-center justify-center w-14 h-14 rounded-full border border-border/60">
                    <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                  </div>
                ) : (
                  <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                )}
                {premiumV1 && (
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-2">
                    No orders yet
                  </p>
                )}
                <h2 className={premiumV1 ? "font-display text-xl font-semibold mb-2 tracking-tight" : "text-xl font-semibold mb-2"}>
                  {premiumV1 ? "Your story starts here" : "No orders yet"}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {premiumV1
                    ? "Browse the catalog to find something your pet will love."
                    : "You haven't placed any orders yet. Discover our products!"}
                </p>
                <Button asChild>
                  <Link to="/products">
                    Browse Products
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Orders;
