import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2, 
  GripVertical,
  ExternalLink,
  Edit,
  Search,
  X,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  MinusSquare,
  Filter,
  FilterX
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

// Sortable row component for drag-and-drop
interface SortableRowProps {
  bestseller: Bestseller;
  isGenerating: boolean;
  isSelected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onGenerateSEO: (bestseller: Bestseller) => void;
  onEdit: (bestseller: Bestseller) => void;
  onToggleActive: (bestseller: Bestseller) => void;
  onDelete: (id: string) => void;
}

const SortableRow = ({ 
  bestseller, 
  isGenerating,
  isSelected,
  onSelect,
  onGenerateSEO, 
  onEdit, 
  onToggleActive, 
  onDelete 
}: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bestseller.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      className={`${isDragging ? 'bg-muted/50' : ''} ${isSelected ? 'bg-primary/5' : ''}`}
    >
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(bestseller.id, checked as boolean)}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
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
            onCheckedChange={() => onToggleActive(bestseller)}
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
            onClick={() => onGenerateSEO(bestseller)}
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
            onClick={() => onEdit(bestseller)}
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
                onDelete(bestseller.id);
              }
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export const BestsellerManager = () => {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [editingBestseller, setEditingBestseller] = useState<Bestseller | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [localBestsellers, setLocalBestsellers] = useState<Bestseller[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [seoFilter, setSeoFilter] = useState<'all' | 'complete' | 'incomplete'>('all');

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
      setLocalBestsellers(data as Bestseller[]);
      return data as Bestseller[];
    },
  });

  // Use local state for immediate UI updates, fall back to query data
  const baseBestsellers = localBestsellers ?? bestsellers;

  // Filtered bestsellers based on search and filters
  const displayBestsellers = useMemo(() => {
    if (!baseBestsellers) return [];
    
    return baseBestsellers.filter(bestseller => {
      // Search filter
      const searchQuery = tableSearchQuery.toLowerCase().trim();
      if (searchQuery) {
        const matchesSearch = 
          bestseller.products?.name?.toLowerCase().includes(searchQuery) ||
          bestseller.slug?.toLowerCase().includes(searchQuery) ||
          bestseller.products?.category?.toLowerCase().includes(searchQuery);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter === 'active' && !bestseller.is_active) return false;
      if (statusFilter === 'inactive' && bestseller.is_active) return false;

      // SEO filter
      if (seoFilter === 'complete' && !bestseller.seo_title) return false;
      if (seoFilter === 'incomplete' && bestseller.seo_title) return false;

      return true;
    });
  }, [baseBestsellers, tableSearchQuery, statusFilter, seoFilter]);

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== 'all' || seoFilter !== 'all' || tableSearchQuery.trim() !== '';

  const clearAllFilters = () => {
    setStatusFilter('all');
    setSeoFilter('all');
    setTableSearchQuery('');
  };

  // Selection helpers
  const allSelected = displayBestsellers && displayBestsellers.length > 0 && 
    displayBestsellers.every(b => selectedIds.has(b.id));
  const someSelected = displayBestsellers && displayBestsellers.some(b => selectedIds.has(b.id));
  const selectedCount = selectedIds.size;

  const handleSelectAll = (checked: boolean) => {
    if (checked && displayBestsellers) {
      setSelectedIds(new Set(displayBestsellers.map(b => b.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

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

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!availableProducts) return [];
    if (!productSearchQuery.trim()) return availableProducts;
    
    const query = productSearchQuery.toLowerCase().trim();
    return availableProducts.filter(product => 
      product.name.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
    );
  }, [availableProducts, productSearchQuery]);

  // Reset search when dialog closes
  const handleAddDialogChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setProductSearchQuery('');
      setSelectedProduct('');
    }
  };

  // Bulk activate mutation
  const bulkActivateMutation = useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      const { error } = await supabase
        .from('bestsellers')
        .update({ is_active: isActive })
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      setLocalBestsellers(null);
      clearSelection();
      toast.success(`${selectedCount} bestsellers ${isActive ? 'geactiveerd' : 'gedeactiveerd'}`);
    },
    onError: (error) => {
      console.error('Error bulk updating:', error);
      toast.error('Fout bij bijwerken bestsellers');
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('bestsellers')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      queryClient.invalidateQueries({ queryKey: ['available-products-for-bestseller'] });
      setLocalBestsellers(null);
      clearSelection();
      toast.success(`${selectedCount} bestsellers verwijderd`);
    },
    onError: (error) => {
      console.error('Error bulk deleting:', error);
      toast.error('Fout bij verwijderen bestsellers');
    },
  });

  // Bulk generate SEO mutation
  const bulkGenerateSEOMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const bestsellersToGenerate = displayBestsellers?.filter(b => ids.includes(b.id)) || [];
      
      for (const bestseller of bestsellersToGenerate) {
        if (!bestseller.products) continue;
        
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      setLocalBestsellers(null);
      clearSelection();
      toast.success(`SEO gegenereerd voor ${selectedCount} bestsellers`);
    },
    onError: (error) => {
      console.error('Error bulk generating SEO:', error);
      toast.error('Fout bij genereren SEO content');
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; rank: number }[]) => {
      const promises = updates.map(({ id, rank }) =>
        supabase
          .from('bestsellers')
          .update({ rank })
          .eq('id', id)
      );
      
      const results = await Promise.all(promises);
      const error = results.find(r => r.error)?.error;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      toast.success('Volgorde opgeslagen');
    },
    onError: (error) => {
      console.error('Error reordering bestsellers:', error);
      toast.error('Fout bij opslaan volgorde');
      setLocalBestsellers(null);
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
    },
  });

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && displayBestsellers) {
      const oldIndex = displayBestsellers.findIndex((b) => b.id === active.id);
      const newIndex = displayBestsellers.findIndex((b) => b.id === over.id);

      const newOrder = arrayMove(displayBestsellers, oldIndex, newIndex);
      
      const updatedBestsellers = newOrder.map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

      setLocalBestsellers(updatedBestsellers);

      const updates = updatedBestsellers.map((b) => ({
        id: b.id,
        rank: b.rank,
      }));
      reorderMutation.mutate(updates);
    }
  };

  // Add bestseller mutation
  const addMutation = useMutation({
    mutationFn: async (productId: string) => {
      const product = availableProducts?.find(p => p.id === productId);
      if (!product) throw new Error('Product not found');

      const slug = product.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const nextRank = (displayBestsellers?.length || 0) + 1;

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
      setLocalBestsellers(null);
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
      setLocalBestsellers(null);
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
      setLocalBestsellers(null);
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
      
      queryClient.invalidateQueries({ queryKey: ['admin-bestsellers'] });
      setLocalBestsellers(null);
      toast.success('SEO content gegenereerd');
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

  const isBulkActionPending = bulkActivateMutation.isPending || bulkDeleteMutation.isPending || bulkGenerateSEOMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bestsellers Beheer</h2>
          <p className="text-muted-foreground">
            Beheer je top 10 bestseller producten met speciale landingspagina's
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={handleAddDialogChange}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Bestseller toevoegen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Product toevoegen als bestseller</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Search input */}
              <div className="space-y-2">
                <Label>Zoek product</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoek op naam of categorie..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="pl-9 pr-9"
                  />
                  {productSearchQuery && (
                    <button
                      onClick={() => setProductSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {filteredProducts.length} van {availableProducts?.length || 0} producten
                </p>
              </div>

              {/* Product list */}
              <div className="space-y-2">
                <Label>Selecteer product</Label>
                <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      {productSearchQuery 
                        ? 'Geen producten gevonden voor deze zoekopdracht' 
                        : 'Geen beschikbare producten'}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredProducts.map((product) => (
                        <button
                          key={product.id}
                          onClick={() => setSelectedProduct(product.id)}
                          className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${
                            selectedProduct === product.id 
                              ? 'bg-primary/10 border-l-2 border-l-primary' 
                              : ''
                          }`}
                        >
                          {product.image_url ? (
                            <img 
                              src={product.image_url} 
                              alt="" 
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{product.name}</div>
                            <div className="text-sm text-muted-foreground">
                              ${product.price} • {product.category || 'Geen categorie'}
                            </div>
                          </div>
                          {selectedProduct === product.id && (
                            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters:</span>
        </div>
        
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zoek bestseller..."
            value={tableSearchQuery}
            onChange={(e) => setTableSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-9"
          />
          {tableSearchQuery && (
            <button
              onClick={() => setTableSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-background rounded-md border p-1">
          <Button
            size="sm"
            variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setStatusFilter('all')}
            className="h-7 px-3 text-xs"
          >
            Alle
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'active' ? 'secondary' : 'ghost'}
            onClick={() => setStatusFilter('active')}
            className="h-7 px-3 text-xs gap-1"
          >
            <Eye className="w-3 h-3" />
            Actief
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'inactive' ? 'secondary' : 'ghost'}
            onClick={() => setStatusFilter('inactive')}
            className="h-7 px-3 text-xs gap-1"
          >
            <EyeOff className="w-3 h-3" />
            Inactief
          </Button>
        </div>

        {/* SEO filter */}
        <div className="flex items-center gap-1 bg-background rounded-md border p-1">
          <Button
            size="sm"
            variant={seoFilter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setSeoFilter('all')}
            className="h-7 px-3 text-xs"
          >
            Alle SEO
          </Button>
          <Button
            size="sm"
            variant={seoFilter === 'complete' ? 'secondary' : 'ghost'}
            onClick={() => setSeoFilter('complete')}
            className="h-7 px-3 text-xs gap-1"
          >
            <CheckSquare className="w-3 h-3" />
            Compleet
          </Button>
          <Button
            size="sm"
            variant={seoFilter === 'incomplete' ? 'secondary' : 'ghost'}
            onClick={() => setSeoFilter('incomplete')}
            className="h-7 px-3 text-xs gap-1"
          >
            <Square className="w-3 h-3" />
            Incompleet
          </Button>
        </div>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAllFilters}
            className="h-7 px-3 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <FilterX className="w-3 h-3" />
            Wis filters
          </Button>
        )}

        {/* Results count */}
        <div className="ml-auto text-sm text-muted-foreground">
          {displayBestsellers.length} van {baseBestsellers?.length || 0} bestsellers
        </div>
      </div>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="bg-muted/50 border rounded-lg p-4 flex items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              {selectedCount} geselecteerd
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="text-muted-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Deselecteer
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkActivateMutation.mutate({ ids: Array.from(selectedIds), isActive: true })}
              disabled={isBulkActionPending}
              className="gap-1"
            >
              {bulkActivateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              Activeren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkActivateMutation.mutate({ ids: Array.from(selectedIds), isActive: false })}
              disabled={isBulkActionPending}
              className="gap-1"
            >
              {bulkActivateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              Deactiveren
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkGenerateSEOMutation.mutate(Array.from(selectedIds))}
              disabled={isBulkActionPending}
              className="gap-1"
            >
              {bulkGenerateSEOMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              AI SEO
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirm(`Weet je zeker dat je ${selectedCount} bestsellers wilt verwijderen?`)) {
                  bulkDeleteMutation.mutate(Array.from(selectedIds));
                }
              }}
              disabled={isBulkActionPending}
              className="gap-1"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Verwijderen
            </Button>
          </div>
        </div>
      )}

      {bestsellersLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : displayBestsellers && displayBestsellers.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/30 px-4 py-2 border-b flex items-center gap-2 text-sm text-muted-foreground">
            <GripVertical className="w-4 h-4" />
            <span>Sleep om de volgorde te wijzigen</span>
            {reorderMutation.isPending && (
              <span className="ml-auto flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Opslaan...
              </span>
            )}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <button
                      onClick={() => handleSelectAll(!allSelected)}
                      className="flex items-center justify-center"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : someSelected ? (
                        <MinusSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="w-20">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>SEO Status</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <SortableContext
                items={displayBestsellers.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <TableBody>
                  {displayBestsellers.map((bestseller) => (
                    <SortableRow
                      key={bestseller.id}
                      bestseller={bestseller}
                      isGenerating={isGenerating}
                      isSelected={selectedIds.has(bestseller.id)}
                      onSelect={handleSelect}
                      onGenerateSEO={generateSEO}
                      onEdit={(b) => {
                        setEditingBestseller(b);
                        setIsEditDialogOpen(true);
                      }}
                      onToggleActive={toggleActive}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))}
                </TableBody>
              </SortableContext>
            </Table>
          </DndContext>
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
