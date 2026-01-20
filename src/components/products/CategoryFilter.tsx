import { ChevronDown, Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  product_count?: number;
  image_url?: string | null;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategories: string[];
  onToggleCategory: (categoryName: string) => void;
  productCounts?: Record<string, number>;
}

interface CategoryNode extends Category {
  children: CategoryNode[];
}

const CategoryImage = ({ imageUrl, name }: { imageUrl?: string | null; name: string }) => {
  if (!imageUrl) return null;
  return (
    <div className="w-6 h-6 rounded overflow-hidden shrink-0">
      <OptimizedImage
        src={imageUrl}
        alt={name}
        className="w-full h-full object-cover"
        aspectRatio="square"
      />
    </div>
  );
};

export const CategoryFilter = ({
  categories,
  selectedCategories,
  onToggleCategory,
  productCounts = {},
}: CategoryFilterProps) => {
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Build tree structure
  const buildCategoryTree = (categories: Category[]): CategoryNode[] => {
    const categoryMap = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    // First pass: create all nodes
    categories.forEach((cat) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Second pass: build tree
    categories.forEach((cat) => {
      const node = categoryMap.get(cat.id)!;
      if (cat.parent_id && categoryMap.has(cat.parent_id)) {
        categoryMap.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort roots and children by name
    const sortByName = (a: CategoryNode, b: CategoryNode) => a.name.localeCompare(b.name);
    roots.sort(sortByName);
    roots.forEach((root) => root.children.sort(sortByName));

    return roots;
  };

  const categoryTree = buildCategoryTree(categories);

  // Filter categories based on search query
  const filterTree = (nodes: CategoryNode[], query: string): CategoryNode[] => {
    if (!query.trim()) return nodes;
    
    const lowerQuery = query.toLowerCase();
    
    return nodes.reduce<CategoryNode[]>((acc, node) => {
      const matchesQuery = node.name.toLowerCase().includes(lowerQuery);
      const filteredChildren = filterTree(node.children, query);
      
      if (matchesQuery || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: matchesQuery ? node.children : filteredChildren,
        });
      }
      
      return acc;
    }, []);
  };

  const filteredCategoryTree = useMemo(
    () => filterTree(categoryTree, searchQuery),
    [categoryTree, searchQuery]
  );

  // Auto-expand categories when searching
  const expandedIds = useMemo(() => {
    if (!searchQuery.trim()) return openCategories;
    
    const ids: string[] = [];
    const collectParentIds = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length > 0) {
          ids.push(node.id);
          collectParentIds(node.children);
        }
      });
    };
    collectParentIds(filteredCategoryTree);
    return ids;
  }, [filteredCategoryTree, searchQuery, openCategories]);

  const toggleOpen = (categoryId: string) => {
    setOpenCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const getProductCount = (category: CategoryNode): number => {
    const directCount = productCounts[category.name] || 0;
    const childrenCount = category.children.reduce(
      (sum, child) => sum + getProductCount(child),
      0
    );
    return directCount + childrenCount;
  };

  const isParentSelected = (category: CategoryNode): boolean => {
    if (selectedCategories.includes(category.name)) return true;
    return category.children.some((child) => isParentSelected(child));
  };

  const renderCategory = (category: CategoryNode, depth: number = 0) => {
    const hasChildren = category.children.length > 0;
    const isOpen = expandedIds.includes(category.id);
    const isSelected = selectedCategories.includes(category.name);
    const hasSelectedChildren = category.children.some((child) =>
      isParentSelected(child)
    );
    const count = getProductCount(category);

    if (hasChildren) {
      return (
        <Collapsible
          key={category.id}
          open={isOpen}
          onOpenChange={() => toggleOpen(category.id)}
        >
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors',
              'hover:bg-muted/50',
              (isSelected || hasSelectedChildren) && 'bg-primary/5'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 flex-1 text-left">
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-muted-foreground transition-transform shrink-0',
                    isOpen && 'rotate-180'
                  )}
                />
                <CategoryImage imageUrl={category.image_url} name={category.name} />
                <span className="text-sm font-medium truncate">{category.name}</span>
                {count > 0 && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    ({count})
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleCategory(category.name)}
              className="shrink-0"
            />
          </div>
          <CollapsibleContent>
            <div className="ml-2 border-l border-border/50 pl-2">
              {category.children.map((child) => renderCategory(child, depth + 1))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <label
        key={category.id}
        className={cn(
          'flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/5'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleCategory(category.name)}
        />
        <CategoryImage imageUrl={category.image_url} name={category.name} />
        <span className="text-sm truncate">{category.name}</span>
        {count > 0 && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            ({count})
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Zoek categorie..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-8 h-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category list */}
      <div className="space-y-1 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
        {filteredCategoryTree.length > 0 ? (
          filteredCategoryTree.map((category) => renderCategory(category))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Geen categorieën gevonden
          </p>
        )}
      </div>
    </div>
  );
};
