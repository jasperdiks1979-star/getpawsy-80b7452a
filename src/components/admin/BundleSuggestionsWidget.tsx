import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { 
  Sparkles, 
  Package, 
  Plus, 
  Percent, 
  TrendingUp, 
  Trash2, 
  Edit2,
  ArrowRight,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

interface ProductPair {
  product1: { id: string; name: string };
  product2: { id: string; name: string };
  count: number;
  percentage: number;
  totalValue: number;
}

interface Bundle {
  id: string;
  name: string;
  description: string | null;
  product_ids: string[];
  discount_percentage: number;
  is_active: boolean;
  created_at: string;
  times_purchased: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}

function isOrderItemArray(items: unknown): items is OrderItem[] {
  return Array.isArray(items) && items.every(item => 
    typeof item === 'object' && item !== null && 'id' in item && 'name' in item
  );
}

export const BundleSuggestionsWidget = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('suggestions');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState<ProductPair | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [bundleName, setBundleName] = useState('');
  const [bundleDescription, setBundleDescription] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState(15);

  // Fetch existing bundles
  const { data: bundles, isLoading: bundlesLoading } = useQuery({
    queryKey: ['product-bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_bundles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Bundle[];
    },
  });

  // Fetch products for bundle display
  const { data: products } = useQuery({
    queryKey: ['products-for-bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, image_url');

      if (error) throw error;
      return data as Product[];
    },
  });

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products?.forEach(p => { map[p.id] = p; });
    return map;
  }, [products]);

  // Fetch co-purchased pairs for suggestions
  const { data: pairData, isLoading: pairsLoading } = useQuery({
    queryKey: ['co-purchased-pairs-for-bundles'],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('items')
        .in('status', ['paid', 'processing', 'shipped', 'delivered']);

      if (error) throw error;

      const pairCounts: Record<string, { 
        product1: { id: string; name: string }; 
        product2: { id: string; name: string }; 
        count: number;
        totalValue: number;
      }> = {};

      let totalOrders = 0;

      orders?.forEach(order => {
        const items = order.items;
        if (!isOrderItemArray(items) || items.length < 2) return;

        totalOrders++;
        
        const uniqueProducts = items.reduce((acc, item) => {
          if (!acc.find(p => p.id === item.id)) {
            acc.push({ id: item.id, name: item.name, price: item.price || 0 });
          }
          return acc;
        }, [] as { id: string; name: string; price: number }[]);

        for (let i = 0; i < uniqueProducts.length; i++) {
          for (let j = i + 1; j < uniqueProducts.length; j++) {
            const [first, second] = [uniqueProducts[i], uniqueProducts[j]].sort((a, b) => 
              a.id.localeCompare(b.id)
            );
            const pairKey = `${first.id}|${second.id}`;
            
            if (!pairCounts[pairKey]) {
              pairCounts[pairKey] = {
                product1: { id: first.id, name: first.name },
                product2: { id: second.id, name: second.name },
                count: 0,
                totalValue: 0
              };
            }
            pairCounts[pairKey].count++;
            pairCounts[pairKey].totalValue += (first.price || 0) + (second.price || 0);
          }
        }
      });

      const pairs: ProductPair[] = Object.values(pairCounts)
        .map(pair => ({
          ...pair,
          percentage: totalOrders > 0 ? Math.round((pair.count / totalOrders) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      return { pairs, totalOrders };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Get existing bundle product pairs to filter out already bundled
  const existingBundlePairs = useMemo(() => {
    const pairs = new Set<string>();
    bundles?.forEach(bundle => {
      if (bundle.product_ids.length === 2) {
        const sorted = [...bundle.product_ids].sort();
        pairs.add(`${sorted[0]}|${sorted[1]}`);
      }
    });
    return pairs;
  }, [bundles]);

  // Filter suggestions to exclude already bundled pairs
  const suggestions = useMemo(() => {
    return pairData?.pairs.filter(pair => {
      const sorted = [pair.product1.id, pair.product2.id].sort();
      return !existingBundlePairs.has(`${sorted[0]}|${sorted[1]}`);
    }) || [];
  }, [pairData?.pairs, existingBundlePairs]);

  // Create bundle mutation
  const createBundleMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      description: string; 
      productIds: string[]; 
      discountPercentage: number 
    }) => {
      const { error } = await supabase
        .from('product_bundles')
        .insert({
          name: data.name,
          description: data.description || null,
          product_ids: data.productIds,
          discount_percentage: data.discountPercentage,
          is_active: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-bundles'] });
      toast.success('Bundle succesvol aangemaakt!');
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Fout bij aanmaken bundle: ' + error.message);
    },
  });

  // Update bundle mutation
  const updateBundleMutation = useMutation({
    mutationFn: async (data: { 
      id: string;
      name: string; 
      description: string; 
      discountPercentage: number;
      isActive: boolean;
    }) => {
      const { error } = await supabase
        .from('product_bundles')
        .update({
          name: data.name,
          description: data.description || null,
          discount_percentage: data.discountPercentage,
          is_active: data.isActive,
        })
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-bundles'] });
      toast.success('Bundle succesvol bijgewerkt!');
      setEditDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Fout bij bijwerken bundle: ' + error.message);
    },
  });

  // Delete bundle mutation
  const deleteBundleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('product_bundles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-bundles'] });
      toast.success('Bundle succesvol verwijderd!');
      setDeleteDialogOpen(false);
      setSelectedBundle(null);
    },
    onError: (error) => {
      toast.error('Fout bij verwijderen bundle: ' + error.message);
    },
  });

  // Toggle bundle active status
  const toggleBundleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('product_bundles')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-bundles'] });
      toast.success('Bundle status bijgewerkt!');
    },
    onError: (error) => {
      toast.error('Fout bij bijwerken status: ' + error.message);
    },
  });

  const resetForm = () => {
    setBundleName('');
    setBundleDescription('');
    setDiscountPercentage(15);
    setSelectedPair(null);
    setSelectedBundle(null);
  };

  const handleCreateBundle = (pair: ProductPair) => {
    setSelectedPair(pair);
    setBundleName(`${pair.product1.name} + ${pair.product2.name}`);
    setBundleDescription(`Populaire combinatie - ${pair.count}x samen gekocht`);
    setDiscountPercentage(15);
    setCreateDialogOpen(true);
  };

  const handleEditBundle = (bundle: Bundle) => {
    setSelectedBundle(bundle);
    setBundleName(bundle.name);
    setBundleDescription(bundle.description || '');
    setDiscountPercentage(bundle.discount_percentage);
    setEditDialogOpen(true);
  };

  const handleSubmitCreate = () => {
    if (!selectedPair || !bundleName.trim()) return;

    createBundleMutation.mutate({
      name: bundleName.trim(),
      description: bundleDescription.trim(),
      productIds: [selectedPair.product1.id, selectedPair.product2.id],
      discountPercentage,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedBundle || !bundleName.trim()) return;

    updateBundleMutation.mutate({
      id: selectedBundle.id,
      name: bundleName.trim(),
      description: bundleDescription.trim(),
      discountPercentage,
      isActive: selectedBundle.is_active,
    });
  };

  const calculateBundlePrice = (productIds: string[]) => {
    return productIds.reduce((sum, id) => sum + (productMap[id]?.price || 0), 0);
  };

  const isLoading = bundlesLoading || pairsLoading;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Bundle Manager
          </CardTitle>
          <CardDescription>
            Creëer bundles op basis van populaire product combinaties
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="suggestions" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Suggesties ({suggestions.length})
              </TabsTrigger>
              <TabsTrigger value="bundles" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Actieve Bundles ({bundles?.filter(b => b.is_active).length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suggestions" className="space-y-3">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Skeleton className="h-10 w-10 rounded" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-3 text-green-500" />
                  <p className="font-medium">Alle suggesties zijn al gebundeld!</p>
                  <p className="text-sm">Of er zijn nog geen co-purchased combinaties gevonden</p>
                </div>
              ) : (
                suggestions.map((pair, index) => (
                  <div 
                    key={`${pair.product1.id}-${pair.product2.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate max-w-[120px]" title={pair.product1.name}>
                          {pair.product1.name}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[120px]" title={pair.product2.name}>
                          {pair.product2.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pair.count}x samen gekocht ({pair.percentage}% van orders)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {pair.count}x
                      </Badge>
                      <Button 
                        size="sm" 
                        onClick={() => handleCreateBundle(pair)}
                        className="flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Bundle
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="bundles" className="space-y-3">
              {bundlesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Skeleton className="h-10 w-10 rounded" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : !bundles || bundles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mb-3 opacity-50" />
                  <p>Nog geen bundles aangemaakt</p>
                  <p className="text-sm">Klik op een suggestie om je eerste bundle te maken</p>
                </div>
              ) : (
                bundles.map((bundle) => {
                  const originalPrice = calculateBundlePrice(bundle.product_ids);
                  const discountedPrice = originalPrice * (1 - bundle.discount_percentage / 100);
                  const productNames = bundle.product_ids.map(id => productMap[id]?.name || 'Onbekend product');

                  return (
                    <div 
                      key={bundle.id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        bundle.is_active ? 'bg-muted/50 hover:bg-muted' : 'bg-muted/20 opacity-60'
                      }`}
                    >
                      <div className="flex-shrink-0">
                        <Switch
                          checked={bundle.is_active}
                          onCheckedChange={(checked) => 
                            toggleBundleMutation.mutate({ id: bundle.id, isActive: checked })
                          }
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{bundle.name}</span>
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Percent className="h-3 w-3" />
                            {bundle.discount_percentage}%
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {productNames.join(' + ')}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className="line-through text-muted-foreground">
                            €{originalPrice.toFixed(2)}
                          </span>
                          <span className="text-green-600 font-medium">
                            €{discountedPrice.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">
                            • {bundle.times_purchased}x gekocht
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => handleEditBundle(bundle)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelectedBundle(bundle);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Create Bundle Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Bundle Aanmaken
            </DialogTitle>
            <DialogDescription>
              Maak een nieuwe bundle aan op basis van deze populaire combinatie
            </DialogDescription>
          </DialogHeader>

          {selectedPair && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{selectedPair.product1.name}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium">{selectedPair.product2.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedPair.count}x samen gekocht
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-name">Bundle Naam</Label>
                <Input
                  id="bundle-name"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  placeholder="Bijv. Perfecte Verzorging Set"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundle-description">Beschrijving (optioneel)</Label>
                <Input
                  id="bundle-description"
                  value={bundleDescription}
                  onChange={(e) => setBundleDescription(e.target.value)}
                  placeholder="Korte beschrijving van de bundle"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount">Korting (%)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="discount"
                    type="number"
                    min={1}
                    max={50}
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    Klanten besparen {discountPercentage}%
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleSubmitCreate}
              disabled={createBundleMutation.isPending || !bundleName.trim()}
            >
              {createBundleMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Bundle Aanmaken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bundle Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Bundle Bewerken
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-bundle-name">Bundle Naam</Label>
              <Input
                id="edit-bundle-name"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-bundle-description">Beschrijving (optioneel)</Label>
              <Input
                id="edit-bundle-description"
                value={bundleDescription}
                onChange={(e) => setBundleDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-discount">Korting (%)</Label>
              <Input
                id="edit-discount"
                type="number"
                min={1}
                max={50}
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                className="w-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuleren
            </Button>
            <Button 
              onClick={handleSubmitEdit}
              disabled={updateBundleMutation.isPending || !bundleName.trim()}
            >
              {updateBundleMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bundle Verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je de bundle "{selectedBundle?.name}" wilt verwijderen? 
              Dit kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedBundle && deleteBundleMutation.mutate(selectedBundle.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBundleMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
