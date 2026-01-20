import { ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  product_count?: number;
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

export const CategoryFilter = ({
  categories,
  selectedCategories,
  onToggleCategory,
  productCounts = {},
}: CategoryFilterProps) => {
  const [openCategories, setOpenCategories] = useState<string[]>([]);

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
    const isOpen = openCategories.includes(category.id);
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
                {isOpen ? (
                  <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
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
    <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
      {categoryTree.map((category) => renderCategory(category))}
    </div>
  );
};
