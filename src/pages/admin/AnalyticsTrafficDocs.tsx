/**
 * /admin/analytics-traffic — Internal documentation for Jasper
 * How to use the internal/test traffic system and GA4 filtering.
 */
const AnalyticsTrafficDocs = () => {
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>📊 Analytics Traffic Guide</h1>

      <Section title="1. Tag yourself as internal traffic">
        <p>Open any page with <Code>?internal=1</Code> appended:</p>
        <CodeBlock>https://getpawsy.pet/?internal=1</CodeBlock>
        <p>This sets a cookie (<Code>gp_internal=1</Code>) that persists for 1 year. Works on any device, any IP.</p>
      </Section>

      <Section title="2. Turn it off">
        <CodeBlock>https://getpawsy.pet/?internal=0</CodeBlock>
        <p>Or use the floating chip (bottom-right) when visible.</p>
      </Section>

      <Section title="3. Debug overlay">
        <p>Add <Code>?bootdebug=1</Code> to any URL to see the internal traffic chip, even if you're not flagged.</p>
        <p>Double-click the chip to expand debug info (traffic type, source hint, current route).</p>
      </Section>

      <Section title="4. GA4 Reporting — US + Google Organic">
        <p>In GA4, create a comparison or segment:</p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Country = <strong>United States</strong></li>
          <li>Session source/medium = <strong>google / organic</strong></li>
          <li>Custom dimension <Code>traffic_type</Code> = <strong>external</strong></li>
        </ul>
        <p>This excludes all your test/NL traffic regardless of IP or device.</p>
      </Section>

      <Section title="5. GA4 Data Filter (recommended)">
        <p>In GA4 → Admin → Data Filters:</p>
        <ol style={{ paddingLeft: 20 }}>
          <li>Create a filter named "Exclude Internal Traffic"</li>
          <li>Filter type: <strong>Developer traffic</strong> (or custom based on <Code>traffic_type=internal</Code>)</li>
          <li>Set state to <strong>Active</strong></li>
        </ol>
      </Section>

      <Section title="6. How to validate">
        <ol style={{ paddingLeft: 20 }}>
          <li>Open GA4 → Realtime → look for your session</li>
          <li>Check the <Code>traffic_type</Code> user property: should be <strong>internal</strong></li>
          <li>In GA4 DebugView: enable debug mode in Chrome GA Debugger extension</li>
          <li>Verify conversion events (purchase, add_to_cart) are suppressed when internal</li>
        </ol>
      </Section>

      <Section title="7. Test orders">
        <p>When <Code>internal=1</Code>, all order events are tagged with <Code>test_order=true</Code>.</p>
        <p>In your backend dashboard, filter out orders where this flag is set.</p>
      </Section>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 28 }}>
    <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</h2>
    <div style={{ color: '#374151', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>{children}</code>
);

const CodeBlock = ({ children }: { children: React.ReactNode }) => (
  <pre style={{ background: '#1f2937', color: '#e5e7eb', padding: '10px 14px', borderRadius: 6, fontSize: 13, overflow: 'auto', margin: '8px 0' }}>
    {children}
  </pre>
);

export default AnalyticsTrafficDocs;
