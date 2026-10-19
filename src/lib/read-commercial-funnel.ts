import { supabase } from '@/integrations/supabase/client';
import { commercialSessionCounters, splitCommercialSessions } from './commercial-funnel';
import type { TruthResponse } from '@/hooks/useAnalyticsTruth';

/** Use the existing cached service rather than a second broad events scan. */
export async function readCommercialFunnel(hours: number, geo: 'US' | 'all' = 'all') {
  const { data, error } = await supabase.functions.invoke('analytics-canonical', { body: { hours, geo } });
  if (error || !data?.ok || !Array.isArray(data.sessions)) {
    throw new Error(error?.message || 'Commercial session evidence unavailable');
  }
  const payload = data as TruthResponse;
  const split = splitCommercialSessions(payload.sessions);
  return {
    ...payload,
    totals: { ...payload.totals, ...commercialSessionCounters(payload.sessions) },
    sessions: split.commercial,
    unknownSessions: split.unknown,
    excludedSessions: split.excluded,
  };
}