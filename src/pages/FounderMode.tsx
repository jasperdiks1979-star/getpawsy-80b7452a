import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Helmet } from 'react-helmet-async';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getFounderModeStatus, enableFounderMode, disableFounderMode, getFounderEventLog, getTrafficType } from '@/lib/founder-mode';
import { Shield, ShieldOff, Copy, Check } from 'lucide-react';

const FounderModePage = () => {
  const [isEnabled, setIsEnabled] = useState(getFounderModeStatus());
  const [copied, setCopied] = useState(false);
  const [eventLog, setEventLog] = useState(getFounderEventLog());

  useEffect(() => {
    const interval = setInterval(() => setEventLog(getFounderEventLog()), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = (checked: boolean) => {
    if (checked) {
      enableFounderMode();
    } else {
      disableFounderMode();
    }
    setIsEnabled(checked);
  };

  const copyStatus = () => {
    const status = JSON.stringify({
      founderMode: isEnabled,
      trafficType: getTrafficType(),
      localStorage: localStorage.getItem('gp_founder'),
      cookie: document.cookie.includes('gp_founder=1'),
      timestamp: new Date().toISOString(),
    }, null, 2);
    navigator.clipboard.writeText(status);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Layout>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Founder Mode | GetPawsy</title>
      </Helmet>
      <div className="container px-4 md:px-6 py-16 max-w-lg mx-auto">
        <div className="text-center mb-8">
          {isEnabled ? (
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary" />
          ) : (
            <ShieldOff className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          )}
          <h1 className="text-2xl font-display font-bold mb-2">Founder Mode</h1>
          <p className="text-muted-foreground text-sm">
            When enabled, ALL analytics events are suppressed on this device.
            No purchase, checkout, or browsing events will reach GA4.
          </p>
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">Founder Mode</p>
              <p className="text-sm text-muted-foreground">Suppress all analytics</p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={handleToggle} />
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={isEnabled ? 'default' : 'secondary'}>
                {isEnabled ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">traffic_type</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{getTrafficType()}</code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">localStorage</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">{localStorage.getItem('gp_founder') || 'null'}</code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cookie</span>
              <code className="text-xs bg-muted px-2 py-0.5 rounded">
                {document.cookie.includes('gp_founder=1') ? 'set' : 'not set'}
              </code>
            </div>
          </div>

          <button
            onClick={copyStatus}
            className="w-full flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-lg border hover:bg-muted transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Status JSON'}
          </button>
        </div>

        {eventLog.length > 0 && (
          <div className="mt-6 bg-card border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">Recent Analytics Events</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {eventLog.slice(0, 10).map((evt, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                  <code className="truncate max-w-[140px]">{evt.name}</code>
                  <div className="flex items-center gap-2">
                    <Badge variant={evt.suppressed ? 'destructive' : 'secondary'} className="text-[10px]">
                      {evt.suppressed ? 'BLOCKED' : 'SENT'}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          Activate via secret key URL: <code>?gp_key=&lt;your-secret&gt;</code> on any page
        </p>
      </div>
    </Layout>
  );
};

export default FounderModePage;
