import { useState, useEffect, lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { CartProvider } from "@/contexts/CartContext";
import { CartAnimationProvider } from "@/contexts/CartAnimationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { WishlistProvider } from "@/contexts/WishlistContext";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Critical routes - loaded immediately
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Error boundary for lazy loaded routes
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[RouteErrorBoundary] Caught error:', error);
    console.error('[RouteErrorBoundary] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Oeps, er ging iets mis</h2>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || 'Er is een fout opgetreden bij het laden van de pagina.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button 
                onClick={() => window.location.reload()}
                variant="default"
              >
                Vernieuwen
              </Button>
              <Button 
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.history.back();
                }}
                variant="outline"
              >
                Terug
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy load heavy route components with error handling
const lazyWithRetry = (importFn: () => Promise<{ default: React.ComponentType }>) => {
  return lazy(async () => {
    try {
      console.log('[LazyLoad] Starting import...');
      const module = await importFn();
      console.log('[LazyLoad] Import successful');
      return module;
    } catch (error) {
      console.error('[LazyLoad] Import failed:', error);
      throw error;
    }
  });
};

const Products = lazyWithRetry(() => import("./pages/Products"));
const ProductDetail = lazyWithRetry(() => import("./pages/ProductDetail"));
const Cart = lazyWithRetry(() => import("./pages/Cart"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout"));
const PaymentSuccess = lazyWithRetry(() => import("./pages/PaymentSuccess"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Wishlist = lazyWithRetry(() => import("./pages/Wishlist"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Orders = lazyWithRetry(() => import("./pages/Orders"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const About = lazyWithRetry(() => import("./pages/About"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const ReturnPolicy = lazyWithRetry(() => import("./pages/ReturnPolicy"));
const CookiePolicy = lazyWithRetry(() => import("./pages/CookiePolicy"));
const Contact = lazyWithRetry(() => import("./pages/Contact"));
const Shipping = lazyWithRetry(() => import("./pages/Shipping"));
const FAQ = lazyWithRetry(() => import("./pages/FAQ"));
const TrackOrder = lazyWithRetry(() => import("./pages/TrackOrder"));
const BestsellerDetail = lazyWithRetry(() => import("./pages/BestsellerDetail"));
const LiveMap = lazyWithRetry(() => import("./pages/LiveMap"));
const Blog = lazyWithRetry(() => import("./pages/Blog"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const Sitemap = lazyWithRetry(() => import("./pages/Sitemap"));

const queryClient = new QueryClient();

// Route loading fallback component
const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex items-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span>Loading...</span>
    </div>
  </div>
);

const App = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial load time for assets
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <CartProvider>
            <CartAnimationProvider>
              <WishlistProvider>
                <AnimatePresence mode="wait">
                  {isLoading && <LoadingScreen key="loading" />}
                </AnimatePresence>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <RouteErrorBoundary>
                    <Suspense fallback={<RouteLoader />}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/products" element={<Products />} />
                        <Route path="/product/:id" element={<ProductDetail />} />
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/payment-success" element={<PaymentSuccess />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/wishlist" element={<Wishlist />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/install" element={<Install />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/terms" element={<TermsOfService />} />
                        <Route path="/returns" element={<ReturnPolicy />} />
                        <Route path="/cookies" element={<CookiePolicy />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="/shipping" element={<Shipping />} />
                        <Route path="/faq" element={<FAQ />} />
                        <Route path="/track" element={<TrackOrder />} />
                        <Route path="/bestseller/:slug" element={<BestsellerDetail />} />
                        <Route path="/live-map" element={<LiveMap />} />
                        <Route path="/blog" element={<Blog />} />
                        <Route path="/blog/:slug" element={<BlogPost />} />
                        <Route path="/sitemap.xml" element={<Sitemap />} />
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </RouteErrorBoundary>
                </BrowserRouter>
              </WishlistProvider>
            </CartAnimationProvider>
          </CartProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
