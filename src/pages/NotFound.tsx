import { useLocation, Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { Home, Search, BookOpen, ShoppingBag, HelpCircle, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConversionFlag } from "@/lib/conversionFlags";

function log404(pathname: string, referrer: string) {
  try {
    const key = "__404_log";
    const existing: Array<{ path: string; ref: string; ts: string }> = JSON.parse(localStorage.getItem(key) || "[]");
    existing.unshift({ path: pathname, ref: referrer, ts: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // non-critical
  }
}

const SUGGESTED_LINKS = [
  { label: "All Products", href: "/products", icon: ShoppingBag },
  { label: "Best Cat Litter Boxes", href: "/collections/cat-litter-boxes", icon: ShoppingBag },
  { label: "Dog Training Tools", href: "/collections/all", icon: ShoppingBag },
  { label: "All Guides", href: "/guides", icon: BookOpen },
  { label: "Help Center", href: "/help", icon: HelpCircle },
] as const;

const NotFound = () => {
  const location = useLocation();

  const isGuidePath = location.pathname.startsWith("/guides/");
  const isCollectionPath = location.pathname.startsWith("/collections/");
  const isProductPath = location.pathname.startsWith("/product/") || location.pathname.startsWith("/products/");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    log404(location.pathname, document.referrer);
  }, [location.pathname]);

  const contextMessage = useMemo(() => {
    if (isProductPath) {
      return "This product page may have moved or the product may no longer be available. Try browsing all products or one of the collections below.";
    }
    if (isGuidePath) {
      return "This guide may have been moved or consolidated into another article.";
    }
    if (isCollectionPath) {
      return "This collection may have been reorganized. Try one of these popular destinations.";
    }
    return "The page you're looking for doesn't exist or has been moved.";
  }, [isGuidePath, isCollectionPath, isProductPath]);

  return (
    <Layout>
      <Helmet>
        <title>404 - Page Not Found | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="prerender-status-code" content="404" />
      </Helmet>

      {getConversionFlag('premiumNotFound') ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center max-w-xl mx-auto px-4">
            <div className="w-14 h-14 mx-auto mb-6 rounded-full border border-border/60 flex items-center justify-center">
              <Compass className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
            </div>

            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground mb-3">
              404 · Page not found
            </p>

            <h1 className="mb-4 text-3xl md:text-4xl font-display font-semibold tracking-tight text-foreground">
              We couldn't find that page
            </h1>

            <p className="mb-8 text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
              {contextMessage}
            </p>

            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {SUGGESTED_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 text-xs text-foreground hover:bg-muted/50 transition-colors"
                >
                  <link.icon className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/">
                <Button className="gap-2 rounded-full">
                  <Home className="w-4 h-4" />
                  Return home
                </Button>
              </Link>
              <Link to="/products">
                <Button variant="outline" className="gap-2 rounded-full">
                  <Search className="w-4 h-4" />
                  Browse products
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center max-w-lg mx-auto px-4">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
            <span className="text-4xl">🐾</span>
          </div>

          <h1 className="mb-3 text-3xl font-display font-bold text-foreground">Page Not Found</h1>

          <p className="mb-6 text-muted-foreground leading-relaxed">{contextMessage}</p>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {SUGGESTED_LINKS.map((link) => (
              <Link key={link.href} to={link.href}>
                <Button variant="outline" size="sm" className="gap-2">
                  <link.icon className="w-3.5 h-3.5" />
                  {link.label}
                </Button>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/">
              <Button className="gap-2">
                <Home className="w-4 h-4" />
                Return to Home
              </Button>
            </Link>

            <Link to="/products">
              <Button variant="secondary" className="gap-2">
                <Search className="w-4 h-4" />
                Browse Products
              </Button>
            </Link>
          </div>
        </div>
      </div>
      )}
    </Layout>
  );
};

export default NotFound;
