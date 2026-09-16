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
  History,
  Wrench,
  Gauge,
  Video,
  Sparkles,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface AdminNavSection {
  id: string;
  title: string;
  items: AdminNavItem[];
}

/**
 * Admin information architecture (Batch D).
 *
 * One flat list of 60 links was unnavigable and hid duplicates. The links
 * themselves are unchanged — every `to` must resolve to a real route in
 * src/App.tsx — but they are grouped by the job the admin is doing, and each
 * path may appear exactly once across all sections.
 */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/admin/revenue-command-center', label: 'Revenue Command Center', icon: Gauge },
      { to: '/admin/funnel', label: 'Funnel & Revenue', icon: TrendingUp },
      { to: '/admin/reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    id: 'analytics',
    title: 'Analytics',
    items: [
      { to: '/admin/commerce-intelligence', label: 'Commerce Intel', icon: BarChart3 },
      { to: '/admin/products-performance', label: 'Products Performance', icon: BarChart3 },
      { to: '/admin/traffic-performance', label: 'Traffic Performance', icon: TrendingUp },
      { to: '/admin/placement-overview', label: 'Placement Overview', icon: Gauge },
      { to: '/admin/degraded-events', label: 'Degraded Events', icon: ShieldAlert },
    ],
  },
  {
    id: 'seo',
    title: 'SEO & Content',
    items: [
      { to: '/admin/growth-execution', label: 'SEO Growth V4', icon: TrendingUp },
      { to: '/admin/seo-command-center', label: 'SEO Command', icon: Target },
      { to: '/admin/autonomous-seo', label: 'Autonomous SEO', icon: Brain },
      { to: '/admin/seo-agent-auto', label: 'SEO Agent AI', icon: Activity },
      { to: '/admin/seo-engine', label: 'SEO Engine Auto', icon: Zap },
      { to: '/admin/seo-dashboard', label: 'SEO Engine', icon: Zap },
      { to: '/admin/seo-intelligence', label: 'SEO Intelligence', icon: LineChart },
      { to: '/admin/guides', label: 'Guides SEO', icon: BookOpen },
      { to: '/admin/internal-link-log', label: 'Internal Links', icon: Link },
      { to: '/admin/page-changelog', label: 'Page Changelog', icon: History },
    ],
  },
  {
    id: 'pinterest',
    title: 'Pinterest',
    items: [
      { to: '/admin/pinterest-health', label: 'Pinterest Health', icon: Activity },
      { to: '/admin/pinterest-revenue-control', label: 'Pinterest Revenue Control', icon: Pin },
      { to: '/admin/pinterest-revenue', label: 'Pinterest Revenue', icon: Pin },
      { to: '/admin/pinterest-scaling', label: 'Pinterest Scaling v2', icon: Pin },
      { to: '/admin/winner-discovery', label: 'Winner Discovery', icon: Pin },
      { to: '/admin/pinterest-ad-studio', label: 'Pinterest Ad Studio', icon: Pin },
      { to: '/admin/pinterest-automation', label: 'Pinterest Auto', icon: Pin },
      { to: '/admin/pinterest-scheduler', label: 'Pinterest Scheduler', icon: Pin },
      { to: '/admin/pinterest-products', label: 'Pinterest Top 25', icon: Pin },
      { to: '/admin/pinterest-trends', label: 'Pinterest Trends', icon: Pin },
      { to: '/admin/pinterest-commerce-intel', label: 'Pinterest Commerce Intel', icon: Pin },
      { to: '/admin/pinterest-pin-status', label: 'Pinterest Pin Status', icon: Pin },
      { to: '/admin/pinterest-backdrop-preview', label: 'Pinterest Backdrops', icon: Pin },
      { to: '/admin/pinterest-recovery', label: 'Pinterest Recovery', icon: ShieldAlert },
      { to: '/admin/pinterest-cleanup', label: 'Pinterest Cleanup', icon: Sparkles },
    ],
  },
  {
    id: 'tiktok',
    title: 'TikTok',
    items: [
      { to: '/admin/tiktok-automation', label: 'TikTok Auto', icon: Activity },
      { to: '/admin/tiktok-ads-performance', label: 'TikTok Ads Perf', icon: TrendingUp },
      { to: '/admin/tiktok-funnel-report', label: 'TikTok Funnel Report', icon: TrendingUp },
      { to: '/admin/tiktok-cta-ctr', label: 'TikTok CTA CTR', icon: TrendingUp },
      { to: '/admin/tiktok-funnel-debug', label: 'TikTok Funnel Debug', icon: Activity },
      { to: '/admin/tiktok-excluded-sessions', label: 'TikTok Excluded Sessions', icon: ShieldAlert },
      { to: '/admin/tiktok-session-decision-log', label: 'TikTok Decision Log', icon: ShieldAlert },
    ],
  },
  {
    id: 'creative',
    title: 'Creative',
    items: [
      { to: '/admin/cinematic-ads', label: 'Cinematic Ads', icon: Video },
      { to: '/admin/cinematic-v3', label: 'Cinematic V3 (QA)', icon: Video },
      { to: '/admin/cinematic-performance', label: 'Cinematic Perf', icon: Gauge },
      { to: '/admin/product-optimizer', label: 'AI Product Optimizer', icon: Zap },
    ],
  },
  {
    id: 'catalog',
    title: 'Catalog & Suppliers',
    items: [
      { to: '/admin/cj-inventory-sync', label: 'CJ Inventory Sync', icon: Video },
      { to: '/admin/cj-video-diagnostic', label: 'CJ Video Diagnostic', icon: Video },
      { to: '/admin/cj-health-check', label: 'CJ Health Check', icon: Activity },
      { to: '/admin/integrations/merchant', label: 'Merchant Center', icon: Globe },
      { to: '/admin/integrations/merchant/readiness', label: 'Merchant Readiness', icon: ShieldAlert },
      { to: '/admin/integrations/merchant/health', label: 'Merchant Health', icon: ShieldAlert },
      { to: '/admin/integrations/stripe/apple-pay', label: 'Apple Pay Domain', icon: Apple },
    ],
  },
  {
    id: 'health',
    title: 'System Health',
    items: [
      { to: '/admin/tracking-health', label: 'Tracking Health', icon: Activity },
      { to: '/admin/diagnostics', label: 'Diagnostics', icon: Stethoscope },
      { to: '/admin/domain-health', label: 'Domain Health', icon: Globe },
      { to: '/admin/perf-audit', label: 'Performance', icon: Activity },
      { to: '/admin/job-retry-policies', label: 'Job Retry Policies', icon: Wrench },
      { to: '/admin/job-retry-metrics', label: 'Job Retry Metrics', icon: Activity },
      { to: '/admin/security-credentials', label: 'Security', icon: ShieldAlert },
      { to: '/admin/sms-alerts', label: 'SMS Alerts', icon: MessageSquare },
    ],
  },
];

/** Flat list, preserved for tests and any consumer that needs every link. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
