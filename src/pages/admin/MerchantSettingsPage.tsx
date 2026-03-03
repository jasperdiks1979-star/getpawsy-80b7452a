import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface SecretStatus {
  configured: boolean;
  hint: string;
}

const SECRET_META: {
  key: string;
  label: string;
  description: string;
  validationHint?: string;
}[] = [
  {
    key: 'GOOGLE_OAUTH_CLIENT_ID',
    label: 'OAuth Client ID',
    description: 'Must contain ".apps.googleusercontent.com"',
    validationHint: '.apps.googleusercontent.com',
  },
  {
    key: 'GOOGLE_OAUTH_CLIENT_SECRET',
    label: 'OAuth Client Secret',
    description: 'Sensitive — stored as encrypted environment secret',
  },
  {
    key: 'GOOGLE_OAUTH_REDIRECT_URI',
    label: 'OAuth Redirect URI',
    description: 'Must start with "https://"',
    validationHint: 'https://',
  },
  {
    key: 'GOOGLE_MERCHANT_CENTER_ID',
    label: 'Merchant Center ID',
    description: 'Numeric ID from Google Merchant Center',
  },
  {
    key: 'TOKEN_ENCRYPTION_KEY',
    label: 'Token Encryption Key',
    description: 'AES-GCM key for encrypting refresh tokens at rest',
  },
];

export default function MerchantSettingsPage() {
  const { invokeFunction } = useAuthenticatedFetch();
  const navigate = useNavigate();
  const [secrets, setSecrets] = useState<Record<string, SecretStatus>>({});
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await invokeFunction<{ ok: boolean; secrets: Record<string, SecretStatus> }>(
        'merchant-secrets-status',
        { silent: true }
      );
      if (data?.ok) {
        setSecrets(data.secrets);
      }
    } catch {
      toast.error('Failed to load secret status');
    } finally {
      setLoading(false);
    }
  }, [invokeFunction]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const allConfigured = SECRET_META.every((s) => secrets[s.key]?.configured);
  const configuredCount = SECRET_META.filter((s) => secrets[s.key]?.configured).length;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Merchant Settings | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-6 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/integrations/merchant')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Merchant OAuth Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Environment secrets status — values are never exposed to the browser.
            </p>
          </div>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Configuration Status
            </CardTitle>
            <CardDescription>
              {configuredCount}/{SECRET_META.length} secrets configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allConfigured ? (
              <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-foreground font-medium">All required secrets are configured.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm p-3 rounded-md bg-destructive/10">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-foreground font-medium">
                  Some secrets are missing. Update them via Lovable Cloud secrets management.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Individual secrets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Secret Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {SECRET_META.map((meta) => {
              const status = secrets[meta.key];
              return (
                <div
                  key={meta.key}
                  className="flex items-start justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-medium text-foreground">
                        {meta.key}
                      </code>
                      {status?.configured ? (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Set
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" /> Missing
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    {status?.configured ? (
                      <code className="text-xs text-muted-foreground font-mono">{status.hint}</code>
                    ) : (
                      <span className="text-xs text-destructive">Not configured</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* How to update */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">How to update secrets</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Secrets are managed as encrypted environment variables via Lovable Cloud.
              They are <strong>not stored in the database</strong> and are never exposed to the browser.
            </p>
            <p>
              To update a secret, ask Lovable in chat: <em>"Update GOOGLE_OAUTH_CLIENT_ID secret"</em>.
              You'll be prompted with a secure form to enter the new value.
            </p>
            <a
              href="https://docs.lovable.dev/features/cloud"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-2"
            >
              Learn more about Lovable Cloud secrets <ExternalLink className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
