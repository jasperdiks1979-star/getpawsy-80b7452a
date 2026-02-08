import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, LogOut, Shield, Heart, X, ChevronDown, ChevronRight, Gift, Truck, ArrowRight, Award } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/contexts/CartContext';
import { useCartIconRef } from '@/contexts/CartAnimationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EnhancedSearch } from '@/components/search/EnhancedSearch';
import { AnimatedHamburger } from '@/components/ui/animated-hamburger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FloatingCartPreview } from '@/components/cart/FloatingCartPreview';
import { supabase } from '@/integrations/supabase/client';
import logoIcon from '@/assets/logo-getpawsy.png';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop' },
  { href: '/bestsellers', label: 'Bestsellers', icon: Award, highlight: true },
  { href: '/blog', label: 'Blog' },
];

const promoItems = [
  { label: 'Free Shipping', icon: Truck, href: '/products' },
  { label: 'New Arrivals', icon: Gift, href: '/products?sort=newest' },
];

interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  image_url: string | null;
  display_order: number | null;
  product_count?: number;
}

interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

// Category item component for mega menu
const MegaMenuCategoryItem = ({ 
  category, 
  onClose,
  expandedCategory,
  setExpandedCategory
}: { 
  category: CategoryWithChildren; 
  onClose: () => void;
  expandedCategory: string | null;
  setExpandedCategory: (id: string | null) => void;
}) => {
  const hasChildren = category.children.length > 0;
  const isExpanded = expandedCategory === category.id;

  return (
    <div className="relative">
      <div 
        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer group"
        onClick={() => {
          if (hasChildren) {
            setExpandedCategory(isExpanded ? null : category.id);
          }
        }}
        onMouseEnter={() => {
          if (hasChildren) {
            setExpandedCategory(category.id);
          }
        }}
      >
        {category.image_url && (
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <img 
              src={category.image_url} 
              alt={category.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Link
            to={`/products?category=${encodeURIComponent(category.slug)}`}
            onClick={(e) => {
              if (!hasChildren) {
                onClose();
              } else {
                e.preventDefault();
              }
            }}
            className="font-medium text-foreground group-hover:text-primary transition-colors block truncate"
          >
            {category.name}
          </Link>
          {category.product_count !== undefined && category.product_count > 0 && (
            <p className="text-xs text-muted-foreground">
              {category.product_count} products
            </p>
          )}
        </div>
        {hasChildren && (
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </div>

      {/* Subcategories dropdown */}
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="pl-4 overflow-hidden"
          >
            <div className="border-l-2 border-muted pl-2 py-1 space-y-1">
              {/* Link to parent category */}
              <Link
                to={`/products?category=${encodeURIComponent(category.slug)}`}
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-primary font-medium"
              >
                All {category.name}
                <ArrowRight className="w-3 h-3" />
              </Link>
              {category.children.map((child) => (
                <Link
                  key={child.id}
                  to={`/products?category=${encodeURIComponent(child.slug)}`}
                  onClick={onClose}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  {child.image_url && (
                    <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0">
                      <img 
                        src={child.image_url} 
                        alt={child.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <span className="truncate">{child.name}</span>
                  {child.product_count !== undefined && child.product_count > 0 && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      ({child.product_count})
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Mobile category item with accordion
const MobileCategoryItem = ({ 
  category, 
  onClose 
}: { 
  category: CategoryWithChildren; 
  onClose: () => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = category.children.length > 0;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div 
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {category.image_url && (
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <img 
              src={category.image_url} 
              alt={category.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {hasChildren ? (
            <span className="font-medium">{category.name}</span>
          ) : (
            <Link
              to={`/products?category=${encodeURIComponent(category.slug)}`}
              onClick={onClose}
              className="font-medium block"
            >
              {category.name}
            </Link>
          )}
          {category.product_count !== undefined && category.product_count > 0 && (
            <p className="text-xs text-muted-foreground">{category.product_count} products</p>
          )}
        </div>
        {hasChildren && (
          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </div>

      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-muted/30"
          >
            <div className="py-2 px-4 space-y-1">
              <Link
                to={`/products?category=${encodeURIComponent(category.slug)}`}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-primary font-medium hover:bg-muted transition-colors"
              >
                All {category.name}
                <ArrowRight className="w-3 h-3" />
              </Link>
              {category.children.map((child) => (
                <Link
                  key={child.id}
                  to={`/products?category=${encodeURIComponent(child.slug)}`}
                  onClick={onClose}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  {child.image_url && (
                    <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0">
                      <img 
                        src={child.image_url} 
                        alt={child.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <span className="truncate flex-1">{child.name}</span>
                  {child.product_count !== undefined && child.product_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({child.product_count})
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Navbar = () => {
  const { totalItems } = useCart();
  const cartIconRef = useCartIconRef();
  const { user, isAdmin, signOut } = useAuth();
  const { wishlist } = useWishlist();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCartPreviewOpen, setIsCartPreviewOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('promo-banner-dismissed') === 'true';
  });
  const location = useLocation();
  const navigate = useNavigate();

  // Fetch categories from database
  const { data: categories = [] } = useQuery({
    queryKey: ['navbar-categories'],
    queryFn: async () => {
      // Fetch all categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
         .select('id, name, slug, parent_id, image_url, display_order')
         .order('display_order', { ascending: true });

      if (categoriesError) throw categoriesError;

      // Fetch active canonical products to calculate counts
       const { data: productsData, error: productsError } = await supabase
         .from('products_public')
         .select('category');

      if (productsError) throw productsError;

       // Build a recursive function to find the ROOT parent category for any category
       // This handles multi-level hierarchies (e.g., Small Pets > Hamsters > Hamster Cages)
       const findRootParent = (categoryId: string, visited = new Set<string>()): string | null => {
         if (visited.has(categoryId)) return null; // Prevent infinite loops
         visited.add(categoryId);
         
         const cat = categoriesData?.find(c => c.id === categoryId);
         if (!cat) return null;
         if (!cat.parent_id) return categoryId; // This is a root category
         return findRootParent(cat.parent_id, visited);
       };
       
       // Build mappings for counting
       const categoryById: Record<string, { id: string; parent_id: string | null }> = {};
       const catNameToId: Record<string, string> = {};
       categoriesData?.forEach(cat => {
         categoryById[cat.id] = { id: cat.id, parent_id: cat.parent_id };
         catNameToId[cat.name.toLowerCase().trim()] = cat.id;
         if (cat.slug) {
           catNameToId[cat.slug.toLowerCase().trim()] = cat.id;
         }
       });
 
       // Count products per category (direct count) AND per root parent
      const countMap: Record<string, number> = {};
       const rootCountMap: Record<string, number> = {};
      productsData?.forEach((p) => {
        if (p.category) {
          const normalizedCat = p.category.toLowerCase().trim();
           const catId = catNameToId[normalizedCat];
           if (catId) {
             // Direct count for this category
             countMap[catId] = (countMap[catId] || 0) + 1;
             
             // Also count for root parent
             const rootId = findRootParent(catId);
             if (rootId) {
               rootCountMap[rootId] = (rootCountMap[rootId] || 0) + 1;
             }
           }
        }
      });

       // Add counts to categories (matching by ID)
      const categoriesWithCounts = (categoriesData || []).map((cat) => ({
        ...cat,
         // For root categories, use rootCountMap; for children, use direct countMap
         product_count: cat.parent_id ? (countMap[cat.id] || 0) : (rootCountMap[cat.id] || 0),
      })) as Category[];

       return categoriesWithCounts;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Build category tree
  const categoryTree = useMemo(() => {
    const buildTree = (parentId: string | null): CategoryWithChildren[] => {
      return categories
        .filter((cat) => cat.parent_id === parentId)
        // Filter out categories with 0 products at parent level
        .filter((cat) => parentId !== null || (cat.product_count || 0) > 0)
        .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
        .map((cat) => ({
          ...cat,
          // Filter out children with 0 products
          children: buildTree(cat.id).filter(child => (child.product_count || 0) > 0),
        }));
    };
    return buildTree(null);
  }, [categories]);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mega menu on route change
  useEffect(() => {
    setIsMegaMenuOpen(false);
    setIsSearchOpen(false);
    setExpandedCategory(null);
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleCloseSearch = () => {
    setIsSearchOpen(false);
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href.split('?')[0]);
  };

  const dismissBanner = () => {
    setIsBannerDismissed(true);
    localStorage.setItem('promo-banner-dismissed', 'true');
  };

  const closeMegaMenu = () => {
    setIsMegaMenuOpen(false);
    setExpandedCategory(null);
  };

  return (
    <>
      {/* Promo Banner */}
      <AnimatePresence>
        {!isBannerDismissed && (
          <motion.div 
            initial={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-primary text-primary-foreground text-sm font-medium overflow-hidden"
          >
            <div className="container flex items-center justify-center gap-2 py-2 px-4 relative">
              <Truck className="w-4 h-4" />
              <span>Free US shipping on orders over $35</span>
              <span className="hidden sm:inline text-primary-foreground/80">•</span>
              <span className="hidden sm:inline text-primary-foreground/80">Fast delivery 🚀</span>
              <button
                onClick={dismissBanner}
                className="absolute right-4 p-1 hover:bg-primary-foreground/20 rounded-full transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <header 
        className={`sticky top-0 z-50 w-full max-w-[100vw] overflow-x-hidden transition-all duration-300 ${
          isScrolled 
            ? 'bg-background/95 backdrop-blur-xl shadow-soft border-b border-border/50' 
            : 'bg-background/80 backdrop-blur-lg'
        }`}
      >
        <div className="container flex h-18 items-center justify-between px-4 md:px-6 py-3 max-w-full">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-3 font-bold text-xl group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <motion.div 
              className="flex items-center justify-center w-11 h-11 rounded-2xl overflow-hidden shadow-soft"
              whileHover={{ scale: 1.05, rotate: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <img src={logoIcon} alt="GetPawsy" className="w-full h-full object-cover" />
            </motion.div>
            <span className="font-display text-foreground text-xl sm:text-2xl">
              Get<span className="text-primary">Pawsy</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = 'icon' in link ? link.icon : null;
              const isHighlight = 'highlight' in link && link.highlight;
              
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-full flex items-center gap-1.5 ${
                    isHighlight && !isActive(link.href)
                      ? 'text-amber-600 dark:text-amber-400 bg-gradient-to-r from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/20'
                      : isActive(link.href) 
                        ? 'text-primary bg-primary/10' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {link.label}
                </Link>
              );
            })}
            
            {/* Categories Mega Menu Trigger */}
            <button
              onMouseEnter={() => setIsMegaMenuOpen(true)}
              onClick={() => setIsMegaMenuOpen(!isMegaMenuOpen)}
              className={`flex items-center gap-1 px-4 py-2 text-sm font-medium transition-colors rounded-full ${
                isMegaMenuOpen
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Categories
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isMegaMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Search */}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Wishlist */}
            <Link to="/wishlist" className="hidden sm:block">
              <Button variant="ghost" size="icon" className="relative rounded-full">
                <Heart className={`h-5 w-5 transition-colors ${wishlist.length > 0 ? 'fill-accent text-accent' : ''}`} />
                {wishlist.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full bg-accent text-accent-foreground">
                    {wishlist.length}
                  </Badge>
                )}
              </Button>
            </Link>

            {/* Cart with Floating Preview */}
            <div 
              className="relative hidden sm:block"
              onMouseEnter={() => setIsCartPreviewOpen(true)}
              onMouseLeave={() => setIsCartPreviewOpen(false)}
            >
              <Link to="/cart">
                <div ref={cartIconRef as React.RefObject<HTMLDivElement>}>
                  <Button variant="ghost" size="icon" className="relative rounded-full">
                    <ShoppingCart className="h-5 w-5" />
                    {totalItems > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        key={totalItems}
                      >
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full">
                          {totalItems}
                        </Badge>
                      </motion.div>
                    )}
                  </Button>
                </div>
              </Link>
              
              {/* Floating Cart Preview */}
              <FloatingCartPreview 
                isVisible={isCartPreviewOpen} 
                onClose={() => setIsCartPreviewOpen(false)} 
              />
            </div>

            {/* Mobile Cart (no preview) */}
            <Link to="/cart" className="sm:hidden">
              <div ref={cartIconRef as React.RefObject<HTMLDivElement>}>
                <Button variant="ghost" size="icon" className="relative rounded-full">
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      key={totalItems}
                    >
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full">
                        {totalItems}
                      </Badge>
                    </motion.div>
                  )}
                </Button>
              </div>
            </Link>

            {/* Account */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex">
                    <User className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-xl bg-background border shadow-soft">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                    {isAdmin && (
                      <Badge variant="secondary" className="mt-1 text-xs">
                        Admin
                      </Badge>
                    )}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="h-4 w-4" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className="hidden sm:block">
                <Button variant="default" size="sm" className="rounded-full px-5 btn-organic">
                  Sign In
                </Button>
              </Link>
            )}

            {/* Mobile Menu */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <AnimatedHamburger isOpen={isMobileMenuOpen} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[320px] p-0 bg-background">
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b bg-muted/30">
                    <span className="font-display text-xl">
                      Get<span className="text-primary">Pawsy</span>
                    </span>
                  </div>
                  
                  {/* Mobile Search */}
                  <div className="p-4 border-b">
                    <EnhancedSearch
                      variant="navbar"
                      placeholder="Search products..."
                      onClose={() => setIsMobileMenuOpen(false)}
                    />
                  </div>

                  <ScrollArea className="flex-1">
                    <nav className="p-4">
                      <div className="flex flex-col gap-1 mb-4">
                        {navLinks.map((link) => (
                          <SheetClose asChild key={link.href}>
                            <Link
                              to={link.href}
                              className={`px-4 py-3 text-lg font-medium rounded-xl transition-colors ${
                                isActive(link.href)
                                  ? 'text-primary bg-primary/10'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              {link.label}
                            </Link>
                          </SheetClose>
                        ))}
                        
                        {/* Admin link */}
                        {user && (
                          <SheetClose asChild>
                            <Link
                              to="/admin"
                              className={`px-4 py-3 text-lg font-medium rounded-xl transition-colors flex items-center gap-3 ${
                                isActive('/admin')
                                  ? 'text-primary bg-primary/10'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <Shield className="h-5 w-5" />
                              Admin Dashboard
                              {!isAdmin && <Badge variant="outline" className="ml-auto text-xs">Test</Badge>}
                            </Link>
                          </SheetClose>
                        )}
                      </div>
                      
                      {/* Mobile Categories */}
                      <div className="mb-2">
                        <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Categories
                        </p>
                      </div>
                      <div className="rounded-xl border bg-card overflow-hidden">
                        {categoryTree.map((category) => (
                          <MobileCategoryItem
                            key={category.id}
                            category={category}
                            onClose={() => setIsMobileMenuOpen(false)}
                          />
                        ))}
                      </div>
                      
                      <SheetClose asChild>
                        <Link
                          to="/wishlist"
                          className="mt-4 px-4 py-3 text-lg font-medium rounded-xl hover:bg-muted transition-colors flex items-center gap-3"
                        >
                          <Heart className={`h-5 w-5 ${wishlist.length > 0 ? 'fill-accent text-accent' : ''}`} />
                          Wishlist {wishlist.length > 0 && `(${wishlist.length})`}
                        </Link>
                      </SheetClose>
                    </nav>
                  </ScrollArea>
                  
                  <div className="p-4 border-t bg-muted/30">
                    {user ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground px-2 truncate">{user.email}</p>
                        <SheetClose asChild>
                          <Link to="/profile" className="block">
                            <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                              <User className="h-4 w-4" />
                              My Profile
                            </Button>
                          </Link>
                        </SheetClose>
                        {isAdmin && (
                          <SheetClose asChild>
                            <Link to="/admin" className="block">
                              <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                                <Shield className="h-4 w-4" />
                                Admin Dashboard
                              </Button>
                            </Link>
                          </SheetClose>
                        )}
                        <SheetClose asChild>
                          <Button
                            variant="ghost"
                            onClick={handleSignOut}
                            className="w-full justify-start gap-2 text-destructive hover:text-destructive rounded-xl"
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </Button>
                        </SheetClose>
                      </div>
                    ) : (
                      <SheetClose asChild>
                        <Link to="/auth" className="block">
                          <Button className="w-full rounded-xl btn-organic">Sign In</Button>
                        </Link>
                      </SheetClose>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {isSearchOpen && (
            <motion.div 
              className="container px-4 md:px-6 pb-4"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="relative max-w-2xl mx-auto">
                <EnhancedSearch
                  variant="default"
                  placeholder="What are you looking for?"
                  autoFocus
                  onClose={handleCloseSearch}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mega Menu Overlay */}
      <AnimatePresence>
        {isMegaMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              onClick={closeMegaMenu}
            />
            
            {/* Mega Menu Content */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="fixed left-0 right-0 top-[72px] z-50 bg-background border-b shadow-soft"
              onMouseLeave={closeMegaMenu}
            >
              <div className="container px-4 md:px-6 py-6">
                <div className="grid lg:grid-cols-4 gap-6">
                  {/* Categories Grid */}
                  <div className="lg:col-span-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Shop by Category
                    </h3>
                    <ScrollArea className="max-h-[60vh]">
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {categoryTree.map((category, idx) => (
                          <motion.div
                            key={category.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                          >
                            <MegaMenuCategoryItem
                              category={category}
                              onClose={closeMegaMenu}
                              expandedCategory={expandedCategory}
                              setExpandedCategory={setExpandedCategory}
                            />
                          </motion.div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Promo Section */}
                  <div className="lg:border-l lg:pl-6">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Featured
                    </h3>
                    <div className="space-y-3">
                      {promoItems.map((promo) => (
                        <Link
                          key={promo.label}
                          to={promo.href}
                          onClick={closeMegaMenu}
                          className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <promo.icon className="w-5 h-5" />
                          </div>
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {promo.label}
                          </span>
                          <ArrowRight className="w-4 h-4 ml-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                        </Link>
                      ))}
                      
                      {/* CTA */}
                      <Link
                        to="/products"
                        onClick={closeMegaMenu}
                        className="block mt-4"
                      >
                        <Button className="w-full btn-organic gap-2">
                          View all products
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
