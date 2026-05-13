import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  TrendingUp,
  Target,
  Brain,
  Zap,
  LineChart,
  BarChart3,
  FileText,
  BookOpen,
  Link,
  Stethoscope,
  Globe,
  Activity,
  ShieldAlert,
  Package,
  LayoutDashboard,
  Gauge,
  Search,
  Layers,
  Filter,
  Video,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';

const sections = [
  {
    title: 'Growth & SEO',
    items: [
      { to: '/admin/growth-execution', label: 'SEO Growth Engine V4', icon: TrendingUp, desc: 'Full pipeline: crawl, GSC sync, ranking push' },
      { to: '/admin/seo-command-center', label: 'SEO Command Center', icon: Target, desc: 'Top 10 assault & gap hunter' },
      { to: '/admin/autonomous-seo', label: 'Autonomous SEO AI', icon: Brain, desc: 'Enterprise autonomous system' },
      { to: '/admin/seo-dashboard', label: 'SEO Decision Engine', icon: Zap, desc: 'Monitoring & alerts' },
      { to: '/admin/seo-intelligence', label: 'SEO Intelligence V8', icon: LineChart, desc: 'Advanced analytics & insights' },
      { to: '/admin/seo-monitor', label: 'SEO Monitor', icon: Search, desc: 'Real-time rank tracking' },
    ],
  },
  {
    title: 'Commerce & Analytics',
    items: [
      { to: '/admin/profit-system', label: 'Profit System', icon: Target, desc: 'Winners / Potential / Losers + Ads export' },
      { to: '/admin/commerce-intelligence', label: 'Commerce Intelligence', icon: BarChart3, desc: 'Demand, pricing & ads' },
      { to: '/admin/analytics-hub', label: 'Analytics Hub', icon: Gauge, desc: 'Traffic & conversion data' },
      { to: '/admin/cta-copy-performance', label: 'CTA Copy Performance', icon: Target, desc: '/go CTA CTR per placement × variant' },
      { to: '/admin/tiktok-realtime-funnel', label: 'TikTok Realtime Funnel', icon: Activity, desc: 'Live TikTok sessions → cart → checkout met conversie %' },
      { to: '/admin/cinematic-ads', label: 'Cinematic Ads', icon: Video, desc: 'AI-generated product promo videos voor Pinterest, TikTok & IG Reels' },
      { to: '/admin/utm-validation-log', label: 'UTM Validation Log', icon: ShieldAlert, desc: 'Per sessie UTMs valideren — detecteert ontbrekende/foutieve params' },
      { to: '/admin/tracking-anomalies', label: 'Tracking Anomalies', icon: ShieldAlert, desc: 'Sessies met events die niet correleren (orphan cart/checkout, mismatches)' },
      { to: '/admin/utm-conversion-events', label: 'UTM × Conversions', icon: ShieldAlert, desc: 'Per add_to_cart en checkout de UTM-set van die sessie' },
      { to: '/admin/tracking-alerts-history', label: 'Tracking Alerts History', icon: Activity, desc: 'Per alert: 24u current vs baseline en laatste event-tijdstip' },
      { to: '/admin/monitoring-runs', label: 'Monitoring Runs', icon: Activity, desc: 'Audit-log heartbeat-runs met filters op datum, function en status' },
      { to: '/admin/events-live', label: 'Events Live', icon: Activity, desc: 'Per-uur add_to_cart / begin_checkout / purchase, gesplitst internal vs external' },
      { to: '/admin/funnel-by-source', label: 'Funnel by Source', icon: Filter, desc: 'view_item → add_to_cart → begin_checkout → purchase per UTM-bron met drop-off %' },
      { to: '/admin/revenue-scaling', label: 'Revenue Scaling', icon: TrendingUp, desc: '12-month blueprint' },
      { to: '/dashboard', label: 'Product Manager', icon: Package, desc: 'Products, orders, CJ tools' },
      { to: '/admin/winners-boost', label: 'Winners Auto-Boost', icon: TrendingUp, desc: 'Top products & homepage promotion' },
      { to: '/admin/shopping-optimizer', label: 'Shopping Traffic Engine', icon: Zap, desc: 'Optimize product data for Google Shopping' },
    ],
  },
  {
    title: 'Content & Links',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: FileText, desc: 'Internal reports & documents' },
      { to: '/admin/guides', label: 'Guides SEO', icon: BookOpen, desc: 'Guide rankings dashboard' },
      { to: '/admin/internal-link-log', label: 'Internal Link Log', icon: Link, desc: 'Link injection health' },
      { to: '/admin/content-opportunities', label: 'Content Opportunities', icon: Layers, desc: 'Content gap analysis' },
      { to: '/admin/backlink-engine', label: 'Backlink Engine', icon: Link, desc: 'Backlink domination' },
    ],
  },
  {
    title: 'Technical & Health',
    items: [
      { to: '/admin/diagnostics', label: 'Site Diagnostics', icon: Stethoscope, desc: 'Export bundle & checks' },
      { to: '/admin/domain-health', label: 'Domain Health', icon: Globe, desc: 'Redirect chain checker' },
      { to: '/admin/perf-audit', label: 'Performance Audit', icon: Activity, desc: 'LCP, bundle size, CWV' },
      { to: '/admin/crawl-health', label: 'Crawl Health', icon: Stethoscope, desc: 'Crawler monitoring' },
      { to: '/admin/edge-diagnostics', label: 'Edge Diagnostics', icon: Activity, desc: 'Edge function health' },
      { to: '/admin/sitemap-ping', label: 'Sitemap Ping', icon: Activity, desc: 'Google & Bing ping' },
      { to: '/admin/crawler-sample-rate', label: 'Crawler Sample Rate', icon: Gauge, desc: 'Tune crawler_visits log sampling (0–1)' },
      { to: '/admin/crawler-sampling-decisions', label: 'Sampling Decisions', icon: Search, desc: 'Why each crawler-visit was kept or sampled out' },
      { to: '/admin/security-credentials', label: 'Security & Credentials', icon: ShieldAlert, desc: 'API key management' },
      { to: '/admin/integrations/merchant/health', label: 'Merchant Health', icon: ShieldAlert, desc: 'Anti-suspension shield' },
      { to: '/admin/rejected-spam-events', label: 'Rejected Spam Events', icon: ShieldAlert, desc: 'Quarantined analytics & Pinterest payloads' },
    ],
  },
];

export default function AdminDashboardOverview() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: / to focus search (not when typing in another field)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setQuery('');
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const allItems = useMemo(() => {
    return sections.flatMap((s) => s.items.map((i) => ({ ...i, sectionTitle: s.title })));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null; // null = show all sections normally
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.to.toLowerCase().includes(q) ||
        item.sectionTitle.toLowerCase().includes(q)
    );
  }, [query, allItems]);

  const hasResults = !filtered || filtered.length > 0;

  return (
    <>
      <Helmet>
        <title>Admin Dashboard | GetPawsy</title>
      </Helmet>
      <div className="container py-8 space-y-8 max-w-6xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Centraal overzicht van alle admin tools en dashboards.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Zoek admin tools…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-8"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Wis zoekopdracht"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {!query && (
              <span className="hidden sm:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border border-muted rounded px-1.5 py-0.5">
                /
              </span>
            )}
          </div>
        </div>

        {/* Prominent Cinematic Ads shortcut */}
        {!query.trim() && (
          <Card
            className="cursor-pointer border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10 hover:shadow-md hover:border-primary/50 transition-all group"
            onClick={() => navigate('/admin/cinematic-ads')}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Cinematic Ads
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    AI-generated product promo videos voor Pinterest, TikTok & IG Reels
                  </p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5 shrink-0">
                Ga naar Cinematic Ads
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Search results view */}
        {query.trim() && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {hasResults ? `Resultaten voor "${query.trim()}"` : 'Geen resultaten'}
            </h2>
            {hasResults ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered!.map((item) => (
                  <Card
                    key={item.to}
                    className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group"
                    onClick={() => navigate(item.to)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.desc}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{item.sectionTitle}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Probeer een andere zoekterm.</p>
            )}
          </div>
        )}

        {/* Default section view */}
        {!query.trim() &&
          sections.map((section) => (
            <div key={section.title}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {section.title}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {section.items.map((item) => (
                  <Card
                    key={item.to}
                    className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group"
                    onClick={() => navigate(item.to)}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
