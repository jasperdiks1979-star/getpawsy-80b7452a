import { useEffect, useState, useCallback } from 'react';
import {
  getDevGeoOverride,
  setDevGeoOverride,
  isDevConsentToggleAvailable,
  getGeoConsentDebug,
  clearGeoConsentDecision,
  type DevGeoOverride,
} from '@/lib/geoConsent';
import { setConsent } from '@/lib/cookieConsent';
import { summarizeConsentLog, clearConsentLog } from '@/lib/consentLog';
import { GuidedConsentTest } from './GuidedConsentTest';
import { ConsentRuleSimulator } from './ConsentRuleSimulator';
import { ConsentEventTimeline } from './ConsentEventTimeline';

/**
 * DevConsentToggle — floating control to simulate EU vs non-EU consent.
 *
 * Visible only on lovable.app/.dev/localhost. Lets you flip between the
 * GDPR (banner shown, pixel held) and CCPA (banner suppressed, pixel
 * granted) flows without changing the browser timezone.
 *
 * Toggling resets the stored cookie consent + reloads so the new flow
 * runs from a clean state.
 */
const STORAGE_OPEN_KEY = 'gp_dev_geo_panel_open';
const CONSENT_KEY = 'gp_cookie_consent';

type TtqState = 'granted' | 'held' | 'revoked' | 'unknown';

function readTtqState(): TtqState {
  if (typeof window === 'undefined') return 'unknown';
  const w = window as any;
  if (w.__ttqConsent === 'granted' || w.__ttqConsent === 'held' || w.__ttqConsent === 'revoked') {
    return w.__ttqConsent;
  }
  // Fallback: pixel hasn't initialised yet
  return w.ttq?._loaded ? 'unknown' : 'unknown';
}

function readStoredConsent(): string {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return 'none';
    return raw.includes(':') ? raw.split(':')[1] : raw;
  } catch {
    return 'n/a';
  }
}

export const DevConsentToggle = () => {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<DevGeoOverride>(null);
  const [debug, setDebug] = useState<ReturnType<typeof getGeoConsentDebug> | null>(null);
  const [ttqState, setTtqState] = useState<TtqState>('unknown');
  const [storedConsent, setStoredConsent] = useState<string>('none');
  const [logSummary, setLogSummary] = useState<ReturnType<typeof summarizeConsentLog> | null>(null);
  const [tick, setTick] = useState(0);
  const [guidedOpen, setGuidedOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    if (!isDevConsentToggleAvailable()) return;
    setAvailable(true);
    setOverride(getDevGeoOverride());
    setDebug(getGeoConsentDebug());
    setTtqState(readTtqState());
    setStoredConsent(readStoredConsent());
    setLogSummary(summarizeConsentLog());
    try {
      // Default: open so the debug panel is visible without extra clicks
      const v = localStorage.getItem(STORAGE_OPEN_KEY);
      setOpen(v === null ? true : v === '1');
    } catch { /* ignore */ }
  }, [tick]);

  // Auto-refresh the live state every 2s while panel is open
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, [open]);

  const persistOpen = useCallback((v: boolean) => {
    setOpen(v);
    try { localStorage.setItem(STORAGE_OPEN_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const apply = useCallback((next: DevGeoOverride) => {
    setDevGeoOverride(next);
    // The persisted geo decision is keyed by override → wipe so the new
    // flow re-evaluates from scratch on next page load.
    clearGeoConsentDecision();
    // Wipe stored consent so the new flow restarts cleanly
    try {
      localStorage.removeItem(CONSENT_KEY);
      document.cookie = `${CONSENT_KEY}=; path=/; max-age=0; SameSite=Lax`;
    } catch { /* ignore */ }
    // Force a fresh consent decision based on the new override
    if (next === 'us') {
      setConsent('all', 'dev-toggle'); // mirror the auto-grant path
    }
    // Reload so deferred-analytics re-runs the grant/hold decision
    window.location.reload();
  }, []);

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => persistOpen(true)}
        aria-label="Open dev consent toggle"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 2147483646,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'hsl(25 30% 12%)',
          color: '#fff',
          border: '1px solid hsl(38 30% 88%)',
          borderRadius: 999,
          cursor: 'pointer',
          opacity: 0.55,
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.55')}
      >
        🌍 {override ? `dev:${override}` : 'geo'}
      </button>
    );
  }

  const row: React.CSSProperties = { display: 'flex', gap: 6, marginTop: 8 };
  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'system-ui, sans-serif',
    background: active ? 'hsl(22 70% 48%)' : 'transparent',
    color: active ? '#fff' : 'hsl(25 30% 12%)',
    border: '1px solid hsl(38 30% 88%)',
    borderRadius: 6,
    cursor: 'pointer',
  });

  return (
    <div
      role="region"
      aria-label="Dev consent simulator"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 2147483646,
        width: 240,
        padding: 12,
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>🌍 Dev Geo Consent</strong>
        <button
          type="button"
          onClick={() => persistOpen(false)}
          aria-label="Close"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: 'hsl(25 18% 42%)',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: 'hsl(25 18% 42%)' }}>
        Override timezone-based detection. Reloads on change.
      </div>

      <div style={row}>
        <button type="button" onClick={() => apply(null)} style={btn(override === null)}>
          Auto
        </button>
        <button type="button" onClick={() => apply('eu')} style={btn(override === 'eu')}>
          🇪🇺 EU
        </button>
        <button type="button" onClick={() => apply('us')} style={btn(override === 'us')}>
          🇺🇸 US
        </button>
      </div>

      {debug && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: 'hsl(38 30% 96%)',
            borderRadius: 6,
            fontSize: 10,
            fontFamily: 'ui-monospace, monospace',
            color: 'hsl(25 30% 12%)',
            lineHeight: 1.5,
          }}
        >
          <div>tz: {debug.timezone || 'unknown'}</div>
          <div>gdpr: {String(debug.isGdpr)}</div>
          <div>auto-grant: {String(debug.autoGrant)}</div>
          <div>
            ttq:{' '}
            <span
              style={{
                color:
                  ttqState === 'granted'
                    ? 'hsl(142 70% 32%)'
                    : ttqState === 'held' || ttqState === 'revoked'
                    ? 'hsl(0 70% 42%)'
                    : 'hsl(25 18% 42%)',
                fontWeight: 700,
              }}
            >
              {ttqState}
            </span>
          </div>
          <div>cookie: {storedConsent}</div>
        </div>
      )}

      {logSummary && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: 'hsl(38 30% 96%)',
            borderRadius: 6,
            fontSize: 10,
            fontFamily: 'ui-monospace, monospace',
            color: 'hsl(25 30% 12%)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 10 }}>Event log</strong>
            <button
              type="button"
              onClick={() => { clearConsentLog(); setTick((n) => n + 1); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'hsl(0 70% 42%)',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              clear
            </button>
          </div>
          <div>changes: {logSummary.consentChanges} · events: {logSummary.tikTokEvents}</div>
          <div>granted-fires: {logSummary.firedWhileGranted}</div>
          <div style={{ color: logSummary.firedWhileHeld > 0 ? 'hsl(0 70% 42%)' : undefined }}>
            held/revoked-fires: {logSummary.firedWhileHeld}
          </div>
          {Object.keys(logSummary.byEvent).length > 0 && (
            <div style={{ marginTop: 4, fontSize: 9, opacity: 0.85 }}>
              {Object.entries(logSummary.byEvent)
                .map(([k, v]) => `${k}:${v}`)
                .join(' · ')}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 9, opacity: 0.7 }}>
            console: __consentLog() · __consentLogSummary()
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setTick((n) => n + 1)}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '4px 8px',
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'transparent',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(38 30% 88%)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        ↻ Refresh state
      </button>

      <button
        type="button"
        onClick={() => setGuidedOpen(true)}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'hsl(22 70% 48%)',
          color: '#fff',
          border: '1px solid hsl(22 70% 48%)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        🧪 Run guided test
      </button>

      <button
        type="button"
        onClick={() => setSimulatorOpen(true)}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'transparent',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(22 70% 48%)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        ⚖️ EU vs US simulator
      </button>

      <button
        type="button"
        onClick={() => setTimelineOpen(true)}
        style={{
          marginTop: 6,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
          background: 'transparent',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(22 70% 48%)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        📜 Event timeline
      </button>

      <div style={{ marginTop: 8, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
        Dev hosts only — never visible in production.
      </div>

      {guidedOpen && <GuidedConsentTest onClose={() => setGuidedOpen(false)} />}
      {simulatorOpen && <ConsentRuleSimulator onClose={() => setSimulatorOpen(false)} />}
      {timelineOpen && <ConsentEventTimeline onClose={() => setTimelineOpen(false)} />}
    </div>
  );
};

export default DevConsentToggle;