import { useLocation, Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Layout } from "@/components/layout/Layout";
import { Home, Search, BookOpen, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Log 404 events for admin diagnostics (best-effort, non-blocking) */
function log404(pathname: string, referrer: string) {
  try {
    const key = `__404_log`;
    const existing: Array<{ path: string; ref: string; ts: string }> = JSON.parse(
      localStorage.getItem(key) || "[]"
    );
    existing.unshift({ path: pathname, ref: referrer, ts: new Date().toISOString() });
    // Keep last 100
    localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
  } catch {
    // non-critical
  }
}

const SUGGESTED_LINKS = [
  { label: "Dog Training Gear", href: "/collections/dog-leash-control", icon: ShoppingBag },
  { label: "Cat Essentials", href: "/collections/cat", icon: ShoppingBag },
  { label: "Dog Potty Training", href: "/collections/dog-potty-training", icon: ShoppingBag },
  { label: "All Guides", href: "/guides", icon: BookOpen },
  { label: "All Products", href: "/products", icon: Search },
];

const NotFound = () => {
  const location = useLocation();

  const isGuidePath = location.pathname.startsWith("/guides/");
  const isCollectionPath = location.pathname.startsWith("/collections/");

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    log404(location.pathname, document.referrer);
  }, [location.pathname]);

  const contextMessage = useMemo(() => {
    if (isGuidePath) return "This guide may have been moved or consolidated into another article.";
    if (isCollectionPath) return "This collection may have been reorganized. Try one of these popular collections:";
    return "The page you're looking for doesn't exist or has been moved.";
  }, [isGuidePath, isCollectionPath]);

  return (
    <Layout>
      <Helmet>
        <title>404 - Page Not Found | GetPawsy</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="prerender-status-code" content="404" />
      </Helmet>
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

          <Link to="/">
            <Button className="gap-2">
              <Home className="w-4 h-4" />
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
