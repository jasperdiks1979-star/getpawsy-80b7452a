import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { Package, ChevronRight, ShoppingBag, Loader2, Truck, ExternalLink } from "lucide-react";
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

const Orders = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

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
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Mijn Bestellingen</h1>
              <p className="text-muted-foreground mt-1">
                Bekijk je eerdere bestellingen en hun status
              </p>
            </div>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Package className="w-4 h-4 mr-2" />
              {orders?.length || 0} bestellingen
            </Badge>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <Skeleton className="w-16 h-16 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : orders && orders.length > 0 ? (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="p-6">
                      {/* Order Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-muted-foreground">Order</span>
                            <span className="font-mono text-sm font-medium">
                              #{order.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(order.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={STATUS_COLORS[order.status] || STATUS_COLORS.pending}
                          >
                            {STATUS_LABELS[order.status] || order.status}
                          </Badge>
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
                            {order.items.reduce((sum, item) => sum + item.quantity, 0)} artikel(en)
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
                            className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors group"
                          >
                            <Truck className="w-5 h-5 text-primary" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Volg je zending</p>
                              <p className="text-xs text-muted-foreground">
                                {CARRIER_LABELS[order.tracking_carrier || "postnl"]} • {order.tracking_number}
                              </p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </div>
                      )}

                      {/* Shipping Address (if available and no tracking) */}
                      {!order.tracking_number && order.shipping_address && order.shipping_address.city && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            Verzonden naar: {order.shipping_address.city}, {order.shipping_address.country}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <ShoppingBag className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Nog geen bestellingen</h2>
                <p className="text-muted-foreground mb-6">
                  Je hebt nog geen bestellingen geplaatst. Ontdek onze producten!
                </p>
                <Button asChild>
                  <Link to="/products">
                    Bekijk Producten
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
