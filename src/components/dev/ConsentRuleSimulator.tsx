/**
 * ConsentRuleSimulator — side-by-side EU vs US consent rule preview.
 *
 * Pure presentation: shows what would happen for the same TikTok pixel
 * events under each region's rules, without mutating any real state.
 * Useful for verifying campaign assumptions before flipping the dev
 * override and reloading.
 *
 * Rules mirror src/lib/geoConsent.ts + src/lib/deferred-analytics.ts.
 */
import { useState } from 'react';

type Region = 'eu' | 'us';
type FireOutcome = 'fires' | 'held-then-fires' | 'blocked';

interface EventRule {
  event: string;
  trigger: string;
  eu: { outcome: FireOutcome; note: string };
  us: { outcome: FireOutcome; note: string };
}

const RULES: EventRule[] = [
  {
    event: 'Pageview',
    trigger: 'Every route change',
    eu: { outcome: 'held-then-fires', note: 'Held in queue until banner accept; sent retroactively on grant' },
    us: { outcome: 'fires', note: 'Auto-granted on first paint via timezone heuristic' },
  },
  {
    event: 'ViewContent',
    trigger: 'Product detail page mount',
    eu: { outcome: 'held-then-fires', note: 'Same hold-queue path as Pageview' },
    us: { outcome: 'fires', note: 'Fires immediately with full product payload' },
  },
  {
    event: 'AddToCart',
    trigger: 'Add-to-cart button click',
    eu: { outcome: 'blocked', note: 'If user rejects banner → never sent' },
    us: { outcome: 'fires', note: 'Sent in real-time, no banner shown' },
  },
  {
    event: 'InitiateCheckout',
    trigger: 'Stripe checkout redirect',
    eu: { outcome: 'held-then-fires', note: 'Fires only if banner already accepted' },
    us: { outcome: 'fires', note: 'Sent before redirect, full cart value attached' },
  },
  {
    event: 'CompletePayment',
    trigger: '/thank-you mount after Stripe success',
    eu: { outcome: 'blocked', note: 'Banner-rejected users → conversion lost from TikTok attribution' },
    us: { outcome: 'fires', note: 'Conversion event TikTok optimizes against' },
  },
];

const COLORS = {
  fires: { bg: 'hsl(142 50% 94%)', fg: 'hsl(142 70% 28%)', border: 'hsl(142 50% 70%)' },
  'held-then-fires': { bg: 'hsl(40 80% 94%)', fg: 'hsl(30 70% 32%)', border: 'hsl(40 80% 70%)' },
  blocked: { bg: 'hsl(0 60% 95%)', fg: 'hsl(0 70% 38%)', border: 'hsl(0 60% 75%)' },
} as const;

const LABELS: Record<FireOutcome, string> = {
  fires: '✓ Fires',
  'held-then-fires': '⏸ Held → fires on accept',
  blocked: '✕ Blocked if rejected',
};

interface ConsentRuleSimulatorProps {
  onClose: () => void;
}

export const ConsentRuleSimulator = ({ onClose }: ConsentRuleSimulatorProps) => {
  const [region, setRegion] = useState<Region | 'both'>('both');

  return (
    <div
      role="dialog"
      aria-label="Consent rule simulator"
      style={{
        position: 'fixed',
        inset: '50% auto auto 50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 2147483647,
        width: 'min(560px, 92vw)',
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
        <strong style={{ fontSize: 13 }}>⚖️ Consent Rule Simulator — EU vs US</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close simulator"
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
        How each TikTok pixel event behaves under the active consent rules.
        No state is changed — this is read-only.
      </p>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {(['both', 'eu', 'us'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRegion(r)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 11,
              fontWeight: 600,
              background: region === r ? 'hsl(22 70% 48%)' : 'transparent',
              color: region === r ? '#fff' : 'hsl(25 30% 12%)',
              border: '1px solid hsl(38 30% 88%)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {r === 'both' ? 'Side-by-side' : r === 'eu' ? '🇪🇺 EU only' : '🇺🇸 US only'}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {RULES.map((rule) => (
          <div
            key={rule.event}
            style={{
              border: '1px solid hsl(38 30% 92%)',
              borderRadius: 8,
              padding: 10,
              background: 'hsl(38 30% 99%)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <code style={{ fontSize: 12, fontWeight: 700 }}>{rule.event}</code>
              <span style={{ fontSize: 10, color: 'hsl(25 18% 42%)' }}>{rule.trigger}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: region === 'both' ? '1fr 1fr' : '1fr',
                gap: 6,
                marginTop: 8,
              }}
            >
              {(region === 'both' || region === 'eu') && (
                <Pill flag="🇪🇺" label="EU (GDPR)" outcome={rule.eu.outcome} note={rule.eu.note} />
              )}
              {(region === 'both' || region === 'us') && (
                <Pill flag="🇺🇸" label="US (CCPA)" outcome={rule.us.outcome} note={rule.us.note} />
              )}
            </div>
          </div>
        ))}
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
        <strong>Why it matters for the US Spark Ad:</strong> US visitors hit{' '}
        <code>fires</code> on every event with no banner friction → TikTok gets
        clean conversion signal. EU traffic only contributes when users accept
        the banner; rejects mean lost <code>CompletePayment</code> attribution.
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <Legend outcome="fires" />
        <Legend outcome="held-then-fires" />
        <Legend outcome="blocked" />
      </div>
    </div>
  );
};

const Pill = ({
  flag,
  label,
  outcome,
  note,
}: {
  flag: string;
  label: string;
  outcome: FireOutcome;
  note: string;
}) => {
  const c = COLORS[outcome];
  return (
    <div
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        padding: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 11, color: c.fg }}>
          {flag} {label}
        </strong>
        <span style={{ fontSize: 10, color: c.fg, fontWeight: 700 }}>{LABELS[outcome]}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: 'hsl(25 18% 30%)', lineHeight: 1.4 }}>{note}</div>
    </div>
  );
};

const Legend = ({ outcome }: { outcome: FireOutcome }) => {
  const c = COLORS[outcome];
  return (
    <div
      style={{
        flex: 1,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 4,
        padding: '4px 6px',
        fontSize: 10,
        color: c.fg,
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      {LABELS[outcome]}
    </div>
  );
};

export default ConsentRuleSimulator;