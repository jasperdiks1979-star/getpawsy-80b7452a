import { Outlet, NavLink } from 'react-router-dom';
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
  Zap,
  BookOpen,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/growth-execution', label: 'SEO Growth V4', icon: TrendingUp },
  { to: '/admin/seo-command-center', label: 'SEO Command', icon: Target },
  { to: '/admin/autonomous-seo', label: 'Autonomous SEO', icon: Brain },
  { to: '/admin/seo-dashboard', label: 'SEO Engine', icon: Zap },
  { to: '/admin/seo-intelligence', label: 'SEO Intelligence', icon: LineChart },
  { to: '/admin/commerce-intelligence', label: 'Commerce Intel', icon: BarChart3 },
  { to: '/admin/reports', label: 'Reports', icon: FileText },
  { to: '/admin/guides', label: 'Guides SEO', icon: BookOpen },
  { to: '/admin/internal-link-log', label: 'Internal Links', icon: Link },
  { to: '/admin/diagnostics', label: 'Diagnostics', icon: Stethoscope },
  { to: '/admin/domain-health', label: 'Domain Health', icon: Globe },
  { to: '/admin/perf-audit', label: 'Performance', icon: Activity },
  { to: '/admin/security-credentials', label: 'Security', icon: ShieldAlert },
];

/**
 * Shared admin shell: sidebar nav (desktop) + pill nav (mobile) + <Outlet />.
 * Does NOT wrap in <Layout> — each child page handles its own Layout wrapper
 * to avoid double navbar/footer for existing pages.
 */
export function AdminLayout() {
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Outlet />
    </>
  );
}
