import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { GripVertical, Save, RotateCcw, Home, Loader2, ImageIcon, ChevronDown, ChevronRight, FolderTree, Eye, EyeOff, ArrowRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  display_order: number | null;
  parent_id: string | null;
}

interface SortableCategoryProps {
  category: Category;
  index: number;
  isSubcategory?: boolean;
}

const SortableCategory = ({ category, index, isSubcategory = false }: SortableCategoryProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-4 p-4 bg-card border rounded-lg transition-colors',
        isDragging ? 'opacity-50 shadow-lg border-primary' : 'hover:bg-muted/50',
        isSubcategory && 'ml-8 border-dashed'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none p-1 rounded hover:bg-muted"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </button>
      
      <Badge variant="outline" className={cn(
        "w-8 h-8 flex items-center justify-center text-sm font-bold",
        isSubcategory && "bg-muted"
      )}>
        {index + 1}
      </Badge>
      
      {category.image_url ? (
        <img
          src={category.image_url}
          alt={category.name}
          className={cn(
            "object-cover rounded-lg",
            isSubcategory ? "w-10 h-10" : "w-12 h-12"
          )}
        />
      ) : (
        <div className={cn(
          "bg-muted rounded-lg flex items-center justify-center",
          isSubcategory ? "w-10 h-10" : "w-12 h-12"
        )}>
          <ImageIcon className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium truncate", isSubcategory && "text-sm")}>{category.name}</p>
        <p className="text-sm text-muted-foreground truncate">{category.slug}</p>
      </div>
      
      <Badge variant="secondary" className="shrink-0">
        Order: {category.display_order ?? 0}
      </Badge>
    </div>
  );
};

interface SubcategoryManagerProps {
  parentCategory: Category;
  subcategories: Category[];
  onSubcategoriesChange: (parentId: string, newOrder: Category[]) => void;
  hasChanges: boolean;
}

const SubcategoryManager = ({ 
  parentCategory, 
  subcategories, 
  onSubcategoriesChange,
  hasChanges 
}: SubcategoryManagerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = subcategories.findIndex((item) => item.id === active.id);
      const newIndex = subcategories.findIndex((item) => item.id === over.id);
      const newOrder = arrayMove(subcategories, oldIndex, newIndex);
      onSubcategoriesChange(parentCategory.id, newOrder);
    }
  };

  if (subcategories.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="ml-4">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <FolderTree className="w-4 h-4" />
          {subcategories.length} subcategorieën
          {hasChanges && <Badge variant="secondary" className="ml-2 text-xs">gewijzigd</Badge>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={subcategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {subcategories.map((category, index) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  index={index}
                  isSubcategory
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleContent>
    </Collapsible>
  );
};

// Homepage Preview Component
interface HomepagePreviewProps {
  categories: Category[];
}

const HomepagePreview = ({ categories }: HomepagePreviewProps) => {
  const fallbackImage = 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=400&q=80';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Eye className="w-4 h-4" />
        <span>Live Preview - Zo ziet de homepage eruit</span>
      </div>
      
      <div className="bg-muted/30 rounded-xl p-6 border">
        <div className="text-center mb-6">
          <h3 className="text-lg font-display font-bold text-foreground">Shop by Category</h3>
          <p className="text-sm text-muted-foreground">Find the perfect products for your pet</p>
        </div>
        
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          {categories.map((category, index) => (
            <div 
              key={category.id} 
              className="group relative aspect-square overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-300"
            >
              <img 
                src={`${category.image_url || fallbackImage}?v=4`}
                alt={category.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                onError={(e) => { e.currentTarget.src = fallbackImage; }}
              />
              
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent group-hover:from-primary/80 group-hover:via-primary/20 transition-colors duration-300" />
              
              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="font-medium text-xs text-white truncate">{category.name}</p>
              </div>
              
              {/* Order badge */}
              <div className="absolute top-1 left-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 opacity-80">
                  {index + 1}
                </Badge>
              </div>
              
              {/* Corner accent */}
              <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <ArrowRight className="w-3 h-3 text-white" />
              </div>
            </div>
          ))}
        </div>
        
        {categories.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Geen categorieën om weer te geven
          </div>
        )}
      </div>
    </div>
  );
};

export const CategoryOrderManager = () => {
  const queryClient = useQueryClient();
  const [localParentCategories, setLocalParentCategories] = useState<Category[]>([]);
  const [localSubcategories, setLocalSubcategories] = useState<Record<string, Category[]>>({});
  const [hasParentChanges, setHasParentChanges] = useState(false);
  const [changedSubcategoryParents, setChangedSubcategoryParents] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(true);

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

  // Fetch all categories
  const { data: allCategories, isLoading, refetch } = useQuery({
    queryKey: ['admin-all-categories-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });

  // Initialize local state when data loads
  useEffect(() => {
    if (allCategories) {
      const parents = allCategories.filter(c => c.parent_id === null);
      const subcats: Record<string, Category[]> = {};
      
      parents.forEach(parent => {
        subcats[parent.id] = allCategories
          .filter(c => c.parent_id === parent.id)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      });
      
      setLocalParentCategories(parents);
      setLocalSubcategories(subcats);
    }
  }, [allCategories]);

  // Save order mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates: { id: string; display_order: number }[] = [];

      // Add parent category updates
      localParentCategories.forEach((cat, index) => {
        updates.push({ id: cat.id, display_order: index + 1 });
      });

      // Add subcategory updates
      Object.values(localSubcategories).forEach(subcats => {
        subcats.forEach((cat, index) => {
          updates.push({ id: cat.id, display_order: index + 1 });
        });
      });

      for (const update of updates) {
        const { error } = await supabase
          .from('categories')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-categories-order'] });
      queryClient.invalidateQueries({ queryKey: ['admin-parent-categories'] });
      queryClient.invalidateQueries({ queryKey: ['homepage-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categorie volgorde opgeslagen');
      setHasParentChanges(false);
      setChangedSubcategoryParents(new Set());
    },
    onError: (error) => {
      toast.error(`Fout bij opslaan: ${error.message}`);
    },
  });

  const handleParentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalParentCategories((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        setHasParentChanges(true);
        return newOrder;
      });
    }
  };

  const handleSubcategoriesChange = (parentId: string, newOrder: Category[]) => {
    setLocalSubcategories(prev => ({
      ...prev,
      [parentId]: newOrder
    }));
    setChangedSubcategoryParents(prev => new Set(prev).add(parentId));
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleReset = async () => {
    const result = await refetch();
    if (result.data) {
      const parents = result.data.filter(c => c.parent_id === null);
      const subcats: Record<string, Category[]> = {};
      
      parents.forEach(parent => {
        subcats[parent.id] = result.data!
          .filter(c => c.parent_id === parent.id)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      });
      
      setLocalParentCategories(parents);
      setLocalSubcategories(subcats);
      setHasParentChanges(false);
      setChangedSubcategoryParents(new Set());
    }
  };

  const hasAnyChanges = hasParentChanges || changedSubcategoryParents.size > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Categorie Volgorde
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Home className="w-5 h-5" />
              Categorie Volgorde
            </CardTitle>
            <CardDescription className="mt-1">
              Sleep categorieën om de volgorde aan te passen. Klik op subcategorieën om die ook te sorteren.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowPreview(!showPreview)}
              className="shrink-0"
              title={showPreview ? "Verberg preview" : "Toon preview"}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasAnyChanges || saveMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasAnyChanges || saveMutation.isPending}
              className="gap-2"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Opslaan
            </Button>
          </div>
        </div>
        {hasAnyChanges && (
          <Badge variant="secondary" className="w-fit mt-2">
            Niet-opgeslagen wijzigingen
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Live Preview */}
        {showPreview && (
          <HomepagePreview categories={localParentCategories} />
        )}

        {/* Drag and Drop Manager */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleParentDragEnd}
        >
          <SortableContext
            items={localParentCategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {localParentCategories.map((category, index) => (
                <div key={category.id} className="space-y-2">
                  <SortableCategory
                    category={category}
                    index={index}
                  />
                  <SubcategoryManager
                    parentCategory={category}
                    subcategories={localSubcategories[category.id] || []}
                    onSubcategoriesChange={handleSubcategoriesChange}
                    hasChanges={changedSubcategoryParents.has(category.id)}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {localParentCategories.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Geen categorieën gevonden
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-4">
          Hoofdcategorieën worden getoond in de "Shop by Category" sectie op de homepage.
        </p>
      </CardContent>
    </Card>
  );
};
