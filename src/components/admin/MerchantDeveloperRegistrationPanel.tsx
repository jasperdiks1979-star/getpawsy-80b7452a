import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheck, ShieldAlert, Copy } from 'lucide-react';
import { toast } from 'sonner';

const MERCHANT_ADMIN_USER_ID = '1b97d610-98c8-46c0-b363-63ef6495fa8a';

type Result = { status: number | null; body: unknown; error?: string };

async function invoke(action: 'check' | 'register', developerEmail?: string): Promise<Result> {
  try {
    const { data, error } = await supabase.functions.invoke('merchant-developer-registration', {
      body: { action, developerEmail },
    });
    if (!error) return { status: 200, body: data };
    const status = (error as { context?: { status?: number } }).context?.status ?? null;
    return { status, body: data ?? null, error: error.message };
  } catch (e) {
    return { status: null, body: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function Block({ title, r }: { title: string; r: Result }) {
  const pretty = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="outline">HTTP {r.status ?? 'ERR'}</Badge>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(pretty); toast.success('Copied'); }}>
          <Copy className="h-3 w-3 mr-1" />Copy
        </Button>
      </div>
      <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-words">{pretty}</pre>
    </div>
  );
}

export function MerchantDeveloperRegistrationPanel() {
  const { user } = useAuth();
  const [checkResult, setCheckResult] = useState<Result | null>(null);
  const [regResult, setRegResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');

  const signedIn = !!user;
  const adminMatch = user?.id === MERCHANT_ADMIN_USER_ID;

  const priorBody =
    checkResult?.status === 200 && checkResult.body && typeof checkResult.body === 'object'
      ? (checkResult.body as { verdict?: string; canRegister?: boolean; endpointVersion?: string })
      : null;
  const priorVerdict = priorBody?.verdict ?? null;
  const serverAllowsRegister = priorBody?.canRegister === true;
  const canRegister = serverAllowsRegister && priorVerdict === 'NOT_REGISTERED' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const runCheck = async () => {
    setChecking(true);
    setRegResult(null);
    setCheckResult(await invoke('check'));
    setChecking(false);
  };

  const runRegister = async () => {
    if (!canRegister) return;
    if (!confirm(`Register the Google Cloud project owning the OAuth client with Merchant Center 5717571566 using developer email:\n\n${email}\n\nThis is a one-time developer registration. It does NOT modify products, feeds, prices, inventory or users.`)) return;
    setRegistering(true);
    setRegResult(await invoke('register', email));
    setRegistering(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Merchant API — Developer Registration
        </CardTitle>
        <CardDescription>
          One-time mandatory registration linking the Google Cloud project (owner of
          <code className="mx-1">GOOGLE_OAUTH_CLIENT_ID</code>) to Merchant Center
          <code className="mx-1">5717571566</code>. Read-only check first. No API keys,
          no service accounts, no product/feed/data-source writes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={signedIn ? 'default' : 'secondary'} className="gap-1">
            {signedIn ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {signedIn ? 'Signed in' : 'Signed out'}
          </Badge>
          <Badge variant={adminMatch ? 'default' : 'secondary'} className="gap-1">
            {adminMatch ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {adminMatch ? 'Merchant admin matched' : 'Merchant admin not matched'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={runCheck} disabled={!signedIn || checking}>
            {checking && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            1. Check registration state
          </Button>
        </div>

        {checkResult && <Block title="developerRegistration (GET)" r={checkResult} />}

        {priorVerdict === 'NOT_REGISTERED' && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label htmlFor="dev-email">Developer contact email (Google account)</Label>
              <Input
                id="dev-email"
                type="email"
                placeholder="support@getpawsy.pet"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must be a valid Google account. Used as the Merchant API developer contact.
              </p>
            </div>
            <Button onClick={runRegister} disabled={!canRegister || registering} variant="default">
              {registering && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              2. Register GCP with Merchant Center 5717571566
            </Button>
          </div>
        )}

        {priorVerdict === 'ALREADY_REGISTERED_TO_5717571566' && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
            Already registered. No action needed. If listDataSources still 401s, verify Merchant Center
            "Users &amp; access" for the connected Google identity.
          </div>
        )}

        {priorVerdict === 'REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            The GCP project is already registered to a different Merchant account.
            Manual review required in Google Cloud Console. Do NOT re-register.
          </div>
        )}

        {priorVerdict === 'MERCHANT_API_NOT_ENABLED' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Merchant API is not enabled in the Google Cloud project owning the OAuth client.
            Enable it in Google Cloud Console and retry the check.
          </div>
        )}

        {priorVerdict === 'ENDPOINT_VERSION_OBSOLETE' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            The Merchant API endpoint version in use has been discontinued. This is a code defect —
            not a registration state. Do not attempt to register.
          </div>
        )}

        {priorVerdict === 'CALLER_NOT_MERCHANT_ADMIN' && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            The connected Google identity is not a Merchant Center admin for 5717571566.
            Grant admin access under Merchant Center → Users &amp; access, then retry.
          </div>
        )}

        {regResult && <Block title="registerGcp (POST)" r={regResult} />}
      </CardContent>
    </Card>
  );
}

export default MerchantDeveloperRegistrationPanel;