import { supabase } from '@/integrations/supabase/client';
import { readCommercialFunnel } from './read-commercial-funnel';
import type { TruthResponse } from '@/hooks/useAnalyticsTruth';
import type { CommercialReportEvidence, CommercialReportEvent, CommercialPaidOrder } from './commercial-report-aggregation';

export const REPORT_SESSION_LIMIT = 500;
export const REPORT_EVENT_LIMIT = 10000;
const inflight = new Map<number, Promise<CommercialReportEvidence>>();

/** Indexed session-id reads only; bounded, no fallback to unclassified aggregates. */
export async function loadCommercialReportEvidence(hours: number): Promise<CommercialReportEvidence> {
  const truth = await readCommercialFunnel(hours);
  const metadata = truth as typeof truth & { load_shedding?: { truncated_scans?: string[] }; flags_coverage?: { scan_error?: string | null } };
  if (metadata.load_shedding?.truncated_scans?.length || metadata.flags_coverage?.scan_error) {
    throw new Error('Commercial report unavailable: incomplete canonical session evidence');
  }
  const sessions = [...truth.sessions, ...truth.unknownSessions, ...truth.excludedSessions];
  if (truth.sessions.length > REPORT_SESSION_LIMIT) throw new Error('Commercial report session budget exceeded; no partial totals shown');
  const events: CommercialReportEvent[] = [];
  for (const s of truth.sessions) {
    let offset = 0;
    while (true) {
      const remaining = REPORT_EVENT_LIMIT - events.length;
      if (remaining <= 0) throw new Error('Commercial report event budget exceeded; no partial totals shown');
      const size = Math.min(500, remaining);
      const { data, error } = await supabase.from('canonical_events')
        .select('id,session_id,occurred_at,canonical_name,product_id,page_path,order_id,technical_path')
        .eq('session_id', s.session_id).gte('occurred_at', truth.window.since).lt('occurred_at', truth.window.until)
        .order('occurred_at').order('id').range(offset, offset + size - 1);
      if (error) throw error;
      events.push(...(data ?? []));
      if ((data?.length ?? 0) < size) break;
      offset += size;
    }
  }
  const orderIds = [...new Set(events.filter(e => e.canonical_name === 'CANONICAL_PURCHASE' && e.order_id).map(e => e.order_id).filter((id): id is string => typeof id === 'string'))];
  const orders: CommercialPaidOrder[] = [];
  for (let i = 0; i < orderIds.length; i += 50) {
    const { data, error } = await supabase.from('orders').select('id,total_amount,currency')
      .in('id', orderIds.slice(i, i + 50)).in('status', ['paid', 'completed']).limit(50);
    if (error) throw error;
    orders.push(...(data ?? []).map(o => ({ order_id: o.id, total_amount: Number(o.total_amount), currency: o.currency })));
  }
  return { sessions, events, orders, since: truth.window.since, until: truth.window.until };
}

export function readCommercialReportEvidence(hours: number) {
  const pending = inflight.get(hours);
  if (pending) return pending;
  const request = loadCommercialReportEvidence(hours).finally(() => inflight.delete(hours));
  inflight.set(hours, request);
  return request;
}