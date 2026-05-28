import { Link, useLocation, useNavigate } from 'react-router-dom';
// ── Lucide: per-icon deep imports — eliminates full lucide barrel from critical chunk ──
import ShoppingCart from 'lucide-react/dist/esm/icons/shopping-cart';
import Search from 'lucide-react/dist/esm/icons/search';
import User from 'lucide-react/dist/esm/icons/user';
import LogOut from 'lucide-react/dist/esm/icons/log-out';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Pin from 'lucide-react/dist/esm/icons/pin';
import Video from 'lucide-react/dist/esm/icons/video';
import Heart from 'lucide-react/dist/esm/icons/heart';
import X from 'lucide-react/dist/esm/icons/x';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import Gift from 'lucide-react/dist/esm/icons/gift';
import Truck from 'lucide-react/dist/esm/icons/truck';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Award from 'lucide-react/dist/esm/icons/award';
import Trophy from 'lucide-react/dist/esm/icons/trophy';
import Star from 'lucide-react/dist/esm/icons/star';
import { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
// framer-motion removed — CSS animations used instead (perf: critical path, saves ~60KB gzip)
import { traceMount, traceEffect, traceStateSet } from '@/lib/lcp-render-trace';
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
const EnhancedSearch = lazy(() => import('@/components/search/EnhancedSearch').then(m => ({ default: m.EnhancedSearch })));
import { AnimatedHamburger } from '@/components/ui/animated-hamburger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FloatingCartPreview } from '@/components/cart/FloatingCartPreview';
import { buildCategoryTree, type CategoryTreeNode } from '@/lib/canonical-category-registry';
import logoIcon from '@/assets/logo-getpawsy.png';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { getConversionFlag } from '@/lib/conversionFlags';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/collections/dogs', label: 'Dogs' },
  { href: '/collections/dog-beds', label: 'Dog Beds' },
  { href: '/collections/cats', label: 'Cats' },
  { href: '/collections/cat-trees-and-condos', label: 'Cat Trees' },
  { href: '/collections/cat-litter-boxes', label: 'Litter Boxes' },
  { href: '/guides', label: 'Guides' },
  { href: '/contact', label: 'Contact' },
];

const promoItems = [
  { label: 'Free Shipping', icon: Truck, href: '/products' },
  { label: 'New Arrivals', icon: Gift, href: '/products' },
];

// Category item component for mega menu (uses canonical registry)
const MegaMenuCategoryItem = ({ 
  category, 
  onClose,
  expandedCategory,
  setExpandedCategory
}: { 
  category: CategoryTreeNode; 
  onClose: () => void;
  expandedCategory: string | null;
  setExpandedCategory: (id: string | null) => void;
}) => {
  const hasChildren = category.children.length > 0;
  const isExpanded = expandedCategory === category.key;

  return (
    <div className="relative">
      <div 
        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer group"
        onClick={() => {
          if (hasChildren) {
            setExpandedCategory(isExpanded ? null : category.key);
          }
        }}
        onMouseEnter={() => {
          if (hasChildren) {
            setExpandedCategory(category.key);
          }
        }}
      >
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-primary/10 flex items-center justify-center text-lg">
          {category.icon || '📦'}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            to={category.url}
            onClick={(e) => {
              if (!hasChildren) {
                onClose();
              } else {
                e.preventDefault();
              }
            }}
            className="font-medium text-foreground group-hover:text-primary transition-colors block truncate"
          >
            {category.label}
          </Link>
        </div>
        {hasChildren && (
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        )}
      </div>

      {/* Subcategories dropdown */}
      {hasChildren && isExpanded && (
        <div className="pl-4 overflow-hidden animate-[slideDown_0.2s_ease-out]">
          <div className="border-l-2 border-muted pl-2 py-1 space-y-1">
            <Link
              to={category.url}
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-primary font-medium"
            >
              All {category.label}
              <ArrowRight className="w-3 h-3" />
            </Link>
            {category.children.map((child) => (
              <Link
                key={child.key}
                to={child.url}
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-sm">{child.icon || '📦'}</span>
                <span className="truncate">{child.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Mobile category item with accordion (uses canonical registry)
const MobileCategoryItem = ({ 
  category, 
  onClose 
}: { 
  category: CategoryTreeNode; 
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
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-primary/10 flex items-center justify-center text-lg">
          {category.icon || '📦'}
        </div>
        <div className="flex-1 min-w-0">
          {hasChildren ? (
            <span className="font-medium">{category.label}</span>
          ) : (
            <Link
              to={category.url}
              onClick={onClose}
              className="font-medium block"
            >
              {category.label}
            </Link>
          )}
        </div>
        {hasChildren && (
          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="overflow-hidden bg-muted/30 animate-[slideDown_0.2s_ease-out]">
          <div className="py-2 px-4 space-y-1">
            <Link
              to={category.url}
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-primary font-medium hover:bg-muted transition-colors"
            >
              All {category.label}
              <ArrowRight className="w-3 h-3" />
            </Link>
            {category.children.map((child) => (
              <Link
                key={child.key}
                to={child.url}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
              >
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-sm">{child.icon || '📦'}</span>
                <span className="truncate flex-1">{child.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const Navbar = () => {
  traceMount('Navbar');                              // ← exact mount timestamp

  const { totalItems } = useCart();
  const cartIconRef = useCartIconRef();
  const { user, isAdmin, signOut } = useAuth();
  const { wishlist } = useWishlist();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isCartPreviewOpen, setIsCartPreviewOpen] = useState(false);
  // CI-11: hide-on-scroll-down / reveal-on-scroll-up. Gated behind
  // `premiumNav` so it can be flipped off instantly.
  const scrollDir = useScrollDirection(8);
  const premiumNav = getConversionFlag('premiumNav');
  const premiumMobileNavV2 = getConversionFlag('premiumMobileNavV2');
  const isHidden =
    premiumNav &&
    scrollDir === 'down' &&
    isScrolled &&
    !isMobileMenuOpen &&
    !isMegaMenuOpen &&
    !isSearchOpen &&
    typeof window !== 'undefined' &&
    window.scrollY > 120;
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(() => {
    return localStorage.getItem('promo-banner-dismissed') === 'true';
  });
  const location = useLocation();
  const navigate = useNavigate();

  // Category tree from canonical registry — no DB query needed
  const categoryTree = useMemo(() => buildCategoryTree('menu'), []);

  // ── Effect 1: scroll listener (fires immediately on mount) ──────────────
  useEffect(() => {
    traceEffect('Navbar', 'scroll-listener setup');
    const handleScroll = () => {
      // Only log state changes, not every scroll event
      setIsScrolled(prev => {
        const next = window.scrollY > 20;
        if (prev !== next) traceStateSet('Navbar', 'isScrolled', next);
        return next;
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Effect 2: close mega menu on route change ────────────────────────────
  useEffect(() => {
    traceEffect('Navbar', 'route-change-close-menu');
    traceStateSet('Navbar', 'isMegaMenuOpen+isSearchOpen', false);
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
      {/* Promo Banner — fixed height to prevent CLS on dismiss */}
      <div
        className="bg-primary text-primary-foreground text-sm font-medium overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
        style={{
          maxHeight: isBannerDismissed ? 0 : 40,
          opacity: isBannerDismissed ? 0 : 1,
        }}
        aria-hidden={isBannerDismissed}
      >
        <div className="container flex items-center justify-center gap-2 py-2 px-4 relative" style={{ height: 40 }}>
          <Truck className="w-4 h-4" />
          <span>Free shipping on eligible orders over $35</span>
          <span className="hidden sm:inline text-primary-foreground/80">•</span>
          <span className="hidden sm:inline text-primary-foreground/80">Estimated delivery: 5–10 business days</span>
          <button
            onClick={dismissBanner}
            className="absolute right-4 p-1 hover:bg-primary-foreground/20 rounded-full transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <header 
        className={`sticky top-0 z-50 w-full max-w-[100vw] overflow-x-hidden transition-[transform,background-color,box-shadow] duration-300 ease-out ${
          isScrolled 
            ? 'bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-[0_1px_0_0_hsl(var(--border)/0.4)]' 
            : 'bg-background/80 backdrop-blur-lg'
        } ${isHidden ? '-translate-y-full' : 'translate-y-0'}`}
      >
        <div className="container flex h-18 items-center justify-between px-4 md:px-6 py-3 max-w-full">
          {/* Logo */}
          <Link 
            to="/" 
            className="flex items-center gap-3 font-bold text-xl group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="GetPawsy — go to homepage"
          >
            <div 
              className="flex items-center justify-center w-11 h-11 rounded-2xl overflow-hidden shadow-soft transition-transform duration-200 hover:scale-105 hover:-rotate-[5deg] active:scale-95"
              aria-hidden="true"
            >
              <img src={logoIcon} alt="" width={44} height={44} className="w-full h-full object-cover" />
            </div>
            <span className="font-display text-foreground text-xl sm:text-2xl" aria-hidden="true">
              Get<span className="text-primary">Pawsy</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-full flex items-center gap-1.5 ${
                  isActive(link.href) 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {/* Categories Mega Menu Trigger */}
            <button
              onMouseEnter={() => setIsMegaMenuOpen(true)}
              onClick={() => setIsMegaMenuOpen(!isMegaMenuOpen)}
              aria-haspopup="true"
              aria-expanded={isMegaMenuOpen}
              className={`flex items-center gap-1 px-4 py-2 text-sm font-medium transition-colors rounded-full ${
                isMegaMenuOpen
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              More
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isMegaMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
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
              aria-label={isSearchOpen ? 'Close search' : 'Open search'}
              aria-expanded={isSearchOpen}
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Button>

            {/* Wishlist */}
            <Link
              to="/wishlist"
              className="hidden sm:block"
              aria-label={wishlist.length > 0 ? `Wishlist (${wishlist.length} items)` : 'Wishlist'}
            >
              <Button variant="ghost" size="icon" className="relative rounded-full" tabIndex={-1} aria-hidden="true">
                <Heart className={`h-5 w-5 transition-colors ${wishlist.length > 0 ? 'fill-accent text-accent' : ''}`} aria-hidden="true" />
                {wishlist.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full bg-accent text-accent-foreground" aria-hidden="true">
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
              <Link
                to="/cart"
                aria-label={totalItems > 0 ? `Shopping cart (${totalItems} items)` : 'Shopping cart'}
              >
                <div ref={cartIconRef as React.RefObject<HTMLDivElement>}>
                  <Button variant="ghost" size="icon" className="relative rounded-full" tabIndex={-1} aria-hidden="true">
                    <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                    {totalItems > 0 && (
                      <div key={totalItems} className="animate-[scaleIn_0.2s_ease-out]">
                        <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full" aria-hidden="true">
                          {totalItems}
                        </Badge>
                      </div>
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
            <Link
              to="/cart"
              className="sm:hidden"
              aria-label={totalItems > 0 ? `Shopping cart (${totalItems} items)` : 'Shopping cart'}
            >
              <div ref={cartIconRef as React.RefObject<HTMLDivElement>}>
                <Button variant="ghost" size="icon" className="relative rounded-full" tabIndex={-1} aria-hidden="true">
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                  {totalItems > 0 && (
                    <div key={totalItems} className="animate-[scaleIn_0.2s_ease-out]">
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full" aria-hidden="true">
                        {totalItems}
                      </Badge>
                    </div>
                  )}
                </Button>
              </div>
            </Link>

            {/* Account */}
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full hidden sm:flex" aria-label="My account">
                    <User className="h-5 w-5" aria-hidden="true" />
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
                      <Link to="/admin/growth-execution" className="flex items-center gap-2 cursor-pointer">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="mobile-nav"
                >
                  <AnimatedHamburger isOpen={isMobileMenuOpen} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className={premiumMobileNavV2 ? 'w-[330px] p-0 bg-background border-l border-border/60' : 'w-[320px] p-0 bg-background'}>
                <div className="flex flex-col h-full">
                  <div className={premiumMobileNavV2 ? 'px-6 py-5 border-b border-border/50' : 'p-6 border-b bg-muted/30'}>
                    {premiumMobileNavV2 && (
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
                        Menu
                      </p>
                    )}
                    <span className={premiumMobileNavV2 ? 'font-display text-lg font-semibold tracking-tight' : 'font-display text-xl'}>
                      Get<span className="text-primary">Pawsy</span>
                    </span>
                  </div>
                  
                  {/* Mobile Search */}
                  <div className={premiumMobileNavV2 ? 'p-4 border-b border-border/50' : 'p-4 border-b'}>
                    <EnhancedSearch
                      variant="navbar"
                      placeholder="Search products..."
                      onClose={() => setIsMobileMenuOpen(false)}
                    />
                  </div>

                  <ScrollArea className="flex-1">
                    <nav className="p-4">
                      {premiumMobileNavV2 && (
                        <p className="px-4 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-2">
                          Browse
                        </p>
                      )}
                      <div className="flex flex-col gap-1 mb-4">
                        {navLinks.map((link) => (
                          <SheetClose asChild key={link.href}>
                            <Link
                              to={link.href}
                              className={`px-4 ${premiumMobileNavV2 ? 'py-2.5 text-[15px] font-medium' : 'py-3 text-lg font-medium'} rounded-xl transition-colors ${
                                isActive(link.href)
                                  ? 'text-primary bg-primary/10'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              {link.label}
                            </Link>
                          </SheetClose>
                        ))}
                        
                        {/* Admin link — only for admins */}
                        {user && isAdmin && (
                          <>
                            <SheetClose asChild>
                              <Link
                                to="/admin/growth-execution"
                                className={`px-4 py-3 text-lg font-medium rounded-xl transition-colors flex items-center gap-3 ${
                                  isActive('/admin')
                                    ? 'text-primary bg-primary/10'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <Shield className="h-5 w-5" />
                                Admin Dashboard
                              </Link>
                            </SheetClose>
                            <SheetClose asChild>
                              <Link
                                to="/admin/pinterest-automation"
                                className={`px-4 py-3 text-lg font-medium rounded-xl transition-colors flex items-center gap-3 ${
                                  isActive('/admin/pinterest-automation')
                                    ? 'text-primary bg-primary/10'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <Pin className="h-5 w-5" />
                                Pinterest Auto
                              </Link>
                            </SheetClose>
                            <SheetClose asChild>
                              <Link
                                to="/admin/tiktok-automation"
                                className={`px-4 py-3 text-lg font-medium rounded-xl transition-colors flex items-center gap-3 ${
                                  isActive('/admin/tiktok-automation')
                                    ? 'text-primary bg-primary/10'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <Video className="h-5 w-5" />
                                TikTok Auto
                              </Link>
                            </SheetClose>
                          </>
                        )}
                      </div>



                      {/* Mobile Categories */}
                      <div className="mb-2">
                        <p className={`px-4 ${premiumMobileNavV2 ? 'text-[10px] font-medium tracking-[0.22em]' : 'text-xs font-semibold tracking-wider'} text-muted-foreground uppercase mb-2`}>
                          Categories
                        </p>
                      </div>
                      <div className={premiumMobileNavV2 ? 'rounded-xl border border-border/50 bg-card overflow-hidden' : 'rounded-xl border bg-card overflow-hidden'}>
                        {categoryTree.map((category) => (
                          <MobileCategoryItem
                            key={category.key}
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
                  
                  <div className={premiumMobileNavV2 ? 'p-4 border-t border-border/50' : 'p-4 border-t bg-muted/30'}>
                    {premiumMobileNavV2 && (
                      <p className="px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
                        Account
                      </p>
                    )}
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
                          <>
                            <SheetClose asChild>
                              <Link to="/dashboard" className="block">
                                <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                                  <Shield className="h-4 w-4" />
                                  Admin Dashboard
                                </Button>
                              </Link>
                            </SheetClose>
                            <SheetClose asChild>
                              <Link to="/admin/pinterest-automation" className="block">
                                <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                                  <Pin className="h-4 w-4" />
                                  Pinterest Auto
                                </Button>
                              </Link>
                            </SheetClose>
                            <SheetClose asChild>
                              <Link to="/admin/tiktok-automation" className="block">
                                <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                                  <Video className="h-4 w-4" />
                                  TikTok Auto
                                </Button>
                              </Link>
                            </SheetClose>
                          </>
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
        {isSearchOpen && (
          <div className="container px-4 md:px-6 pb-4 animate-[fadeSlideDown_0.2s_ease-out]">
            <div className="relative max-w-2xl mx-auto">
              <Suspense fallback={<div className="h-10 rounded-lg bg-muted animate-pulse" />}>
                <EnhancedSearch
                  variant="default"
                  placeholder="What are you looking for?"
                  autoFocus
                  onClose={handleCloseSearch}
                />
              </Suspense>
            </div>
          </div>
        )}
      </header>

      {/* Mega Menu Overlay */}
      {isMegaMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-[fadeIn_0.2s_ease-out]"
            onClick={closeMegaMenu}
          />
          
          {/* Mega Menu Content */}
          <div
            className="fixed left-0 right-0 top-[72px] z-50 bg-background border-b shadow-soft animate-[fadeSlideDown_0.2s_ease-out]"
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
                        <div
                          key={category.key}
                          className="animate-[fadeSlideUp_0.3s_ease-out_both]"
                          style={{ animationDelay: `${idx * 30}ms` }}
                        >
                          <MegaMenuCategoryItem
                            category={category}
                            onClose={closeMegaMenu}
                            expandedCategory={expandedCategory}
                            setExpandedCategory={setExpandedCategory}
                          />
                        </div>
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
          </div>
        </>
      )}
    </>
  );
};
