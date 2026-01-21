import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FolderTree, Loader2, Save, X, ImageIcon, Download } from 'lucide-react';
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh-container";
import { SwipeToDelete } from "@/components/ui/swipe-to-delete";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  created_at: string;
}

interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  image_url: string;
}

export const CategoryManager = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    slug: '',
    description: '',
    image_url: '',
  });

  // Fetch categories
  const { data: categories, isLoading, refetch } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Category[];
    },
  });

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Fetch product counts per category - match by slug
  const { data: productCounts } = useQuery({
    queryKey: ['category-product-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products_public')
        .select('category')
        .eq('is_active', true);
      
      if (error) throw error;
      
      // Count products by their category slug
      const counts: Record<string, number> = {};
      data?.forEach(product => {
        if (product.category) {
          // Store count by the slug value from products.category
          counts[product.category] = (counts[product.category] || 0) + 1;
        }
      });
      return counts;
    },
  });

  // Create category mutation
  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const { error } = await supabase
        .from('categories')
        .insert({
          name: data.name.trim(),
          slug: data.slug.trim() || generateSlug(data.name),
          description: data.description.trim() || null,
          image_url: data.image_url.trim() || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categorie succesvol aangemaakt');
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Fout bij aanmaken: ${error.message}`);
    },
  });

  // Update category mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      const { error } = await supabase
        .from('categories')
        .update({
          name: data.name.trim(),
          slug: data.slug.trim() || generateSlug(data.name),
          description: data.description.trim() || null,
          image_url: data.image_url.trim() || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categorie succesvol bijgewerkt');
      resetForm();
      setIsDialogOpen(false);
      setEditingCategory(null);
    },
    onError: (error) => {
      toast.error(`Fout bij bijwerken: ${error.message}`);
    },
  });

  // Delete category mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categorie succesvol verwijderd');
      setIsDeleteDialogOpen(false);
      setCategoryToDelete(null);
    },
    onError: (error) => {
      toast.error(`Fout bij verwijderen: ${error.message}`);
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('categories')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success(`${selectedIds.size} categorieën succesvol verwijderd`);
      setIsBulkDeleteDialogOpen(false);
      setSelectedIds(new Set());
    },
    onError: (error) => {
      toast.error(`Fout bij verwijderen: ${error.message}`);
    },
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[&]/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      image_url: '',
    });
    setEditingCategory(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      image_url: category.image_url || '',
    });
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Naam is verplicht');
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = () => {
    if (categoryToDelete) {
      deleteMutation.mutate(categoryToDelete.id);
    }
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCategories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCategories.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const exportToCSV = () => {
    const categoriesToExport = selectedIds.size > 0
      ? filteredCategories.filter(c => selectedIds.has(c.id))
      : filteredCategories;

    if (categoriesToExport.length === 0) {
      toast.error('Geen categorieën om te exporteren');
      return;
    }

    const headers = ['Naam', 'Slug', 'Beschrijving', 'Afbeelding URL', 'Producten', 'Aangemaakt'];
    const rows = categoriesToExport.map(cat => [
      cat.name,
      cat.slug,
      cat.description || '',
      cat.image_url || '',
      productCounts?.[cat.slug] || productCounts?.[cat.name.toLowerCase()] || 0,
      new Date(cat.created_at).toLocaleDateString('nl-NL'),
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `categorieen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast.success(`${categoriesToExport.length} categorieën geëxporteerd`);
  };

  const filteredCategories = categories?.filter(cat =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cat.slug.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const allSelected = filteredCategories.length > 0 && selectedIds.size === filteredCategories.length;

  return (
    <PullToRefreshContainer onRefresh={handleRefresh}>
      <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="w-5 h-5" />
            Categorieën Beheren
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToCSV} className="gap-2">
              <Download className="w-4 h-4" />
              {selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export CSV'}
            </Button>
            <Button onClick={openCreateDialog} className="gap-2">
              <Plus className="w-4 h-4" />
              Nieuwe Categorie
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Bulk Actions */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Input
            placeholder="Zoek categorieën..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedIds.size} geselecteerd</Badge>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsBulkDeleteDialogOpen(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Verwijderen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Deselecteren
              </Button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <TableSkeleton 
            columns={7} 
            rows={6}
            headerWidths={["w-8", "w-16", "w-32", "w-28", "w-20", "w-40", "w-24"]}
            cellWidths={["w-6", "w-12", "w-28", "w-24", "w-12", "w-36", "w-20"]}
          />
        )}

        {/* Categories Table */}
        {!isLoading && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecteer alles"
                    />
                  </TableHead>
                  <TableHead>Afbeelding</TableHead>
                  <TableHead>Naam</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Producten</TableHead>
                  <TableHead>Beschrijving</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Geen categorieën gevonden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCategories.map((category) => (
                    <SwipeToDelete
                      key={category.id}
                      onDelete={() => deleteMutation.mutate(category.id)}
                    >
                      <TableRow className={selectedIds.has(category.id) ? 'bg-muted/50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(category.id)}
                            onCheckedChange={() => toggleSelect(category.id)}
                            aria-label={`Selecteer ${category.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          {category.image_url ? (
                            <img
                              src={category.image_url}
                              alt={category.name}
                              className="w-12 h-12 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {category.slug}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {productCounts?.[category.slug] || productCounts?.[category.name.toLowerCase()] || 0} producten
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">
                          {category.description || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(category)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDeleteDialog(category)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    </SwipeToDelete>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Stats */}
        {!isLoading && categories && (
          <div className="mt-4 text-sm text-muted-foreground">
            Totaal: {categories.length} categorieën
          </div>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Categorie Bewerken' : 'Nieuwe Categorie'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Naam *</label>
              <Input
                placeholder="bijv. Honden Speelgoed"
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({
                    ...prev,
                    name: e.target.value,
                    slug: prev.slug || generateSlug(e.target.value),
                  }));
                }}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input
                placeholder="honden-speelgoed"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Wordt gebruikt in de URL. Laat leeg om automatisch te genereren.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Afbeelding URL</label>
              <Input
                placeholder="https://..."
                value={formData.image_url}
                onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Beschrijving</label>
              <Textarea
                placeholder="Korte beschrijving van de categorie..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Annuleren
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {editingCategory ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Categorie Verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je de categorie "{categoryToDelete?.name}" wilt verwijderen?
              {productCounts?.[categoryToDelete?.name || ''] && productCounts[categoryToDelete?.name || ''] > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Let op: Er zijn nog {productCounts[categoryToDelete?.name || '']} producten in deze categorie.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meerdere Categorieën Verwijderen</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {selectedIds.size} categorieën wilt verwijderen?
              <span className="block mt-2 text-destructive font-medium">
                Let op: Dit kan niet ongedaan worden gemaakt.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {selectedIds.size} Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </Card>
    </PullToRefreshContainer>
  );
};
