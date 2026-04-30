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
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

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
    ],
  },
];

export default function AdminDashboardOverview() {
  const navigate = useNavigate();

  return (
    <>
      <Helmet>
        <title>Admin Dashboard | GetPawsy</title>
      </Helmet>
      <div className="container py-8 space-y-8 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centraal overzicht van alle admin tools en dashboards.
          </p>
        </div>

        {sections.map((section) => (
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
