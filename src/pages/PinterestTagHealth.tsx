import { useEffect, useState } from 'react';
import { getPinterestTagHealth, type PinterestTagHealth } from '@/hooks/usePinterestTracking';

/**
 * Public-facing Pinterest Tag health endpoint.
 * Route: /pinterest-tag-health
 *
 * Renders a JSON snapshot of the current Pinterest tracking state in the
 * browser (tag id, init/loaded flags, queue depth, consent, domain).
 * Use it to verify the tag is live without opening DevTools.
 */
export default function PinterestTagHealthPage() {
  const [snapshot, setSnapshot] = useState<PinterestTagHealth | null>(null);

  useEffect(() => {
    const tick = () => setSnapshot(getPinterestTagHealth());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const ok = snapshot?.status === 'ok';

  return (
    <main
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: '2rem',
        maxWidth: 720,
        margin: '0 auto',
        color: '#111',
        background: '#fff',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        Pinterest Tag Health
      </h1>
      <p style={{ marginTop: 0, color: '#475569' }}>
        Endpoint: <code>/pinterest-tag-health</code>
      </p>
      <p style={{ color: ok ? '#0a7f3f' : '#b1531a', marginTop: 0 }}>
        Status: <strong>{ok ? 'OK' : 'DEGRADED'}</strong>
      </p>
      <pre
        style={{
          background: '#0f172a',
          color: '#e2e8f0',
          padding: '1rem',
          borderRadius: 8,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        {JSON.stringify(snapshot ?? { loading: true }, null, 2)}
      </pre>
      <p style={{ fontSize: 12, color: '#64748b' }}>
        Updates every second. `consentGranted=false` on non-production hosts or
        before the visitor accepts marketing cookies is expected.
      </p>
    </main>
  );
}