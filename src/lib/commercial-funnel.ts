import { classifySessions, type ClassifierSession } from './trafficQualityClassifier';

export interface CommercialFunnelSession extends ClassifierSession {
  commercial_eligible_v3_strict?: boolean;
  traffic_quality_class_v3?: string | null;
}

/** Read-only canonical human contract; UNKNOWN is never a synonym for bot. */
export function splitCommercialSessions<T extends CommercialFunnelSession>(rows: T[]) {
  const unique = [...new Map(rows.filter(r => r.session_id).map(r => [r.session_id, r])).values()];
  const classified = classifySessions(unique.map(r => ({ ...r, stored_exclude_from_commercial: false })));
  const commercial: T[] = [], unknown: T[] = [], excluded: T[] = [];
  unique.forEach((row, i) => {
    const c = classified[i];
    const stored = String(row.stored_traffic_class_v2 ?? '').toUpperCase();
    const hard = row.is_internal === true || row.is_bot === true || row.crawler_verified === true ||
      row.stored_is_internal === true || row.stored_is_bot === true || row.stored_technical_path === true ||
      /^(INTERNAL|BOT|CRAWLER|TECHNICAL)/.test(stored) ||
      c?.traffic_quality_class === 'INTERNAL_OR_TEST' || c?.traffic_quality_class === 'PROBABLE_BOT_OR_AUTOMATION';
    if (hard) { excluded.push(row); return; }
    if (row.stored_exclude_from_commercial === true) { unknown.push(row); return; }
    const human = row.commercial_eligible_v3_strict !== undefined
      ? row.commercial_eligible_v3_strict === true
      : c?.traffic_quality_class === 'PROBABLE_HUMAN';
    (human ? commercial : unknown).push(row);
  });
  return { commercial, unknown, excluded, raw: unique };
}

/** Funnel values are distinct sessions reaching a stage, NOT event counts or people. */
export function commercialSessionCounters(rows: CommercialFunnelSession[]) {
  const { commercial, unknown, excluded, raw } = splitCommercialSessions(rows);
  const stage = (key: 'has_product_view' | 'has_add_to_cart' | 'has_view_cart' | 'has_checkout' | 'has_purchase') =>
    commercial.filter(s => s[key] === true).length;
  return {
    visitors: new Set(commercial.map(s => s.visitor_id || s.session_id)).size,
    sessions: commercial.length,
    page_views: commercial.reduce((n, s) => n + (s.page_views ?? 0), 0),
    product_views: stage('has_product_view'), add_to_cart: stage('has_add_to_cart'),
    view_cart: stage('has_view_cart'), checkout_started: stage('has_checkout'), purchases: stage('has_purchase'),
    unknown_sessions: unknown.length, excluded_sessions: excluded.length, raw_sessions_all: raw.length,
  };
}