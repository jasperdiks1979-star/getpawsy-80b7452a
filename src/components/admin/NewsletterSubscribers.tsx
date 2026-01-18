import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { Mail, Search, Trash2, UserX, UserCheck, Download, Users } from 'lucide-react';
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh-container";
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Subscriber {
  id: string;
  email: string;
  is_active: boolean;
  subscribed_at: string;
  unsubscribed_at: string | null;
}

// Virtualized table component for subscribers
function VirtualizedSubscriberTable({
  subscribers,
  onToggleActive,
  onDelete,
  isToggling,
}: {
  subscribers: Subscriber[];
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  isToggling: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: subscribers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex border-b bg-muted/50">
        <div className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground">E-mail</div>
        <div className="w-40 px-4 py-3 text-sm font-medium text-muted-foreground">Aangemeld</div>
        <div className="w-28 px-4 py-3 text-sm font-medium text-muted-foreground">Status</div>
        <div className="w-24 px-4 py-3 text-sm font-medium text-muted-foreground text-right">Acties</div>
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
            const subscriber = subscribers[virtualRow.index];

            return (
              <div
                key={subscriber.id}
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
                <div className="flex-1 px-4 py-4 text-sm font-medium truncate flex items-center">
                  {subscriber.email}
                </div>
                <div className="w-40 px-4 py-4 text-sm text-muted-foreground flex items-center">
                  {format(new Date(subscriber.subscribed_at), 'd MMM yyyy', { locale: nl })}
                </div>
                <div className="w-28 px-4 py-4 flex items-center">
                  {subscriber.is_active ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      Actief
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Uit</Badge>
                  )}
                </div>
                <div className="w-24 px-4 py-4 flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleActive(subscriber.id, !subscriber.is_active)}
                    disabled={isToggling}
                  >
                    {subscriber.is_active ? (
                      <UserX className="w-4 h-4" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(subscriber.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
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

export const NewsletterSubscribers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: subscribers, isLoading, refetch } = useQuery({
    queryKey: ['newsletter-subscribers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('subscribed_at', { ascending: false });
      
      if (error) throw error;
      return data as Subscriber[];
    },
  });

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .update({ 
          is_active,
          unsubscribed_at: is_active ? null : new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.is_active ? 'Abonnee geactiveerd' : 'Abonnee gedeactiveerd');
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] });
    },
    onError: () => {
      toast.error('Er ging iets mis');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Abonnee verwijderd');
      queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] });
      setDeleteId(null);
    },
    onError: () => {
      toast.error('Verwijderen mislukt');
    },
  });

  const handleExportCSV = () => {
    if (!subscribers || subscribers.length === 0) {
      toast.error('Geen abonnees om te exporteren');
      return;
    }

    const activeSubscribers = subscribers.filter(s => s.is_active);
    const csv = [
      'Email,Aangemeld op,Status',
      ...activeSubscribers.map(s => 
        `${s.email},${format(new Date(s.subscribed_at), 'dd-MM-yyyy HH:mm')},Actief`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nieuwsbrief-abonnees-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('CSV geëxporteerd');
  };

  const filteredSubscribers = subscribers?.filter(s =>
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const activeCount = subscribers?.filter(s => s.is_active).length || 0;
  const inactiveCount = subscribers?.filter(s => !s.is_active).length || 0;

  return (
    <PullToRefreshContainer onRefresh={handleRefresh} className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totaal</p>
                <p className="text-2xl font-bold">{subscribers?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-100">
                <UserCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actief</p>
                <p className="text-2xl font-bold text-green-600">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted">
                <UserX className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Uitgeschreven</p>
                <p className="text-2xl font-bold text-muted-foreground">{inactiveCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscribers Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Nieuwsbrief Abonnees
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Zoek op e-mail..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={!subscribers || subscribers.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton 
              columns={4} 
              rows={8}
              headerWidths={["w-48", "w-36", "w-20", "w-24"]}
              cellWidths={["w-44", "w-32", "w-16", "w-20"]}
            />
          ) : filteredSubscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Geen abonnees gevonden</p>
            </div>
          ) : (
            <VirtualizedSubscriberTable 
              subscribers={filteredSubscribers}
              onToggleActive={(id, isActive) => toggleActiveMutation.mutate({ id, is_active: isActive })}
              onDelete={(id) => setDeleteId(id)}
              isToggling={toggleActiveMutation.isPending}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abonnee verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je deze abonnee wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefreshContainer>
  );
};
