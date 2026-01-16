import { useState, useEffect } from "react";
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
import Index from "./pages/Index";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import PaymentSuccess from "./pages/PaymentSuccess";
import Admin from "./pages/Admin";
import Auth from "./pages/Auth";
import Wishlist from "./pages/Wishlist";
import Profile from "./pages/Profile";
import Install from "./pages/Install";
import Orders from "./pages/Orders";
import About from "./pages/About";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ReturnPolicy from "./pages/ReturnPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import Contact from "./pages/Contact";
import Shipping from "./pages/Shipping";
import FAQ from "./pages/FAQ";
import TrackOrder from "./pages/TrackOrder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
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
