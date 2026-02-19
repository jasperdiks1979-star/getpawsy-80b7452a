import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SeoFeatureFlags {
  hyper_aggressive: boolean;
  dominance_mode: boolean;
  content_dominance: boolean;
  growth_domination: boolean;
  enterprise_expansion: boolean;
  algorithm_immunity: boolean;
  intelligence_stack: boolean;
  autonomous_growth_loop: boolean;
  revenue_market_capture: boolean;
}

const DEFAULT_FLAGS: SeoFeatureFlags = {
  hyper_aggressive: false,
  dominance_mode: false,
  content_dominance: false,
  growth_domination: false,
  enterprise_expansion: false,
  algorithm_immunity: false,
  intelligence_stack: false,
  autonomous_growth_loop: false,
  revenue_market_capture: false,
};

const LS_KEY = 'seo_feature_flags_cache';

function readCache(): SeoFeatureFlags | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(flags: SeoFeatureFlags) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(flags));
  } catch { /* ignore */ }
}

export function useSeoFeatureFlags() {
  const { user, isAdmin } = useAuth();
  const [flags, setFlags] = useState<SeoFeatureFlags>(() => readCache() || DEFAULT_FLAGS);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFlagsRef = useRef(flags);

  // Keep ref in sync
  useEffect(() => { latestFlagsRef.current = flags; }, [flags]);

  // Load from DB on mount
  useEffect(() => {
    if (!user || !isAdmin) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from('seo_feature_flags')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('[SeoFlags] Load error:', error.message);
          // Fall back to cache
          setIsLoading(false);
          return;
        }

        if (data) {
          const loaded: SeoFeatureFlags = {
            hyper_aggressive: data.hyper_aggressive,
            dominance_mode: data.dominance_mode,
            content_dominance: data.content_dominance,
            growth_domination: data.growth_domination,
            enterprise_expansion: data.enterprise_expansion,
            algorithm_immunity: data.algorithm_immunity,
            intelligence_stack: data.intelligence_stack,
            autonomous_growth_loop: data.autonomous_growth_loop,
            revenue_market_capture: data.revenue_market_capture,
          };
          setFlags(loaded);
          writeCache(loaded);
        }
        // If no row exists yet, keep defaults (row created on first toggle)
      } catch (e) {
        console.error('[SeoFlags] Load crashed:', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.id, isAdmin]);

  const persistFlags = useCallback(async (updated: SeoFeatureFlags) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('seo_feature_flags')
        .upsert({
          user_id: user.id,
          ...updated,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('[SeoFlags] Save error:', error.message);
        toast.error('Failed to save toggle — reverting');
        // Reload from DB to revert
        const { data } = await supabase
          .from('seo_feature_flags')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) {
          const reverted: SeoFeatureFlags = {
            hyper_aggressive: data.hyper_aggressive,
            dominance_mode: data.dominance_mode,
            content_dominance: data.content_dominance,
            growth_domination: data.growth_domination,
            enterprise_expansion: data.enterprise_expansion,
            algorithm_immunity: data.algorithm_immunity,
            intelligence_stack: data.intelligence_stack,
            autonomous_growth_loop: data.autonomous_growth_loop,
            revenue_market_capture: data.revenue_market_capture,
          };
          setFlags(reverted);
          writeCache(reverted);
        }
      }
    } catch (e) {
      console.error('[SeoFlags] Save crashed:', e);
      toast.error('Failed to save toggle setting');
    }
  }, [user]);

  const setFlag = useCallback((key: keyof SeoFeatureFlags, value: boolean) => {
    const updated = { ...latestFlagsRef.current, [key]: value };
    setFlags(updated);
    writeCache(updated);

    // Debounce DB write
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistFlags(updated);
    }, 400);
  }, [persistFlags]);

  return { flags, setFlag, isLoading };
}
