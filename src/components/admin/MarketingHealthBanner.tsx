import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ProviderHealth {
  ok: boolean;
  reason?: string;
  checkedAt: string;
}

interface HealthResponse {
  ok: boolean;
  providers?: {
    pinterest: ProviderHealth;
    google: ProviderHealth;
    meta: ProviderHealth;
  };
}

const PROVIDER_LABELS: Record<string, string> = {
  pinterest: 'Pinterest',
  google: 'Google',
  meta: 'Meta',
};

const REASON_LABELS: Record<string, string> = {
  TOKEN_EXPIRED: 'Token verlopen — vernieuw in provider dashboard',
  NOT_CONFIGURED: 'Niet geconfigureerd',
  RATE_LIMITED: 'Rate limited — wacht even',
  UNREACHABLE: 'API niet bereikbaar',
};

/**
 * Admin-only banner showing marketing provider health.
 * Only shows when at least one provider is degraded.
 * NEVER shown on the public storefront.
 */
export const MarketingHealthBanner = () => {
  const { data, refetch, isRefetching } = useQuery<HealthResponse>({
    queryKey: ['marketing-token-health'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('token-health');
        if (error) return { ok: false };
        return data;
      } catch {
        return { ok: false };
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: false, // Only fetch on user action
  });

  const degradedProviders = data?.providers
    ? Object.entries(data.providers).filter(([_, h]) => !h.ok && h.reason !== 'NOT_CONFIGURED')
    : [];

  if (degradedProviders.length === 0 && data?.ok !== false) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <div className="text-sm text-amber-800">
          {degradedProviders.length > 0 ? (
            <>
              {degradedProviders.map(([provider, health]) => (
                <span key={provider} className="mr-3">
                  <strong>{PROVIDER_LABELS[provider] || provider}</strong>:{' '}
                  {REASON_LABELS[health.reason || ''] || health.reason}
                </span>
              ))}
            </>
          ) : (
            'Marketing health check niet beschikbaar'
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          refetch();
          toast.info('Token health wordt gecontroleerd...');
        }}
        disabled={isRefetching}
        className="flex-shrink-0"
      >
        <RefreshCw className={`h-3 w-3 ${isRefetching ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};
