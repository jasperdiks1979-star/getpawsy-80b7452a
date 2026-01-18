import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2, 
  GripVertical,
  ExternalLink,
  Eye,
  EyeOff,
  Edit
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  description: string | null;
}

interface Bestseller {
  id: string;
  product_id: string;
  slug: string;
  rank: number;
  is_manual: boolean;
  seo_title: string | null;
  seo_description: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
  selling_points: unknown;
  long_description: string | null;
  meta_keywords: string[] | null;
  is_active: boolean;
  products?: Product;
}

export const BestsellerManager = () => {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [editingBestseller, setEditingBestseller] = useState<Bestseller | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch bestsellers
  const { data: bestsellers, isLoading: bestsellersLoading } = useQuery({
    queryKey: ['admin-bestsellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bestsellers')
        .select(`
          *,
          products:product_id (
            id,
            name,
            price,
            image_url,
            category,
            description
          )
        `)
        .order('rank');

      if (error) throw error;
      return data as Bestseller[];
    },
  });

  // Fetch products not already bestsellers
  const { data: availableProducts } = useQuery({
    queryKey: ['available-products-for-bestseller'],
    queryFn: async () => {
      const { data: allProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, image_url, category, description')
        .eq('is_active', true)
        .gt('stock', 0)
        .order('name');

      if (productsError) throw productsError;

      const { data: existingBestsellers } = await supabase
        .from('bestsellers')
        .select('product_id');

      const existingIds = new Set(existingBestsellers?.map(b => b.product_id) || []);
      return (allProducts as Product[]).filter(p => !existingIds.has(p.id));
    },
  });

  // Add bestseller mutation
  const addMutation = useMutation({
    mutationFn: async (productId: string) => {
      const product = availableProducts?.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');

      const slug = product.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const nextRank = (bestsellers?.length || 0) + 1;

      const { error } = await supabase
        .from('bestsellers')
        .insert({
          product_id: productId,
          slug: `${slug}-${Date.now()}`,
          rank: nextRank,
          is_manual: true,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      queryClient.invalidateQueries({ queryKey: ['available-products-for-bestseller'] });
      setIsAddDialogOpen(false);
      setSelectedProduct('');
      toast.success('Product toegevoegd als bestseller');
    },
    onError: (error) => {
      console.error('Error adding bestseller:', error);
      toast.error('Fout bij toevoegen bestseller');
    },
  });

  // Update bestseller mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Bestseller> & { id: string }) => {
      const { id, products, selling_points, ...rest } = data;
      const updatePayload: Record<string, unknown> = { ...rest };
      if (selling_points !== undefined) {
        updatePayload.selling_points = selling_points as Json;
      }
      const { error } = await supabase
        .from('bestsellers')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      setIsEditDialogOpen(false);
      setEditingBestseller(null);
      toast.success('Bestseller bijgewerkt');
    },
    onError: (error) => {
      console.error('Error updating bestseller:', error);
      toast.error('Fout bij bijwerken bestseller');
    },
  });

  // Delete bestseller mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bestsellers')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      queryClient.invalidateQueries({ queryKey: ['available-products-for-bestseller'] });
      toast.success('Bestseller verwijderd');
    },
    onError: (error) => {
      console.error('Error deleting bestseller:', error);
      toast.error('Fout bij verwijderen bestseller');
    },
  });

  // Generate SEO content
  const generateSEO = async (bestseller: Bestseller) => {
    if (!bestseller.products) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-bestseller-seo', {
        body: {
          productName: bestseller.products.name,
          productDescription: bestseller.products.description || '',
          category: bestseller.products.category || 'Huisdier',
          price: bestseller.products.price,
        },
      });

      if (error) throw error;

      const updateData: Record<string, unknown> = {
        seo_title: data.seo_title,
        seo_description: data.seo_description,
        hero_headline: data.hero_headline,
        hero_subheadline: data.hero_subheadline,
        selling_points: data.selling_points,
        long_description: data.long_description,
        meta_keywords: data.meta_keywords,
      };

      const { error: updateError } = await supabase
        .from('bestsellers')
        .update(updateData)
        .eq('id', bestseller.id);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error generating SEO:', error);
      toast.error('Fout bij genereren SEO content');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleActive = (bestseller: Bestseller) => {
    updateMutation.mutate({
      id: bestseller.id,
      is_active: !bestseller.is_active,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bestsellers Beheer</h2>
          <p className="text-muted-foreground">
            Beheer je top 10 bestseller producten met speciale landingspagina's
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Bestseller toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Product toevoegen als bestseller</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Selecteer product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kies een product..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {availableProducts?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center gap-2">
                          {product.image_url && (
                            <img 
                              src={product.image_url} 
                              alt="" 
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              ${product.price} - {product.category}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                className="w-full"
                onClick={() => selectedProduct && addMutation.mutate(selectedProduct)}
                disabled={!selectedProduct || addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Toevoegen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {bestsellersLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : bestsellers && bestsellers.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SEO Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bestsellers.map((bestseller) => (
                <TableRow key={bestseller.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <Badge variant="outline">{bestseller.rank}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {bestseller.products?.image_url && (
                        <img
                          src={bestseller.products.image_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">{bestseller.products?.name}</div>
                        <div className="text-sm text-muted-foreground">
                          ${bestseller.products?.price} • /{bestseller.slug}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {bestseller.seo_title ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        SEO Compleet
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        Geen SEO
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={bestseller.is_active}
                        onCheckedChange={() => toggleActive(bestseller)}
                      />
                      <span className="text-sm">
                        {bestseller.is_active ? 'Actief' : 'Inactief'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateSEO(bestseller)}
                        disabled={isGenerating}
                        className="gap-1"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        AI SEO
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingBestseller(bestseller);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <a
                          href={`/bestseller/${bestseller.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm('Weet je zeker dat je deze bestseller wilt verwijderen?')) {
                            deleteMutation.mutate(bestseller.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12 border rounded-lg bg-muted/30">
          <p className="text-muted-foreground mb-4">
            Nog geen bestsellers toegevoegd. Voeg je eerste bestseller toe!
          </p>
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Eerste bestseller toevoegen
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bestseller bewerken</DialogTitle>
          </DialogHeader>
          {editingBestseller && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={editingBestseller.slug}
                    onChange={(e) => setEditingBestseller({
                      ...editingBestseller,
                      slug: e.target.value,
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ranking</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={editingBestseller.rank}
                    onChange={(e) => setEditingBestseller({
                      ...editingBestseller,
                      rank: parseInt(e.target.value) || 1,
                    })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>SEO Titel</Label>
                <Input
                  value={editingBestseller.seo_title || ''}
                  onChange={(e) => setEditingBestseller({
                    ...editingBestseller,
                    seo_title: e.target.value,
                  })}
                  placeholder="Max 60 karakters"
                  maxLength={60}
                />
              </div>

              <div className="space-y-2">
                <Label>SEO Beschrijving</Label>
                <Textarea
                  value={editingBestseller.seo_description || ''}
                  onChange={(e) => setEditingBestseller({
                    ...editingBestseller,
                    seo_description: e.target.value,
                  })}
                  placeholder="Max 155 karakters"
                  maxLength={155}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Hero Headline</Label>
                <Input
                  value={editingBestseller.hero_headline || ''}
                  onChange={(e) => setEditingBestseller({
                    ...editingBestseller,
                    hero_headline: e.target.value,
                  })}
                  placeholder="Pakkende kop"
                />
              </div>

              <div className="space-y-2">
                <Label>Hero Subheadline</Label>
                <Input
                  value={editingBestseller.hero_subheadline || ''}
                  onChange={(e) => setEditingBestseller({
                    ...editingBestseller,
                    hero_subheadline: e.target.value,
                  })}
                  placeholder="Ondersteunende tekst"
                />
              </div>

              <div className="space-y-2">
                <Label>Uitgebreide beschrijving</Label>
                <Textarea
                  value={editingBestseller.long_description || ''}
                  onChange={(e) => setEditingBestseller({
                    ...editingBestseller,
                    long_description: e.target.value,
                  })}
                  rows={6}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingBestseller(null);
                  }}
                >
                  Annuleren
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => updateMutation.mutate(editingBestseller)}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Opslaan
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
