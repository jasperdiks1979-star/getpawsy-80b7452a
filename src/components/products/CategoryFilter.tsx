import { ChevronDown, Search, X, TrendingUp, Check, ChevronsUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

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
  onClearCategories?: () => void;
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
  onClearCategories,
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

  // Get top 5 popular categories (highest product count)
  const popularCategories = useMemo(() => {
    return categories
      .filter((cat) => productCounts[cat.name] && productCounts[cat.name] > 0)
      .map((cat) => ({
        ...cat,
        count: productCounts[cat.name] || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [categories, productCounts]);

  // Get all parent category IDs (categories with children)
  const allParentIds = useMemo(() => {
    const ids: string[] = [];
    const collectParentIds = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        if (node.children.length > 0) {
          ids.push(node.id);
          collectParentIds(node.children);
        }
      });
    };
    collectParentIds(categoryTree);
    return ids;
  }, [categoryTree]);

  // Get names of expanded categories
  const expandedCategoryNames = useMemo(() => {
    const names: string[] = [];
    const findNames = (nodes: CategoryNode[]) => {
      nodes.forEach((node) => {
        if (openCategories.includes(node.id)) {
          names.push(node.name);
        }
        if (node.children.length > 0) {
          findNames(node.children);
        }
      });
    };
    findNames(categoryTree);
    return names;
  }, [categoryTree, openCategories]);

  const toggleOpen = (categoryId: string) => {
    setOpenCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const expandAll = () => setOpenCategories(allParentIds);
  const collapseAll = () => setOpenCategories([]);

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
          <motion.div
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors',
              'hover:bg-muted/50',
              (isSelected || hasSelectedChildren) && 'bg-primary/5'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            animate={isSelected ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 0.2 }}
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
            <motion.div
              animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.2 }}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleCategory(category.name)}
                className="shrink-0"
              />
            </motion.div>
            <AnimatePresence>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute right-2"
                >
                  <Check className="w-3 h-3 text-primary" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          <CollapsibleContent>
            <div className="ml-2 border-l border-border/50 pl-2">
              {category.children.map((child) => renderCategory(child, depth + 1))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <motion.label
        key={category.id}
        className={cn(
          'flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-colors',
          'hover:bg-muted/50',
          isSelected && 'bg-primary/5'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        animate={isSelected ? { scale: [1, 1.02, 1] } : {}}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          animate={isSelected ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.2 }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleCategory(category.name)}
          />
        </motion.div>
        <CategoryImage imageUrl={category.image_url} name={category.name} />
        <span className="text-sm truncate">{category.name}</span>
        {count > 0 && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            ({count})
          </span>
        )}
      </motion.label>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header with clear and collapse buttons */}
      <div className="flex items-center justify-between gap-2">
        {selectedCategories.length > 0 && onClearCategories && (
          <button
            onClick={onClearCategories}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <X className="w-3 h-3" />
            Wis filters ({selectedCategories.length})
          </button>
        )}
        {allParentIds.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 cursor-help">
                    <Progress 
                      value={(openCategories.length / allParentIds.length) * 100} 
                      className="w-12 h-1.5"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {openCategories.length}/{allParentIds.length}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-[200px]">
                  <p className="font-medium">{openCategories.length} van {allParentIds.length} uitgevouwen</p>
                  {expandedCategoryNames.length > 0 && (
                    <p className="text-muted-foreground mt-1">
                      {expandedCategoryNames.slice(0, 5).join(', ')}
                      {expandedCategoryNames.length > 5 && ` +${expandedCategoryNames.length - 5} meer`}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {openCategories.length < allParentIds.length && (
              <button
                onClick={expandAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3" />
                Uitklappen
              </button>
            )}
            {openCategories.length > 0 && (
              <button
                onClick={collapseAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3 rotate-90" />
                Inklappen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Popular categories */}
      {!searchQuery && popularCategories.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingUp className="w-3 h-3" />
            <span>Populair</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {popularCategories.map((cat) => {
              const isSelected = selectedCategories.includes(cat.name);
              return (
                <motion.div
                  key={cat.id}
                  whileTap={{ scale: 0.95 }}
                  animate={isSelected ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.2 }}
                >
                  <Badge
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer text-xs py-1 px-2 transition-all duration-200',
                      isSelected
                        ? 'bg-primary hover:bg-primary/90 shadow-sm'
                        : 'hover:bg-muted hover:scale-105'
                    )}
                    onClick={() => onToggleCategory(cat.name)}
                  >
                    <AnimatePresence mode="wait">
                      {isSelected && (
                        <motion.span
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 'auto', opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          className="overflow-hidden mr-1"
                        >
                          <Check className="w-3 h-3 inline" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {cat.name}
                  </Badge>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

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
      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
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
