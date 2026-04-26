/**
 * ConsentLeakWarning — floating dev banner that surfaces GDPR pixel
 * leaks the moment they happen.
 *
 * Triggers:
 *   1. held/revoked-fires count increases vs the last poll (new leak)
 *   2. tikTokEvents > 0 AND granted-fires === 0 for ≥ GRANTED_GRACE_MS
 *      (events are firing but none under granted consent — pixel is
 *      effectively dark)
 *
 * The banner can be dismissed; dismissal is sticky for the current
 * leak signature so the same warning doesn't keep popping back. A new
 * leak (different counts) re-triggers it.
 *
 * Dev hosts only — wrapped by the same isDevConsentToggleAvailable()
 * gate as DevConsentToggle.
 */
import { useEffect, useRef, useState } from 'react';
import { isDevConsentToggleAvailable } from '@/lib/geoConsent';
import { summarizeConsentLog } from '@/lib/consentLog';

const POLL_MS = 1500;
const GRANTED_GRACE_MS = 8000;
const DISMISS_KEY = 'gp_consent_leak_dismiss_sig';

type LeakKind = 'leak-rise' | 'no-grants';

interface LeakState {
  kind: LeakKind;
  signature: string;
  message: string;
  detail: string;
}

function readDismissedSig(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissedSig(sig: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, sig);
  } catch {
    /* ignore */
  }
}

export const ConsentLeakWarning = () => {
  const [available, setAvailable] = useState(false);
  const [leak, setLeak] = useState<LeakState | null>(null);
  const lastHeldRef = useRef<number>(0);
  const firstSeenAllZeroRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDevConsentToggleAvailable()) return;
    setAvailable(true);
  }, []);

  useEffect(() => {
    if (!available) return;
    const dismissed = readDismissedSig();

    const check = () => {
      const s = summarizeConsentLog();
      let next: LeakState | null = null;

      // Trigger 1: held/revoked-fires increased since last poll
      if (s.firedWhileHeld > lastHeldRef.current) {
        const added = s.firedWhileHeld - lastHeldRef.current;
        const sig = `leak-rise:${s.firedWhileHeld}`;
        next = {
          kind: 'leak-rise',
          signature: sig,
          message: `${added} new pixel event${added > 1 ? 's' : ''} fired without granted consent`,
          detail: `Total leaked: ${s.firedWhileHeld} · Granted: ${s.firedWhileGranted}. Check the event timeline to see which event leaked.`,
        };
      }
      lastHeldRef.current = s.firedWhileHeld;

      // Trigger 2: events fired but none granted, persisting past grace
      if (!next && s.tikTokEvents > 0 && s.firedWhileGranted === 0) {
        const now = Date.now();
        if (firstSeenAllZeroRef.current === null) {
          firstSeenAllZeroRef.current = now;
        } else if (now - firstSeenAllZeroRef.current >= GRANTED_GRACE_MS) {
          const sig = `no-grants:${s.tikTokEvents}`;
          next = {
            kind: 'no-grants',
            signature: sig,
            message: `${s.tikTokEvents} pixel event${s.tikTokEvents > 1 ? 's' : ''} fired but 0 reached TikTok with consent`,
            detail: 'TikTok will not receive any conversions until consent is granted. Accept the banner or check the consent flow.',
          };
        }
      } else {
        firstSeenAllZeroRef.current = s.firedWhileGranted === 0 && s.tikTokEvents > 0 ? firstSeenAllZeroRef.current : null;
      }

      if (next && next.signature !== dismissed) {
        setLeak(next);
      } else if (!next) {
        setLeak(null);
      }
    };

    check();
    const t = setInterval(check, POLL_MS);
    return () => clearInterval(t);
  }, [available]);

  if (!available || !leak) return null;

  const onDismiss = () => {
    writeDismissedSig(leak.signature);
    setLeak(null);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483646,
        width: 'min(440px, 92vw)',
        padding: 12,
        background: 'hsl(0 60% 96%)',
        color: 'hsl(0 70% 22%)',
        border: '1px solid hsl(0 70% 60%)',
        borderLeft: '4px solid hsl(0 70% 48%)',
        borderRadius: 8,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 12, marginBottom: 2 }}>
            GDPR tracking leak detected
          </strong>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{leak.message}</div>
          <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.45, color: 'hsl(0 30% 28%)' }}>
            {leak.detail}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss warning"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: 'hsl(0 30% 28%)',
            padding: 0,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default ConsentLeakWarning;