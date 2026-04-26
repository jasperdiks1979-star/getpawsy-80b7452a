/**
 * USModeChecklist — post-switch verification panel.
 *
 * Opened automatically right after the dev panel switches to 🇺🇸 US mode
 * (or manually via the "Show expected US states" button). Renders a live
 * checklist comparing the *expected* consent / pixel state for a US
 * visitor against the *actual* runtime state, so you can verify in
 * one glance that the auto-grant path executed correctly.
 *
 * Pure presentation — reads state from geoConsent + window.__ttqConsent
 * + localStorage. Does not mutate anything.
 */
import { useEffect, useState } from 'react';
import { getGeoConsentDebug } from '@/lib/geoConsent';
import { summarizeConsentLog } from '@/lib/consentLog';

interface USModeChecklistProps {
  onClose: () => void;
}

type CheckStatus = 'pass' | 'fail' | 'pending';

interface CheckItem {
  label: string;
  expected: string;
  actual: string;
  status: CheckStatus;
  hint?: string;
}

const CONSENT_KEY = 'gp_cookie_consent';

function readStoredConsent(): string {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return 'none';
    return raw.includes(':') ? raw.split(':')[1] : raw;
  } catch {
    return 'n/a';
  }
}

function readTtqState(): string {
  if (typeof window === 'undefined') return 'unknown';
  const w = window as any;
  if (w.__ttqConsent === 'granted' || w.__ttqConsent === 'held' || w.__ttqConsent === 'revoked') {
    return w.__ttqConsent;
  }
  return 'unknown';
}

function buildChecks(): CheckItem[] {
  const debug = getGeoConsentDebug();
  const ttq = readTtqState();
  const cookie = readStoredConsent();
  const summary = summarizeConsentLog();

  return [
    {
      label: 'Dev override active',
      expected: 'us',
      actual: debug.devOverride ?? 'none',
      status: debug.devOverride === 'us' ? 'pass' : 'fail',
      hint: 'Set by clicking 🇺🇸 US in the dev panel.',
    },
    {
      label: 'GDPR mode',
      expected: 'false',
      actual: String(debug.isGdpr),
      status: debug.isGdpr === false ? 'pass' : 'fail',
      hint: 'US visitors must NOT be in GDPR flow.',
    },
    {
      label: 'Auto-grant consent',
      expected: 'true',
      actual: String(debug.autoGrant),
      status: debug.autoGrant === true ? 'pass' : 'fail',
      hint: 'CCPA opt-out path: consent granted automatically.',
    },
    {
      label: 'Stored cookie consent',
      expected: 'all',
      actual: cookie,
      status: cookie === 'all' ? 'pass' : cookie === 'none' ? 'pending' : 'fail',
      hint: 'Should be "all" — written by setConsent("all", "dev-toggle").',
    },
    {
      label: 'TikTok pixel state',
      expected: 'granted',
      actual: ttq,
      status: ttq === 'granted' ? 'pass' : ttq === 'unknown' ? 'pending' : 'fail',
      hint: 'ttq.grantConsent() should have hydrated by now (≤3s).',
    },
    {
      label: 'Pixel events fired with consent',
      expected: '≥ 1 granted-fire',
      actual: `${summary.firedWhileGranted} granted / ${summary.firedWhileHeld} held`,
      status:
        summary.firedWhileGranted >= 1 && summary.firedWhileHeld === 0
          ? 'pass'
          : summary.firedWhileHeld > 0
          ? 'fail'
          : 'pending',
      hint: 'Pageview should fire on mount. Held-fires = leak.',
    },
  ];
}

const COLORS: Record<CheckStatus, { bg: string; fg: string; border: string; icon: string }> = {
  pass: { bg: 'hsl(142 50% 94%)', fg: 'hsl(142 70% 28%)', border: 'hsl(142 50% 70%)', icon: '✓' },
  fail: { bg: 'hsl(0 60% 95%)', fg: 'hsl(0 70% 38%)', border: 'hsl(0 60% 75%)', icon: '✕' },
  pending: { bg: 'hsl(40 80% 94%)', fg: 'hsl(30 70% 32%)', border: 'hsl(40 80% 70%)', icon: '⏳' },
};

export const USModeChecklist = ({ onClose }: USModeChecklistProps) => {
  const [checks, setChecks] = useState<CheckItem[]>(() => buildChecks());
  const [tick, setTick] = useState(0);

  // Live re-evaluate every 1s for the first ~10s while the pixel hydrates
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    const stop = setTimeout(() => clearInterval(id), 12000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, []);

  useEffect(() => { setChecks(buildChecks()); }, [tick]);

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const pendingCount = checks.filter((c) => c.status === 'pending').length;

  const allPass = failCount === 0 && pendingCount === 0;

  return (
    <div
      role="dialog"
      aria-label="US mode pixel state checklist"
      style={{
        position: 'fixed',
        inset: '50% auto auto 50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2147483647,
        width: 'min(480px, 92vw)',
        maxHeight: '88vh',
        overflowY: 'auto',
        padding: 16,
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>🇺🇸 US Mode — Expected Pixel States</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checklist"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: 'hsl(25 18% 42%)',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <p style={{ marginTop: 6, fontSize: 11, color: 'hsl(25 18% 42%)', lineHeight: 1.5 }}>
        Live verification that the auto-grant path executed correctly for a
        US visitor. Re-checks every second for the first 12s while the
        TikTok pixel hydrates.
      </p>

      <div
        style={{
          marginTop: 10,
          padding: 10,
          background: allPass ? 'hsl(142 50% 94%)' : 'hsl(40 80% 94%)',
          border: `1px solid ${allPass ? 'hsl(142 50% 70%)' : 'hsl(40 80% 70%)'}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          color: allPass ? 'hsl(142 70% 28%)' : 'hsl(30 70% 32%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          {allPass ? '✓ All checks passing' : pendingCount > 0 ? '⏳ Waiting for pixel…' : '✕ Issues detected'}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
          {passCount}✓ · {failCount}✕ · {pendingCount}⏳
        </span>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checks.map((c) => {
          const s = COLORS[c.status];
          return (
            <div
              key={c.label}
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 11, color: s.fg }}>
                  {s.icon} {c.label}
                </strong>
                <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', color: s.fg }}>
                  {c.actual} {c.status !== 'pass' && `(want: ${c.expected})`}
                </span>
              </div>
              {c.hint && (
                <div style={{ marginTop: 3, fontSize: 10, color: 'hsl(25 18% 30%)', lineHeight: 1.4 }}>
                  {c.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: 'hsl(38 30% 96%)',
          borderRadius: 8,
          fontSize: 11,
          lineHeight: 1.5,
          color: 'hsl(25 30% 22%)',
        }}
      >
        <strong>Next step if all green:</strong> open TikTok Pixel Helper or
        TikTok Events Manager and confirm <code>Pageview</code> arrives.
        Then navigate to a PDP to validate <code>ViewContent</code>.
      </div>

      <button
        type="button"
        onClick={() => setTick((n) => n + 1)}
        style={{
          marginTop: 10,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          background: 'transparent',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(38 30% 88%)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        ↻ Re-check now
      </button>
    </div>
  );
};

export default USModeChecklist;