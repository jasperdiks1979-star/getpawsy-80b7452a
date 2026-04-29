import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  Target,
  Brain,
  Stethoscope,
  Globe,
  BarChart3,
  ShieldAlert,
  Link,
  LineChart,
  Pin,
  Zap,
  BookOpen,
  Activity,
  Apple,
  Menu,
  X,
  History,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BUILD_ID } from '@/lib/boot-diagnostics';
import { useState, useEffect } from 'react';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/growth-execution', label: 'SEO Growth V4', icon: TrendingUp },
  { to: '/admin/seo-command-center', label: 'SEO Command', icon: Target },
  { to: '/admin/autonomous-seo', label: 'Autonomous SEO', icon: Brain },
  { to: '/admin/seo-agent-auto', label: 'SEO Agent AI', icon: Activity },
  { to: '/admin/seo-engine', label: 'SEO Engine Auto', icon: Zap },
  { to: '/admin/seo-dashboard', label: 'SEO Engine', icon: Zap },
  { to: '/admin/seo-intelligence', label: 'SEO Intelligence', icon: LineChart },
  { to: '/admin/commerce-intelligence', label: 'Commerce Intel', icon: BarChart3 },
  { to: '/admin/reports', label: 'Reports', icon: FileText },
  { to: '/admin/page-changelog', label: 'Page Changelog', icon: History },
  { to: '/admin/guides', label: 'Guides SEO', icon: BookOpen },
  { to: '/admin/internal-link-log', label: 'Internal Links', icon: Link },
  { to: '/admin/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { to: '/admin/domain-health', label: 'Domain Health', icon: Globe },
  { to: '/admin/perf-audit', label: 'Performance', icon: Activity },
  { to: '/admin/security-credentials', label: 'Security', icon: ShieldAlert },
  { to: '/admin/integrations/merchant', label: 'Merchant Center', icon: Globe },
  { to: '/admin/integrations/merchant/readiness', label: 'Merchant Readiness', icon: ShieldAlert },
  { to: '/admin/integrations/merchant/health', label: 'Merchant Health', icon: ShieldAlert },
  { to: '/admin/integrations/stripe/apple-pay', label: 'Apple Pay Domain', icon: Apple },
  { to: '/admin/product-optimizer', label: 'AI Product Optimizer', icon: Zap },
  { to: '/admin/pinterest-automation', label: 'Pinterest Auto', icon: Pin },
  { to: '/admin/tiktok-automation', label: 'TikTok Auto', icon: Activity },
  { to: '/admin/tiktok-ads-performance', label: 'TikTok Ads Perf', icon: TrendingUp },
  { to: '/admin/tiktok-funnel-debug', label: 'TikTok Funnel Debug', icon: Activity },
  { to: '/admin/tiktok-excluded-sessions', label: 'TikTok Excluded Sessions', icon: ShieldAlert },
  { to: '/admin/tiktok-session-decision-log', label: 'TikTok Decision Log', icon: ShieldAlert },
  { to: '/admin/job-retry-policies', label: 'Job Retry Policies', icon: Wrench },
  { to: '/admin/job-retry-metrics', label: 'Job Retry Metrics', icon: Activity },
];

/**
 * Admin shell — sidebar nav (desktop) + hamburger (mobile) + <Outlet />.
 * Does NOT use storefront <Layout>. No Navbar, Footer, popups, or marketing widgets.
 * This prevents click-blocking overlays from marketing components.
 */
export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen flex bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-56 border-r border-border bg-card shrink-0">
          <div className="p-4 border-b border-border">
            <NavLink to="/admin" className="text-sm font-bold text-foreground hover:text-primary transition-colors">
              GetPawsy Admin
            </NavLink>
          </div>
          <ScrollArea className="flex-1 py-2">
            <nav className="space-y-0.5 px-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
          <div className="p-3 border-t border-border">
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              Build: {BUILD_ID}
            </p>
            <NavLink to="/" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
              ← Back to store
            </NavLink>
          </div>
        </aside>

        {/* Mobile header */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <NavLink to="/admin" className="text-sm font-bold text-foreground">
              GetPawsy Admin
            </NavLink>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
              aria-label="Toggle admin navigation"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </header>

          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <>
              <div
                className="lg:hidden fixed inset-0 z-40 bg-black/30"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="lg:hidden fixed top-0 left-0 bottom-0 w-64 z-50 bg-card border-r border-border">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-bold">Admin Nav</span>
                  <button onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-accent">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ScrollArea className="flex-1 py-2 h-[calc(100vh-60px)]">
                  <nav className="space-y-0.5 px-2">
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-colors',
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          )
                        }
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </nav>
                </ScrollArea>
              </div>
            </>
          )}

          {/* Main content — admin pages render here via <Outlet /> */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
