import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Bell, 
  Search, 
  Trash2, 
  Mail, 
  Package, 
  CheckCircle, 
  Clock,
  Users,
  TrendingUp,
  Loader2,
  RefreshCw
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StockNotification {
  id: string;
  product_id: string;
  email: string;
  notified_at: string | null;
  created_at: string;
  product?: {
    name: string;
    image_url: string | null;
    stock: number | null;
  };
}

export function StockNotificationsManager() {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  // Fetch stock notifications with product info
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-stock-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_notifications')
        .select(`
          id,
          product_id,
          email,
          notified_at,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch product details separately
      const productIds = [...new Set(data?.map(n => n.product_id) || [])];
      const { data: products } = await supabase
        .from('products')
        .select('id, name, image_url, stock')
        .in('id', productIds);

      const productMap = new Map(products?.map(p => [p.id, p]) || []);

      return (data || []).map(notification => ({
        ...notification,
        product: productMap.get(notification.product_id),
      })) as StockNotification[];
    },
  });

  // Delete notification mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stock_notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stock-notifications'] });
      toast.success('Notificatie verwijderd');
      setDeleteId(null);
    },
    onError: (error) => {
      console.error('Delete error:', error);
      toast.error('Kon notificatie niet verwijderen');
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('stock_notifications')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stock-notifications'] });
      toast.success(`${selectedIds.size} notificaties verwijderd`);
      setSelectedIds(new Set());
      setShowBulkDeleteDialog(false);
    },
    onError: (error) => {
      console.error('Bulk delete error:', error);
      toast.error('Kon notificaties niet verwijderen');
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    const pending = notifications.filter(n => !n.notified_at);
    const notified = notifications.filter(n => n.notified_at);
    const uniqueEmails = new Set(notifications.map(n => n.email)).size;
    const uniqueProducts = new Set(notifications.map(n => n.product_id)).size;

    return {
      total: notifications.length,
      pending: pending.length,
      notified: notified.length,
      uniqueEmails,
      uniqueProducts,
      conversionRate: notifications.length > 0 
        ? Math.round((notified.length / notifications.length) * 100) 
        : 0,
    };
  }, [notifications]);

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    if (!searchTerm) return notifications;
    const search = searchTerm.toLowerCase();
    return notifications.filter(n => 
      n.email.toLowerCase().includes(search) ||
      n.product?.name?.toLowerCase().includes(search)
    );
  }, [notifications, searchTerm]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map(n => n.id)));
    }
  };

  const isAllSelected = filteredNotifications.length > 0 && selectedIds.size === filteredNotifications.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < filteredNotifications.length;

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Totaal aanmeldingen</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-full">
                <Bell className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Wachtend</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-full">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Verstuurd</p>
                <p className="text-2xl font-bold">{stats.notified}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-full">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unieke klanten</p>
                <p className="text-2xl font-bold">{stats.uniqueEmails}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Users className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-full">
                <Package className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Producten met wachtlijst</p>
                <p className="text-xl font-bold">{stats.uniqueProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-full">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Notificatie verzend rate</p>
                <p className="text-xl font-bold">{stats.conversionRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Stock Notificatie Aanmeldingen
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op email of product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              {selectedIds.size > 0 && (
                <Button 
                  variant="destructive" 
                  onClick={() => setShowBulkDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Verwijder ({selectedIds.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? 'Geen resultaten gevonden' : 'Nog geen stock notificatie aanmeldingen'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) (el as any).indeterminate = isSomeSelected;
                        }}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecteer alle"
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aangemeld op</TableHead>
                    <TableHead className="w-[100px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNotifications.map((notification) => (
                    <TableRow key={notification.id} className={selectedIds.has(notification.id) ? 'bg-muted/50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(notification.id)}
                          onCheckedChange={() => toggleSelect(notification.id)}
                          aria-label={`Selecteer ${notification.email}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {notification.product?.image_url && (
                            <img
                              src={notification.product.image_url}
                              alt={notification.product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium line-clamp-1">
                              {notification.product?.name || 'Onbekend product'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Stock: {notification.product?.stock ?? 0}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{notification.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {notification.notified_at ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verstuurd
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="w-3 h-3 mr-1" />
                            Wachtend
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(notification.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(notification.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notificatie verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze notificatie aanmelding wilt verwijderen? 
              De klant ontvangt dan geen melding meer wanneer het product weer op voorraad is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notificaties verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selectedIds.size} notificatie{selectedIds.size > 1 ? 's' : ''} wilt verwijderen? 
              Deze klanten ontvangen dan geen melding meer wanneer de producten weer op voorraad zijn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Verwijder {selectedIds.size} notificatie{selectedIds.size > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
