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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const startDrag = useCallback((x: number, y: number) => {
    dragStartRef.current = { x, y };
    setDrag({ dx: 0, dy: 0 });
  }, []);

  const moveDrag = useCallback((x: number, y: number) => {
    const start = dragStartRef.current;
    if (!start) return;
    setDrag({ dx: Math.max(0, x - start.x), dy: Math.max(0, y - start.y) });
  }, []);

  const endDrag = useCallback(() => {
    const current = drag;
    dragStartRef.current = null;
    setDrag(null);
    if (current && (current.dx > 70 || current.dy > 90)) onClose();
  }, [drag, onClose]);

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
        left: '50%',
        right: 'auto',
        bottom: 8,
        transform: drag
          ? `translate(calc(-50% + ${drag.dx}px), ${drag.dy}px)`
          : 'translateX(-50%)',
        zIndex: 2147483647,
        width: 'min(420px, calc(100vw - 24px))',
        maxHeight: 'min(62vh, 520px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: 12,
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: '14px 14px 10px 10px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        opacity: drag ? Math.max(0.45, 1 - Math.max(drag.dx, drag.dy) / 260) : 1,
        transition: drag ? 'none' : 'transform 180ms ease, opacity 180ms ease',
      }}
    >
      <div
        onTouchStart={(e) => {
          const t = e.touches[0];
          startDrag(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          moveDrag(t.clientX, t.clientY);
        }}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
        style={{
          position: 'sticky',
          top: -12,
          margin: -12,
          marginBottom: 0,
          padding: '8px 12px 10px',
          background: '#fff',
          borderBottom: '1px solid hsl(38 30% 92%)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          zIndex: 2,
          touchAction: 'none',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 4,
              borderRadius: 999,
              background: 'hsl(38 20% 78%)',
              margin: '0 auto 8px',
            }}
          />
          <strong style={{ display: 'block', fontSize: 12, lineHeight: 1.2 }}>🇺🇸 US Mode Checklist</strong>
          <span style={{ display: 'block', marginTop: 2, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
            Swipe rechts/omlaag om te sluiten
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close checklist"
          style={{
            background: 'hsl(38 30% 94%)',
            border: '1px solid hsl(38 30% 86%)',
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 700,
            color: 'hsl(25 18% 42%)',
            padding: 0,
            lineHeight: 1,
            width: 36,
            height: 36,
            borderRadius: 999,
            flex: '0 0 auto',
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

      <button
        type="button"
        onClick={onClose}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '7px 8px',
          fontSize: 11,
          fontWeight: 700,
          background: 'hsl(38 30% 94%)',
          color: 'hsl(25 30% 12%)',
          border: '1px solid hsl(38 30% 86%)',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Sluit checklist
      </button>

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