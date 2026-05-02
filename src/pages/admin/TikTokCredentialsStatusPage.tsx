import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, Loader2, PlayCircle, XCircle, AlertTriangle } from "lucide-react";

interface EventResult {
  ok: boolean;
  status: number;
  error: string | null;
  tiktok: { code?: number; message?: string; request_id?: string } | null;
}

interface TestResponse {
  ok: boolean;
  runId: string;
  results: {
    initiateCheckout: EventResult;
    purchase: EventResult;
  };
}

function ResultRow({ label, r }: { label: string; r: EventResult }) {
  const Icon = r.ok ? CheckCircle2 : XCircle;
  const tone = r.ok ? "text-emerald-600" : "text-destructive";
  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <Icon className={`h-5 w-5 ${tone}`} />
          {label}
        </div>
        <Badge variant={r.ok ? "default" : "destructive"}>HTTP {r.status || "—"}</Badge>
      </div>
      {r.tiktok?.message && (
        <p className="text-sm text-muted-foreground">
          TikTok: <span className="font-mono">{r.tiktok.code} — {r.tiktok.message}</span>
        </p>
      )}
      {r.error && <p className="text-sm text-destructive break-words">{r.error}</p>}
      {r.tiktok?.request_id && (
        <p className="text-xs text-muted-foreground font-mono">req: {r.tiktok.request_id}</p>
      )}
    </div>
  );
}

export default function TikTokCredentialsStatusPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke<TestResponse>(
        "tiktok-events-test-fire",
        { body: {} },
      );
      if (error) throw error;
      setResult(data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const bothOk = result?.results.initiateCheckout.ok && result?.results.purchase.ok;
  const anyAuthError =
    result &&
    [result.results.initiateCheckout, result.results.purchase].some(
      (r) => r.status === 401 || (r.tiktok?.code && r.tiktok.code !== 0),
    );

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Helmet>
        <title>TikTok Credentials Status — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <RouterLink to="/admin">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
          </RouterLink>
        </Button>
        <h1 className="text-2xl font-bold">TikTok Credentials Status</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Fires test <code>InitiateCheckout</code> + <code>CompletePayment</code> events against the
          TikTok Events API to verify your <code>TIKTOK_EVENTS_API_TOKEN</code> and{" "}
          <code>TIKTOK_PIXEL_ID</code> are valid.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run validation test</CardTitle>
          <CardDescription>
            A successful run returns HTTP 200 with TikTok <code>code: 0</code> for both events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runTest} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" /> Run test
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Could not reach test function</AlertTitle>
              <AlertDescription className="break-words">{error}</AlertDescription>
            </Alert>
          )}

          {result && (
            <>
              <Alert variant={bothOk ? "default" : "destructive"}>
                {bothOk ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {bothOk
                    ? "Credentials are valid — TikTok accepted both events"
                    : anyAuthError
                      ? "TikTok rejected the events — check token or pixel ID"
                      : "Test failed — see details below"}
                </AlertTitle>
                <AlertDescription className="text-xs font-mono">
                  run id: {result.runId}
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <ResultRow label="InitiateCheckout" r={result.results.initiateCheckout} />
                <ResultRow label="CompletePayment (Purchase)" r={result.results.purchase} />
              </div>

              <p className="text-xs text-muted-foreground">
                Detailed dispatch log:{" "}
                <RouterLink to="/admin/tiktok-server-events" className="underline">
                  /admin/tiktok-server-events
                </RouterLink>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}