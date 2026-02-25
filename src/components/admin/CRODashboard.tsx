/**
 * CRO & AOV KPI Dashboard — Admin-only view of conversion metrics.
 * Queries visitor_activity + orders for real-time funnel metrics.
 */
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp, DollarSign, ShoppingCart, Eye, Target, Package, BarChart3,
} from 'lucide-react';
import {
  processMetrics,
  determineWinner,
  canAutoRollout,
  type VariantMetrics,
  type ProcessedMetrics,
  AB_TEST_CONFIG,
} from '@/lib/ab-test-analytics';

interface KPICard {
  label: string;
  value: string;
  change?: string;
  icon: React.ElementType;
  positive?: boolean;
}

export function CRODashboard() {
  // Fetch orders for AOV calculation
  const { data: orders } = useQuery({
    queryKey: ['cro-orders-30d'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from('orders')
        .select('total_amount, created_at, status')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .in('status', ['confirmed', 'shipped', 'delivered']);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch visitor activity for funnel
  const { data: activity } = useQuery({
    queryKey: ['cro-activity-30d'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from('visitor_activity')
        .select('activity_type, order_value, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate KPIs
  const kpis: KPICard[] = (() => {
    const totalOrders = orders?.length || 0;
    const totalRevenue = orders?.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) || 0;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const views = activity?.filter(a => a.activity_type === 'view_item').length || 0;
    const addToCarts = activity?.filter(a => a.activity_type === 'add_to_cart').length || 0;
    const checkouts = activity?.filter(a => a.activity_type === 'checkout').length || 0;
    const purchases = activity?.filter(a => a.activity_type === 'purchase').length || 0;

    const sessions = Math.max(views, 1);
    const conversionRate = (purchases / sessions) * 100;
    const rps = totalRevenue / sessions;
    const addToCartRate = (addToCarts / sessions) * 100;
    const checkoutRate = checkouts > 0 ? (purchases / checkouts) * 100 : 0;

    return [
      { label: 'Conversion Rate', value: `${conversionRate.toFixed(2)}%`, icon: Target },
      { label: 'Average Order Value', value: `$${aov.toFixed(2)}`, icon: DollarSign },
      { label: 'Revenue per Session', value: `$${rps.toFixed(2)}`, icon: TrendingUp },
      { label: 'Add-to-Cart Rate', value: `${addToCartRate.toFixed(1)}%`, icon: ShoppingCart },
      { label: 'Checkout Completion', value: `${checkoutRate.toFixed(1)}%`, icon: Package },
      { label: 'Total Revenue (30d)', value: `$${totalRevenue.toFixed(0)}`, icon: BarChart3 },
      { label: 'Total Orders (30d)', value: `${totalOrders}`, icon: Package },
      { label: 'Product Views (30d)', value: `${views}`, icon: Eye },
    ];
  })();

  // Funnel data
  const funnel = (() => {
    const views = activity?.filter(a => a.activity_type === 'view_item').length || 0;
    const atc = activity?.filter(a => a.activity_type === 'add_to_cart').length || 0;
    const co = activity?.filter(a => a.activity_type === 'checkout').length || 0;
    const pur = activity?.filter(a => a.activity_type === 'purchase').length || 0;
    return [
      { stage: 'Product Views', count: views, pct: 100 },
      { stage: 'Add to Cart', count: atc, pct: views ? (atc / views) * 100 : 0 },
      { stage: 'Checkout Started', count: co, pct: views ? (co / views) * 100 : 0 },
      { stage: 'Purchase', count: pur, pct: views ? (pur / views) * 100 : 0 },
    ];
  })();

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          CRO & Revenue Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">30-day conversion, AOV, and revenue per session metrics</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Conversion Funnel (30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funnel.map((step, i) => (
              <div key={step.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{step.stage}</span>
                  <span className="text-muted-foreground">
                    {step.count.toLocaleString()} ({step.pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(step.pct, 1)}%` }}
                  />
                </div>
                {i < funnel.length - 1 && funnel[i + 1] && step.count > 0 && (
                  <p className="text-xs text-muted-foreground pl-2">
                    ↓ {((funnel[i + 1].count / step.count) * 100).toFixed(1)}% proceed
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* A/B Test Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            A/B Test Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Min Days</span>
              <p className="font-semibold">{AB_TEST_CONFIG.minDays}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Min Sessions/Variant</span>
              <p className="font-semibold">{AB_TEST_CONFIG.minSessionsPerVariant}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Significance Level</span>
              <p className="font-semibold">{(AB_TEST_CONFIG.significanceLevel * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-muted-foreground">Primary Metric</span>
              <p className="font-semibold">{AB_TEST_CONFIG.primaryMetric}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Badge variant="outline">Bundle A/B: Active</Badge>
            <Badge variant="outline">Messaging A/B: Active</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
