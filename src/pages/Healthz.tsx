import { BUILD_ID, BUILD_TS } from '@/lib/boot-diagnostics';

/**
 * /healthz — plain-text health check page.
 * No layout, no auth, no redirects.
 */
export default function Healthz() {
  return (
    <pre style={{ fontFamily: 'monospace', padding: 20 }}>
      {`ok build=${BUILD_ID} ts=${BUILD_TS}`}
    </pre>
  );
}
