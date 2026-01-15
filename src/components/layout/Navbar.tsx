import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, LogOut, Shield, Heart, X, ChevronDown, Dog, Cat, Bone, Sparkles, Gift, Truck, ArrowRight, Home, Sofa, Fish } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWishlist } from '@/contexts/WishlistContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SearchSuggestions } from '@/components/search/SearchSuggestions';
import { AnimatedHamburger } from '@/components/ui/animated-hamburger';
import logoIcon from '@/assets/logo-getpawsy.png';
import logoFull from '@/assets/logo-getpawsy-full.png';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop' },
];

const categoryItems = [
  { 
    href: '/products?category=Pet+Houses+%26+Cages', 
    label: 'Pet Houses & Cages', 
    icon: Home,
    description: 'Cozy homes for your pets',
    color: 'bg-amber-100 text-amber-600'
  },
  { 
    href: '/products?category=Pet+Furniture+Tools', 
    label: 'Pet Furniture', 
    icon: Sofa,
    description: 'Comfort and style',
    color: 'bg-purple-100 text-purple-600'
  },
  { 
    href: '/products?category=Cat+Trees+%26+Condos', 
    label: 'Cat Trees', 
    icon: Cat,
    description: 'Climbing & scratching fun',
    color: 'bg-pink-100 text-pink-600'
  },
  { 
    href: '/products?category=Dog+Stairs+%26+Steps', 
    label: 'Dog Stairs', 
    icon: Dog,
    description: 'Easy access for dogs',
    color: 'bg-emerald-100 text-emerald-600'
  },
  { 
    href: '/products?category=Pet+Snacks', 
    label: 'Pet Snacks', 
    icon: Bone,
    description: 'Tasty treats',
    color: 'bg-orange-100 text-orange-600'
  },
  { 
    href: '/products?category=Pet+Chase+Toys', 
    label: 'Toys', 
    icon: Sparkles,
    description: 'Hours of fun',
    color: 'bg-blue-100 text-blue-600'
  },
];

const promoItems = [
  { label: 'Free Shipping', icon: Truck, href: '/products' },
  { label: 'New Arrivals', icon: Gift, href: '/products?sort=newest' },
];

export const Navbar = () => {
  const { totalItems } = useCart();
  const { user, isAdmin, signOut } = useAuth();
  const { wishlist } = useWishlist();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsSearchOpen(false);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = () => {
    setSearchQuery('');
    setIsSearchOpen(false);
    setShowSuggestions(false);
  };

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href.split('?')[0]);
  };

  return (
    <>
      <header 
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          isScrolled 
            ? 'bg-background/95 backdrop-blur-xl shadow-soft border-b border-border/50' 
            : 'bg-background/80 backdrop-blur-lg'
        }`}
      >
        <div className="container flex h-18 items-center justify-between px-4 md:px-6 py-3">
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
            <span className="font-display text-foreground text-2xl hidden sm:block">
              Get<span className="text-primary">Pawsy</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors rounded-full ${
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

            {/* Cart */}
            <Link to="/cart">
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
                  {isAdmin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                        <Shield className="h-4 w-4" />
                        Admin Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
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
                    <form onSubmit={handleSearch}>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 rounded-xl"
                        />
                      </div>
                    </form>
                  </div>

                  <nav className="flex-1 p-4 overflow-y-auto">
                    <div className="flex flex-col gap-1">
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
                      
                      {/* Admin link - prominent in main nav for admins */}
                      {isAdmin && (
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
                          </Link>
                        </SheetClose>
                      )}
                      
                      {/* Mobile Categories */}
                      <div className="mt-4 mb-2">
                        <p className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Categories
                        </p>
                      </div>
                      {categoryItems.map((item) => (
                        <SheetClose asChild key={item.href}>
                          <Link
                            to={item.href}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors"
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                              <item.icon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-medium">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            </div>
                          </Link>
                        </SheetClose>
                      ))}
                      
                      <SheetClose asChild>
                        <Link
                          to="/wishlist"
                          className="mt-4 px-4 py-3 text-lg font-medium rounded-xl hover:bg-muted transition-colors flex items-center gap-3"
                        >
                          <Heart className={`h-5 w-5 ${wishlist.length > 0 ? 'fill-accent text-accent' : ''}`} />
                          Wishlist {wishlist.length > 0 && `(${wishlist.length})`}
                        </Link>
                      </SheetClose>
                    </div>
                  </nav>
                  
                  <div className="p-4 border-t bg-muted/30">
                    {user ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground px-2 truncate">{user.email}</p>
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
              <div ref={searchRef} className="relative max-w-2xl mx-auto">
                <form onSubmit={handleSearch}>
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
                  <Input
                    placeholder="What are you looking for?"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="h-12 pl-12 pr-12 rounded-2xl border-2 border-border/50 bg-muted/30 focus-visible:ring-primary focus-visible:border-primary"
                    autoFocus
                  />
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl z-10"
                    onClick={() => setIsSearchOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </form>
                <SearchSuggestions
                  query={searchQuery}
                  onSelect={handleSelectSuggestion}
                  isVisible={showSuggestions}
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
              onClick={() => setIsMegaMenuOpen(false)}
            />
            
            {/* Mega Menu Content */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="fixed left-0 right-0 top-[72px] z-50 bg-background border-b shadow-soft"
              onMouseLeave={() => setIsMegaMenuOpen(false)}
            >
              <div className="container px-4 md:px-6 py-8">
                <div className="grid lg:grid-cols-4 gap-8">
                  {/* Categories Grid */}
                  <div className="lg:col-span-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Shop per categorie
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {categoryItems.map((item, idx) => (
                        <motion.div
                          key={item.href}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <Link
                            to={item.href}
                            onClick={() => setIsMegaMenuOpen(false)}
                            className="flex flex-col items-center p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-all group hover:shadow-soft"
                          >
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${item.color} group-hover:scale-110 transition-transform`}>
                              <item.icon className="w-7 h-7" />
                            </div>
                            <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {item.label}
                            </p>
                            <p className="text-xs text-muted-foreground text-center mt-1">
                              {item.description}
                            </p>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Promo Section */}
                  <div className="lg:border-l lg:pl-8">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                      Uitgelicht
                    </h3>
                    <div className="space-y-3">
                      {promoItems.map((promo) => (
                        <Link
                          key={promo.label}
                          to={promo.href}
                          onClick={() => setIsMegaMenuOpen(false)}
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
                        onClick={() => setIsMegaMenuOpen(false)}
                        className="block mt-4"
                      >
                        <Button className="w-full btn-organic gap-2">
                          Bekijk alle producten
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
