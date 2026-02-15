/**
 * Lightweight Web Vitals field-data collector using the official web-vitals library.
 * Sends attribution data to the collect-vitals edge function.
 */
import { onLCP, onCLS, onINP, onFCP, onTTFB } from 'web-vitals/attribution';
import type { LCPMetricWithAttribution, CLSMetricWithAttribution, INPMetricWithAttribution, FCPMetricWithAttribution, TTFBMetricWithAttribution } from 'web-vitals/attribution';

interface VitalsPayload {
  path: string;
  ua: string;
  deviceHint: 'mobile' | 'desktop';
  lcp?: { value: number; element?: string };
  cls?: { value: number };
  inp?: { value: number; event?: string };
  fcp?: { value: number };
  ttfb?: { value: number };
  sessionId: string;
}

// Accumulate metrics, send once on visibilitychange/pagehide
const collectedMetrics: Partial<VitalsPayload> = {};
let hasSent = false;

function getDeviceHint(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

function getSessionId(): string {
  let id = sessionStorage.getItem('perf-session-id');
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    sessionStorage.setItem('perf-session-id', id);
  }
  return id;
}

function sendVitals() {
  if (hasSent) return;
  // Only send if we have at least one metric
  const hasData = collectedMetrics.lcp || collectedMetrics.cls || collectedMetrics.inp || collectedMetrics.fcp || collectedMetrics.ttfb;
  if (!hasData) return;

  hasSent = true;

  const payload: VitalsPayload = {
    path: window.location.pathname,
    ua: navigator.userAgent,
    deviceHint: getDeviceHint(),
    sessionId: getSessionId(),
    ...collectedMetrics,
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return;

  const url = `${supabaseUrl}/functions/v1/collect-vitals`;
  
  // Use sendBeacon for reliability on page unload
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
  } else {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }
}

export function initVitalsCollector() {
  if (typeof window === 'undefined') return;

  onLCP((metric: LCPMetricWithAttribution) => {
    const target = metric.attribution?.target;
    collectedMetrics.lcp = {
      value: metric.value,
      element: target || undefined,
    };
  });

  onCLS((metric: CLSMetricWithAttribution) => {
    collectedMetrics.cls = { value: metric.value };
  });

  onINP((metric: INPMetricWithAttribution) => {
    collectedMetrics.inp = {
      value: metric.value,
      event: metric.attribution?.interactionType || undefined,
    };
  });

  onFCP((metric: FCPMetricWithAttribution) => {
    collectedMetrics.fcp = { value: metric.value };
  });

  onTTFB((metric: TTFBMetricWithAttribution) => {
    collectedMetrics.ttfb = { value: metric.value };
  });

  // Send on page hide (most reliable)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendVitals();
    }
  });

  // Fallback for pagehide
  window.addEventListener('pagehide', sendVitals);
}
