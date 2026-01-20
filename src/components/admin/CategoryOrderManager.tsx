import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { GripVertical, Save, RotateCcw, Home, Loader2, ImageIcon } from 'lucide-react';
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
}

const SortableCategory = ({ category, index }: SortableCategoryProps) => {
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
        isDragging ? 'opacity-50 shadow-lg border-primary' : 'hover:bg-muted/50'
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
      
      <Badge variant="outline" className="w-8 h-8 flex items-center justify-center text-sm font-bold">
        {index + 1}
      </Badge>
      
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
      
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{category.name}</p>
        <p className="text-sm text-muted-foreground truncate">{category.slug}</p>
      </div>
      
      <Badge variant="secondary" className="shrink-0">
        Order: {category.display_order ?? 0}
      </Badge>
    </div>
  );
};

export const CategoryOrderManager = () => {
  const queryClient = useQueryClient();
  const [localCategories, setLocalCategories] = useState<Category[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

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

  // Fetch only parent categories (homepage categories)
  const { data: categories, isLoading, refetch } = useQuery({
    queryKey: ['admin-parent-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .is('parent_id', null)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });

  // Sync local state when data loads
  const handleRefresh = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      setLocalCategories(result.data);
      setHasChanges(false);
    }
  }, [refetch]);

  // Initialize local state
  useState(() => {
    if (categories && localCategories.length === 0) {
      setLocalCategories(categories);
    }
  });

  // Keep local state in sync with fetched data when no changes
  if (categories && localCategories.length === 0 && !hasChanges) {
    setLocalCategories(categories);
  }

  // Save order mutation
  const saveMutation = useMutation({
    mutationFn: async (orderedCategories: Category[]) => {
      // Update each category's display_order
      const updates = orderedCategories.map((cat, index) => ({
        id: cat.id,
        display_order: index + 1,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('categories')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-parent-categories'] });
      queryClient.invalidateQueries({ queryKey: ['homepage-categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      toast.success('Categorie volgorde opgeslagen');
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(`Fout bij opslaan: ${error.message}`);
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalCategories((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        setHasChanges(true);
        return newOrder;
      });
    }
  };

  const handleSave = () => {
    saveMutation.mutate(localCategories);
  };

  const handleReset = () => {
    if (categories) {
      setLocalCategories(categories);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="w-5 h-5" />
            Homepage Categorie Volgorde
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
              Homepage Categorie Volgorde
            </CardTitle>
            <CardDescription className="mt-1">
              Sleep categorieën om de volgorde op de homepage aan te passen
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || saveMutation.isPending}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
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
        {hasChanges && (
          <Badge variant="secondary" className="w-fit mt-2">
            Niet-opgeslagen wijzigingen
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localCategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {localCategories.map((category, index) => (
                <SortableCategory
                  key={category.id}
                  category={category}
                  index={index}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {localCategories.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Geen hoofdcategorieën gevonden
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-4">
          Deze categorieën worden getoond in de "Shop by Category" sectie op de homepage.
        </p>
      </CardContent>
    </Card>
  );
};
