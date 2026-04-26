/**
 * TikTokEventMatrix — compact session-scoped status per TikTok pixel event.
 *
 * Reads the consent log and shows for each canonical TikTok event
 * (Pageview / ViewContent / AddToCart / CompletePayment) whether it was
 * actually attempted in the current session and — if so — under which
 * consent state. Sent = at least one attempt while ttq state was
 * "granted". Held = attempts only happened while held/revoked. Not yet =
 * never fired this session.
 *
 * Pure presentation, no mutations.
 */
import { getConsentLog, type ConsentLogEntry } from '@/lib/consentLog';

type Status = 'sent' | 'held' | 'pending';

interface RowData {
  label: string;        // Display name (TikTok terminology)
  internal: string;     // Internal event name (matches logTikTokEvent arg)
  trigger: string;      // Where it fires from
  status: Status;
  totalAttempts: number;
  grantedAttempts: number;
  heldAttempts: number;
  lastTs: number | null;
}

const EVENTS: Array<Pick<RowData, 'label' | 'internal' | 'trigger'>> = [
  { label: 'Pageview',         internal: 'page',              trigger: 'Route changes' },
  { label: 'ViewContent',      internal: 'ViewContent',       trigger: 'PDP mount' },
  { label: 'AddToCart',        internal: 'AddToCart',         trigger: 'Add-to-cart click' },
  { label: 'InitiateCheckout', internal: 'InitiateCheckout',  trigger: 'Stripe redirect' },
  { label: 'CompletePayment',  internal: 'CompletePayment',   trigger: '/thank-you mount' },
];

function buildRows(): RowData[] {
  const log = getConsentLog();
  const tikTokEvents = log.filter(
    (e): e is Extract<ConsentLogEntry, { kind: 'tiktok-event' }> => e.kind === 'tiktok-event',
  );

  return EVENTS.map((spec) => {
    const matches = tikTokEvents.filter((e) => e.event === spec.internal);
    const grantedAttempts = matches.filter((e) => e.consentState === 'granted').length;
    const heldAttempts = matches.filter(
      (e) => e.consentState === 'held' || e.consentState === 'revoked',
    ).length;
    const lastTs = matches.length ? matches[matches.length - 1].ts : null;

    let status: Status = 'pending';
    if (grantedAttempts > 0) status = 'sent';
    else if (heldAttempts > 0) status = 'held';

    return {
      ...spec,
      status,
      totalAttempts: matches.length,
      grantedAttempts,
      heldAttempts,
      lastTs,
    };
  });
}

const COLORS: Record<Status, { bg: string; fg: string; border: string; icon: string; label: string }> = {
  sent:    { bg: 'hsl(142 50% 94%)', fg: 'hsl(142 70% 28%)', border: 'hsl(142 50% 70%)', icon: '✓', label: 'sent' },
  held:    { bg: 'hsl(0 60% 95%)',   fg: 'hsl(0 70% 38%)',   border: 'hsl(0 60% 75%)',   icon: '⚠', label: 'held' },
  pending: { bg: 'hsl(38 30% 96%)',  fg: 'hsl(25 18% 42%)',  border: 'hsl(38 30% 88%)',  icon: '○', label: 'not yet' },
};

function fmtAgo(ts: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 1000) return 'now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export const TikTokEventMatrix = () => {
  const rows = buildRows();
  const sentCount = rows.filter((r) => r.status === 'sent').length;
  const heldCount = rows.filter((r) => r.status === 'held').length;

  return (
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <strong
          style={{ fontSize: 10 }}
          title="Sessie-overzicht per TikTok event. Toont of het event minstens 1× verstuurd is in deze browsersessie."
        >
          TikTok event matrix
        </strong>
        <span
          style={{ fontSize: 9, opacity: 0.7 }}
          title="sent = events die minstens 1× met granted consent zijn verstuurd · held = events die alleen tijdens held/revoked geprobeerd zijn (dus niet afgeleverd)"
        >
          {sentCount} sent · {heldCount} held
        </span>
      </div>

      <div
        style={{
          fontSize: 9,
          opacity: 0.75,
          marginBottom: 6,
          lineHeight: 1.4,
        }}
      >
        Per event: <strong>✓ sent</strong> = afgeleverd aan TikTok ·{' '}
        <strong>⚠ held</strong> = geblokkeerd door consent ·{' '}
        <strong>○ not yet</strong> = nog niet getriggerd in deze sessie. Hover een rij voor trigger + laatste poging.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((r) => {
          const c = COLORS[r.status];
          const tooltip =
            `${r.label} (intern: ${r.internal})\n` +
            `Trigger: ${r.trigger}\n` +
            `Pogingen totaal: ${r.totalAttempts} · afgeleverd: ${r.grantedAttempts} · geblokkeerd: ${r.heldAttempts}\n` +
            `Laatste poging: ${fmtAgo(r.lastTs)}`;
          return (
            <div
              key={r.internal}
              title={tooltip}
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 4,
                padding: '3px 6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ color: c.fg, fontWeight: 700 }}>
                {c.icon} {r.label}
              </span>
              <span style={{ color: c.fg, fontSize: 9 }}>
                {r.status === 'sent' && `${r.grantedAttempts}× · ${fmtAgo(r.lastTs)}`}
                {r.status === 'held' && `${r.heldAttempts}× held`}
                {r.status === 'pending' && 'not yet'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TikTokEventMatrix;