import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Mail,
  CheckCircle,
  Clock,
  Search,
  RefreshCw,
  Package,
  Users,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface AbandonedCart {
  id: string;
  session_id: string;
  customer_email: string | null;
  cart_items: CartItem[];
  cart_total: number;
  reminder_sent_at: string | null;
  reminder_count: number;
  recovered_at: string | null;
  created_at: string;
  updated_at: string;
}

const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  color = 'primary' 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color?: 'primary' | 'green' | 'amber' | 'red';
}) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {trend && (
              <div className={`flex items-center gap-1 mt-2 text-xs ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
                <TrendingUp className={`w-3 h-3 ${!trend.positive && 'rotate-180'}`} />
                <span>{trend.positive ? '+' : ''}{trend.value}%</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AbandonedCartsManager = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: abandonedCarts, isLoading, refetch } = useQuery({
    queryKey: ['admin-abandoned-carts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abandoned_carts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      // Parse cart_items from JSON and map to correct types
      return (data || []).map(cart => {
        const cartItems = Array.isArray(cart.cart_items) 
          ? (cart.cart_items as unknown[]).map((item: unknown) => {
              const i = item as Record<string, unknown>;
              return {
                id: String(i.id || ''),
                name: String(i.name || ''),
                price: Number(i.price || 0),
                quantity: Number(i.quantity || 1),
                image: i.image ? String(i.image) : undefined,
              };
            })
          : [];
        return {
          id: cart.id,
          session_id: cart.session_id,
          customer_email: cart.customer_email,
          cart_items: cartItems,
          cart_total: cart.cart_total,
          reminder_sent_at: cart.reminder_sent_at,
          reminder_count: cart.reminder_count,
          recovered_at: cart.recovered_at,
          created_at: cart.created_at,
          updated_at: cart.updated_at,
        } as AbandonedCart;
      });
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    if (!abandonedCarts || abandonedCarts.length === 0) {
      return {
        totalCarts: 0,
        recoveredCarts: 0,
        recoveryRate: 0,
        totalAbandonedValue: 0,
        recoveredValue: 0,
        lostValue: 0,
        emailsSent: 0,
        cartsWithEmail: 0,
        avgCartValue: 0,
      };
    }

    const recoveredCarts = abandonedCarts.filter(c => c.recovered_at !== null);
    const notRecovered = abandonedCarts.filter(c => c.recovered_at === null);
    const cartsWithEmail = abandonedCarts.filter(c => c.customer_email !== null);
    const emailsSent = abandonedCarts.reduce((sum, c) => sum + c.reminder_count, 0);

    const totalValue = abandonedCarts.reduce((sum, c) => sum + c.cart_total, 0);
    const recoveredValue = recoveredCarts.reduce((sum, c) => sum + c.cart_total, 0);
    const lostValue = notRecovered.reduce((sum, c) => sum + c.cart_total, 0);

    return {
      totalCarts: abandonedCarts.length,
      recoveredCarts: recoveredCarts.length,
      recoveryRate: abandonedCarts.length > 0 
        ? Math.round((recoveredCarts.length / abandonedCarts.length) * 100) 
        : 0,
      totalAbandonedValue: totalValue,
      recoveredValue: recoveredValue,
      lostValue: lostValue,
      emailsSent: emailsSent,
      cartsWithEmail: cartsWithEmail.length,
      avgCartValue: abandonedCarts.length > 0 
        ? totalValue / abandonedCarts.length 
        : 0,
    };
  }, [abandonedCarts]);

  // Filter carts by search
  const filteredCarts = useMemo(() => {
    if (!abandonedCarts) return [];
    if (!searchQuery.trim()) return abandonedCarts;

    const query = searchQuery.toLowerCase();
    return abandonedCarts.filter(cart => 
      cart.customer_email?.toLowerCase().includes(query) ||
      cart.session_id.toLowerCase().includes(query) ||
      cart.cart_items.some(item => item.name.toLowerCase().includes(query))
    );
  }, [abandonedCarts, searchQuery]);

  const getStatusBadge = (cart: AbandonedCart) => {
    if (cart.recovered_at) {
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="w-3 h-3 mr-1" />
          Recovered
        </Badge>
      );
    }
    if (cart.reminder_count > 0) {
      return (
        <Badge variant="secondary">
          <Mail className="w-3 h-3 mr-1" />
          {cart.reminder_count}x Reminded
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-amber-600 border-amber-300">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Abandoned Carts"
          value={stats.totalCarts}
          subtitle={`${stats.cartsWithEmail} with email`}
          icon={ShoppingCart}
          color="amber"
        />
        <StatCard
          title="Recovery Rate"
          value={`${stats.recoveryRate}%`}
          subtitle={`${stats.recoveredCarts} carts recovered`}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Recovered Revenue"
          value={`€${stats.recoveredValue.toFixed(2)}`}
          subtitle={`of €${stats.totalAbandonedValue.toFixed(2)} total`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Reminder Emails Sent"
          value={stats.emailsSent}
          subtitle={`Avg cart: €${stats.avgCartValue.toFixed(2)}`}
          icon={Mail}
          color="primary"
        />
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recovered Revenue</p>
                <p className="text-xl font-bold text-green-600">€{stats.recoveredValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Recovery</p>
                <p className="text-xl font-bold text-amber-600">€{stats.lostValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Carts with Email</p>
                <p className="text-xl font-bold">{stats.cartsWithEmail} / {stats.totalCarts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abandoned Carts Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Abandoned Carts
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or product..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCarts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No carts match your search' : 'No abandoned carts yet'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCarts.slice(0, 50).map((cart) => {
                    const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
                    return (
                      <TableRow key={cart.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {cart.customer_email || (
                                <span className="text-muted-foreground italic">No email</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {cart.session_id.slice(0, 20)}...
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {items.slice(0, 3).map((item, i) => (
                              item.image && (
                                <img
                                  key={i}
                                  src={item.image}
                                  alt={item.name}
                                  className="w-8 h-8 rounded object-cover"
                                />
                              )
                            ))}
                            <span className="text-sm text-muted-foreground">
                              {items.length} item{items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          €{cart.cart_total.toFixed(2)}
                        </TableCell>
                        <TableCell>{getStatusBadge(cart)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">
                              {format(new Date(cart.created_at), 'dd MMM yyyy', { locale: nl })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(cart.created_at), { 
                                addSuffix: true,
                                locale: nl 
                              })}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {filteredCarts.length > 50 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing 50 of {filteredCarts.length} carts
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AbandonedCartsManager;
