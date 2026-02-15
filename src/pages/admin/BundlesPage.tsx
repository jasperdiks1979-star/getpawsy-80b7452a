import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Package, Search } from 'lucide-react';
import { toast } from 'sonner';

interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  product_ids: string[];
  discount_percentage: number;
  is_active: boolean;
  times_purchased: number;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
}

const BundlesPage = () => {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDiscount, setNewDiscount] = useState(10);
  const [selectedProducts, setSelectedProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['admin-bundles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_bundles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BundleRow[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['admin-bundle-products', search],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('id, name, price, image_url')
        .eq('is_active', true)
        .order('name')
        .limit(50);
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ProductRow[];
    },
  });

  const createBundle = useMutation({
    mutationFn: async () => {
      if (selectedProducts.length < 2) throw new Error('Select at least 2 products');
      if (!newName.trim()) throw new Error('Bundle name required');
      const { error } = await supabase.from('product_bundles').insert({
        name: newName.trim(),
        product_ids: selectedProducts.map((p) => p.id),
        discount_percentage: newDiscount,
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bundle created');
      qc.invalidateQueries({ queryKey: ['admin-bundles'] });
      setCreating(false);
      setNewName('');
      setSelectedProducts([]);
      setNewDiscount(10);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('product_bundles')
        .update({ is_active: active } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bundles'] }),
  });

  const deleteBundle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_bundles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bundle deleted');
      qc.invalidateQueries({ queryKey: ['admin-bundles'] });
    },
  });

  const toggleProduct = (p: ProductRow) => {
    setSelectedProducts((prev) =>
      prev.find((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : prev.length < 3 ? [...prev, p] : prev
    );
  };

  const bundleTotal = selectedProducts.reduce((s, p) => s + (p.price || 0), 0);
  const bundleSavings = bundleTotal * (newDiscount / 100);

  return (
    <Layout>
      <div className="container px-4 md:px-6 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Product Bundles</h1>
            <p className="text-sm text-muted-foreground">Create and manage product bundles with automatic discounts</p>
          </div>
          <Button onClick={() => setCreating(!creating)} className="gap-2">
            <Plus className="w-4 h-4" /> New Bundle
          </Button>
        </div>

        {creating && (
          <Card className="mb-6 border-primary/30">
            <CardHeader><CardTitle className="text-lg">Create Bundle</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Bundle Name</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Complete Dog Starter Kit" />
                </div>
                <div>
                  <label className="text-sm font-medium">Discount %</label>
                  <Input type="number" min={1} max={25} value={newDiscount} onChange={(e) => setNewDiscount(Number(e.target.value))} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Select Products (2–3)</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                  {products.map((p) => {
                    const selected = selectedProducts.some((x) => x.id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleProduct(p)}
                        className={`text-left p-2 rounded-lg border text-xs transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                      >
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-muted-foreground">${p.price?.toFixed(2)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedProducts.length >= 2 && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium">Bundle Preview</p>
                  <p className="text-muted-foreground">
                    Total: ${bundleTotal.toFixed(2)} → ${(bundleTotal - bundleSavings).toFixed(2)}
                    <span className="text-green-600 ml-2">Save ${bundleSavings.toFixed(2)} ({newDiscount}%)</span>
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={() => createBundle.mutate()} disabled={selectedProducts.length < 2 || !newName.trim()}>
                  Create Bundle
                </Button>
                <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : bundles.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No bundles yet. Create your first bundle to boost AOV.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {bundles.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{b.name}</h3>
                      <Badge variant={b.is_active ? 'default' : 'secondary'}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline">{b.discount_percentage}% off</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.product_ids?.length || 0} products • {b.times_purchased || 0} purchases
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={b.is_active}
                      onCheckedChange={(checked) => toggleActive.mutate({ id: b.id, active: checked })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => deleteBundle.mutate(b.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BundlesPage;
