/**
 * GuidedConsentTest — step-by-step incognito CompletePayment verifier.
 *
 * Walks the operator through the exact sequence required to prove the
 * TikTok pixel fires `CompletePayment` under granted consent in a clean
 * (incognito) session. Each step auto-advances when its condition is met
 * by polling the consent log + ttq state every 600ms.
 *
 * Pure dev tooling — only mounted via DevConsentToggle on dev hosts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getConsentLog, clearConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

type StepStatus = 'pending' | 'active' | 'done' | 'fail';

interface StepMeta {
  status: StepStatus;
  doneAt: number | null;
}

interface GuidedConsentTestProps {
  onClose: () => void;
}

function readTtq(): 'granted' | 'held' | 'revoked' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const v = (window as any).__ttqConsent;
  return v === 'granted' || v === 'held' || v === 'revoked' ? v : 'unknown';
}

export const GuidedConsentTest = ({ onClose }: GuidedConsentTestProps) => {
  const [startTs, setStartTs] = useState<number>(() => Date.now());
  const [tick, setTick] = useState(0);
  // Per-step completion timestamps — captured the first poll a step turns done/fail
  const stepDoneAtRef = useRef<Record<number, number | null>>({ 1: null, 2: null, 3: null, 4: null });

  // Poll every 600ms while open
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 600);
    return () => clearInterval(t);
  }, []);

  const state = useMemo(() => {
    const log = getConsentLog().filter((e) => e.ts >= startTs);
    const ttq = readTtq();
    const consentChange = log.find((e) => e.kind === 'consent');
    const completePayment = log.find(
      (e) => e.kind === 'tiktok-event' && e.event === 'CompletePayment',
    ) as Extract<ReturnType<typeof getConsentLog>[number], { kind: 'tiktok-event' }> | undefined;
    return { log, ttq, consentChange, completePayment };
  }, [tick, startTs]);

  // Step status calculation (raw)
  const step1Status: StepStatus = 'done';
  const step2Status: StepStatus = state.consentChange ? 'done' : 'active';
  const step3Status: StepStatus =
    state.ttq === 'granted'
      ? 'done'
      : step2Status === 'done'
      ? 'active'
      : 'pending';
  const step4Status: StepStatus = state.completePayment
    ? state.completePayment.consentState === 'granted'
      ? 'done'
      : 'fail'
    : step3Status === 'done'
    ? 'active'
    : 'pending';

  // Capture completion timestamps the first time each step terminates
  const captureDoneAt = (n: number, status: StepStatus, sourceTs?: number) => {
    if ((status === 'done' || status === 'fail') && stepDoneAtRef.current[n] === null) {
      stepDoneAtRef.current[n] = sourceTs ?? Date.now();
    }
  };
  captureDoneAt(1, step1Status, startTs);
  captureDoneAt(2, step2Status, state.consentChange?.ts);
  captureDoneAt(3, step3Status);
  captureDoneAt(4, step4Status, state.completePayment?.ts);

  const step1: StepMeta = { status: step1Status, doneAt: stepDoneAtRef.current[1] };
  const step2: StepMeta = { status: step2Status, doneAt: stepDoneAtRef.current[2] };
  const step3: StepMeta = { status: step3Status, doneAt: stepDoneAtRef.current[3] };
  const step4: StepMeta = { status: step4Status, doneAt: stepDoneAtRef.current[4] };

  const allDone = step4.status === 'done';

  const reset = () => {
    clearConsentLog();
    setStartTs(Date.now());
    stepDoneAtRef.current = { 1: null, 2: null, 3: null, 4: null };
    setTick((n) => n + 1);
  };

  return (
    <div
      role="dialog"
      aria-label="Guided consent test"
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 2147483647,
        width: 280,
        padding: 12,
        background: '#fff',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 12 }}>🧪 Guided CompletePayment Test</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guided test"
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
        Verify the TikTok pixel fires <code>CompletePayment</code> under granted consent.
        Steps auto-check every 600 ms.
      </div>

      <ol style={{ marginTop: 10, paddingLeft: 0, listStyle: 'none' }}>
        <Step
          n={1}
          status={step1}
          title="Open this URL in an incognito window"
          body={
            <>
              Copy the current URL and open it in a fresh private window so no
              prior consent state leaks in.
              <CopyButton text={typeof window !== 'undefined' ? window.location.href : ''} />
            </>
          }
        />
        <Step
          n={2}
          status={step2}
          title="Accept the cookie banner"
          body={
            <>
              In the incognito tab, click <strong>Accept all</strong> on the
              cookie banner. Auto-detected: {state.consentChange?.kind === 'consent' ? (
                <code>{state.consentChange.value} ({state.consentChange.source})</code>
              ) : (
                <span style={{ color: 'hsl(25 18% 42%)' }}>waiting…</span>
              )}
            </>
          }
        />
        <Step
          n={3}
          status={step3}
          title="Confirm pixel state = granted"
          body={
            <>
              ttq is currently:{' '}
              <code
                style={{
                  color:
                    state.ttq === 'granted'
                      ? 'hsl(142 70% 32%)'
                      : state.ttq === 'held' || state.ttq === 'revoked'
                      ? 'hsl(0 70% 42%)'
                      : 'hsl(25 18% 42%)',
                }}
              >
                {state.ttq}
              </code>
            </>
          }
        />
        <Step
          n={4}
          status={step4}
          title="Complete a test purchase → /thank-you"
          body={
            <>
              Add an item to cart, check out with a Stripe test card
              (<code>4242 4242 4242 4242</code>), and land on{' '}
              <code>/thank-you</code>.
              {state.completePayment ? (
                state.completePayment.consentState === 'granted' ? (
                  <div style={{ color: 'hsl(142 70% 32%)', marginTop: 4 }}>
                    ✅ CompletePayment fired with consentState = granted
                  </div>
                ) : (
                  <div style={{ color: 'hsl(0 70% 42%)', marginTop: 4 }}>
                    ⚠️ CompletePayment fired but consentState ={' '}
                    <code>{state.completePayment.consentState}</code> — pixel
                    will reject this event.
                  </div>
                )
              ) : (
                <div style={{ color: 'hsl(25 18% 42%)', marginTop: 4 }}>
                  Waiting for purchase event…
                </div>
              )}
            </>
          }
        />
      </ol>

      {allDone && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: 'hsl(142 50% 94%)',
            border: '1px solid hsl(142 50% 70%)',
            borderRadius: 6,
            fontSize: 11,
            color: 'hsl(142 70% 22%)',
          }}
        >
          🎉 All checks passed. The TikTok pixel is correctly tracking
          purchases under granted consent. Safe to launch the US Spark Ad.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          type="button"
          onClick={reset}
          style={{
            flex: 1,
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
          ↻ Restart test
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            fontWeight: 600,
            background: 'hsl(22 70% 48%)',
            color: '#fff',
            border: '1px solid hsl(22 70% 48%)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: 'hsl(25 18% 42%)' }}>
        Tip: events are detected from the in-page consent log, so the
        purchase must happen in <em>this</em> browser tab/window.
      </div>
    </div>
  );
};

const Step = ({
  n,
  meta,
  startTs,
  title,
  body,
}: {
  n: number;
  meta: StepMeta;
  startTs: number;
  title: string;
  body: React.ReactNode;
}) => {
  const status = meta.status;
  const color =
    status === 'done'
      ? 'hsl(142 70% 32%)'
      : status === 'fail'
      ? 'hsl(0 70% 42%)'
      : status === 'active'
      ? 'hsl(22 70% 48%)'
      : 'hsl(25 18% 60%)';
  const icon = status === 'done' ? '✓' : status === 'fail' ? '✕' : status === 'active' ? '●' : '○';
  const ts = meta.doneAt;
  const stamp =
    ts !== null
      ? `${fmtClock(ts)} (+${fmtDelta(ts - startTs)})`
      : null;
  return (
    <li style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
      <div
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: status === 'done' ? color : 'transparent',
          color: status === 'done' ? '#fff' : color,
          border: `1.5px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, fontSize: 11, lineHeight: 1.45 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
          <div style={{ fontWeight: 600, color: 'hsl(25 30% 12%)' }}>
            Step {n}: {title}
          </div>
          {stamp && (
            <code style={{ fontSize: 9, color: color, whiteSpace: 'nowrap' }}>{stamp}</code>
          )}
        </div>
        <div style={{ marginTop: 2, color: 'hsl(25 18% 30%)' }}>{body}</div>
      </div>
    </li>
  );
};

function fmtClock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function fmtDelta(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function fmtEntry(e: ConsentLogEntry): { label: string; state: string; color: string } {
  if (e.kind === 'consent') {
    return {
      label: `consent → ${e.value}`,
      state: e.source,
      color: e.value === 'all' ? 'hsl(142 70% 32%)' : 'hsl(0 70% 42%)',
    };
  }
  return {
    label: e.event,
    state: e.consentState,
    color:
      e.consentState === 'granted'
        ? 'hsl(142 70% 32%)'
        : e.consentState === 'held' || e.consentState === 'revoked'
        ? 'hsl(0 70% 42%)'
        : 'hsl(25 18% 42%)',
  };
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      style={{
        marginLeft: 6,
        padding: '2px 6px',
        fontSize: 10,
        background: 'hsl(38 30% 96%)',
        color: 'hsl(25 30% 12%)',
        border: '1px solid hsl(38 30% 88%)',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {copied ? '✓ copied' : 'copy URL'}
    </button>
  );
};

export default GuidedConsentTest;