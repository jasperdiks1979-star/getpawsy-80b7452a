import { useState, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Mail, Search, Trash2, UserX, UserCheck, Download, Users, Settings, Package, Heart, Gift, Sparkles, PieChart, BarChart3, TrendingUp, Copy } from 'lucide-react';
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh-container";
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

interface Subscriber {
  id: string;
  email: string;
  is_active: boolean;
  subscribed_at: string;
  unsubscribed_at: string | null;
  preferences: Preferences;
  preference_token: string | null;
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

const preferenceLabels: Record<keyof Preferences, { label: string; icon: typeof Package; color: string }> = {
  product_updates: { label: 'Product Updates', icon: Package, color: 'text-blue-500 bg-blue-100' },
  pet_care_tips: { label: 'Pet Care Tips', icon: Heart, color: 'text-pink-500 bg-pink-100' },
  promotions: { label: 'Promoties', icon: Gift, color: 'text-green-500 bg-green-100' },
  new_arrivals: { label: 'Nieuwe Producten', icon: Sparkles, color: 'text-purple-500 bg-purple-100' },
};

export const NewsletterSubscribers = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('subscribers');
  const queryClient = useQueryClient();

  const { data: subscribers, isLoading, refetch } = useQuery({
    queryKey: ['newsletter-subscribers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .order('subscribed_at', { ascending: false });
      
      if (error) throw error;
      
      const defaultPrefs: Preferences = { product_updates: true, pet_care_tips: true, promotions: true, new_arrivals: true };
      
      // Map to ensure proper typing
      return (data || []).map(row => ({
        ...row,
        preferences: (row.preferences as unknown as Preferences) || defaultPrefs
      })) as Subscriber[];
    },
  });

  // Calculate preference statistics
  const preferenceStats = useMemo(() => {
    if (!subscribers) return null;
    
    const activeSubscribers = subscribers.filter(s => s.is_active);
    const total = activeSubscribers.length;
    
    if (total === 0) return null;
    
    const stats = {
      product_updates: { count: 0, percentage: 0 },
      pet_care_tips: { count: 0, percentage: 0 },
      promotions: { count: 0, percentage: 0 },
      new_arrivals: { count: 0, percentage: 0 },
    };
    
    activeSubscribers.forEach(sub => {
      const prefs = sub.preferences || { product_updates: true, pet_care_tips: true, promotions: true, new_arrivals: true };
      (Object.keys(stats) as Array<keyof Preferences>).forEach(key => {
        if (prefs[key]) {
          stats[key].count++;
        }
      });
    });
    
    (Object.keys(stats) as Array<keyof Preferences>).forEach(key => {
      stats[key].percentage = Math.round((stats[key].count / total) * 100);
    });
    
    return { stats, total };
  }, [subscribers]);

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

  const handleCopyPreferenceLink = (token: string | null) => {
    if (!token) {
      toast.error('Geen preference link beschikbaar');
      return;
    }
    const link = `https://getpawsy.pet/newsletter-preferences?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Link gekopieerd naar klembord');
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

      {/* Tabs for Subscribers and Preferences */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="subscribers" className="gap-2">
            <Mail className="w-4 h-4" />
            Abonnees
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <PieChart className="w-4 h-4" />
            Voorkeuren
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers" className="mt-6">
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
        </TabsContent>

        <TabsContent value="preferences" className="mt-6 space-y-6">
          {/* Preference Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Voorkeuren Statistieken
              </CardTitle>
              <CardDescription>
                Overzicht van welke e-mail categorieën actieve abonnees willen ontvangen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!preferenceStats ? (
                <div className="text-center py-8 text-muted-foreground">
                  <PieChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Geen actieve abonnees</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(Object.entries(preferenceStats.stats) as Array<[keyof Preferences, { count: number; percentage: number }]>).map(([key, data]) => {
                    const { label, icon: Icon, color } = preferenceLabels[key];
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${color.split(' ')[1]}`}>
                              <Icon className={`w-4 h-4 ${color.split(' ')[0]}`} />
                            </div>
                            <span className="font-medium">{label}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-lg">{data.percentage}%</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              ({data.count}/{preferenceStats.total})
                            </span>
                          </div>
                        </div>
                        <Progress value={data.percentage} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Individual Preferences Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Individuele Voorkeuren
              </CardTitle>
              <CardDescription>
                Bekijk de voorkeuren per abonnee
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton columns={6} rows={5} />
              ) : !subscribers || subscribers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Geen abonnees</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">E-mail</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                            <span title="Product Updates"><Package className="w-4 h-4 mx-auto" /></span>
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                            <span title="Pet Care Tips"><Heart className="w-4 h-4 mx-auto" /></span>
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                            <span title="Promoties"><Gift className="w-4 h-4 mx-auto" /></span>
                          </th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                            <span title="Nieuwe Producten"><Sparkles className="w-4 h-4 mx-auto" /></span>
                          </th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscribers.filter(s => s.is_active).slice(0, 50).map((subscriber) => {
                          const prefs = subscriber.preferences || { product_updates: true, pet_care_tips: true, promotions: true, new_arrivals: true };
                          return (
                            <tr key={subscriber.id} className="border-b hover:bg-muted/50">
                              <td className="px-4 py-3 text-sm font-medium truncate max-w-[200px]">
                                {subscriber.email}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {prefs.product_updates ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">Aan</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Uit</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {prefs.pet_care_tips ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">Aan</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Uit</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {prefs.promotions ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">Aan</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Uit</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {prefs.new_arrivals ? (
                                  <Badge className="bg-green-100 text-green-700 text-xs">Aan</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">Uit</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyPreferenceLink(subscriber.preference_token)}
                                  title="Kopieer preference link"
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {subscribers.filter(s => s.is_active).length > 50 && (
                    <div className="px-4 py-3 text-center text-sm text-muted-foreground bg-muted/30">
                      Toont eerste 50 van {subscribers.filter(s => s.is_active).length} actieve abonnees
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
