/**
 * useRealSocialProof
 *
 * Returns ONLY verifiable signals for a product:
 *   - real PDP views in the last 7 days (from lp_funnel_events)
 *   - real orders count in the last 30 days (from visitor_activity:purchase)
 *
 * No invented names, no invented quotes, no invented star averages. If no
 * signal clears the visibility threshold the hook returns `hasAny=false`
 * and the PDP must render nothing — per the conversion sprint memory rules
 * (compliance/product-reviews-and-rating-policy + "no fake reviews").
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RealSocialProof {
  views7d: number | null;
  orders30d: number | null;
  hasAny: boolean;
}

const VIEWS_MIN = 25;
const ORDERS_MIN = 5;

export function useRealSocialProof(productId: string | undefined | null) {
  return useQuery<RealSocialProof>({
    queryKey: ['real-social-proof', productId],
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [viewsRes, ordersRes] = await Promise.all([
        supabase
          .from('lp_funnel_events')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', productId!)
          .eq('event_name', 'pdp_view')
          .eq('is_bot', false)
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('visitor_activity')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', productId!)
          .eq('activity_type', 'purchase')
          .gte('created_at', thirtyDaysAgo),
      ]);

      const views = viewsRes.error ? null : viewsRes.count ?? 0;
      const orders = ordersRes.error ? null : ordersRes.count ?? 0;

      const showViews = views !== null && views >= VIEWS_MIN;
      const showOrders = orders !== null && orders >= ORDERS_MIN;

      return {
        views7d: showViews ? views : null,
        orders30d: showOrders ? orders : null,
        hasAny: showViews || showOrders,
      };
    },
  });
}
