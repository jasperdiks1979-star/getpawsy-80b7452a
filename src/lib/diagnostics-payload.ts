/**
 * Diagnostics Payload
 * 
 * Structured diagnostics for debugging boot issues, collection resolution,
 * and recovery overlay triggers. Provides a copyable JSON payload.
 */

import { BUILD_ID, BUILD_TS } from './boot-diagnostics';

interface DiagEvent {
  ts: number;
  type: string;
  detail: string;
}

const events: DiagEvent[] = [];
const MAX_EVENTS = 50;

/**
 * Log a structured diagnostics event.
 */
export function logDiag(type: string, detail: string): void {
  const entry: DiagEvent = { ts: Date.now(), type, detail };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();

  // Also log to console for dev inspection
  console.log(`[DIAG] [${type}] ${detail}`);
}

/**
 * Log collection route resolution result.
 */
export function logCollectionResolution(data: {
  requestedSlug: string;
  resolvedSlug: string;
  aliasUsed: boolean;
  matchResult: 'db_hit' | 'virtual' | 'not_found';
  productCount?: number;
}): void {
  logDiag('COLLECTION_RESOLVE', JSON.stringify(data));
}

/**
 * Log build guard action.
 */
export function logBuildGuardAction(data: {
  action: string;
  previousBuild: string | null;
  currentBuild: string;
  cacheKeysCleared: string[];
}): void {
  logDiag('BUILD_GUARD', JSON.stringify(data));
}

/**
 * Log recovery overlay trigger.
 */
export function logRecoveryTrigger(reason: string): void {
  logDiag('RECOVERY_OVERLAY', reason);
}

/**
 * Get the full diagnostics payload for copy-to-clipboard.
 */
export function getDiagnosticsPayload(): string {
  return JSON.stringify({
    buildId: BUILD_ID,
    buildTs: BUILD_TS,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    sw: {
      supported: 'serviceWorker' in navigator,
      controller: !!navigator.serviceWorker?.controller,
    },
    localStorage: {
      lastSeenBuildId: localStorage.getItem('gp_lastSeenBuildId'),
      reloadGuard: sessionStorage.getItem('gp_build_reload_guard'),
    },
    events: events.slice(-20),
  }, null, 2);
}
