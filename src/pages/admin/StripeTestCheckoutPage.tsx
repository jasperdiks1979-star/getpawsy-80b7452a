import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { AdminRouteGuard } from "@/components/auth/AdminRouteGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthenticatedFetch } from "@/hooks/useAuthenticatedFetch";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ExternalLink, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CreateResp {
  ok?: boolean;
  url?: string;
  sessionId?: string;
  mode?: string;
  amountCents?: number;
  warning?: string | null;
  error?: string;
  code?: string;
}

interface VerifyResp {
  ok?: boolean;
  verdict?: "PASS" | "FAIL";
  sessionId?: string;
  paymentIntentId?: string | null;
  stripeSessionStatus?: string;
  stripePaymentStatus?: string;
  paymentIntentStatus?: string | null;
  walletType?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  customerEmail?: string | null;
  order?: { id: string; status: string; total_amount: number } | null;
  orderCreated?: boolean;
  orderPaid?: boolean;
  productHidden?: boolean;
  statementDescriptorSuffix?: string | null;
  timestamp?: string;
  error?: string;
}

function StripeTestCheckoutInner() {
  const { invokeFunction } = useAuthenticatedFetch();
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [session, setSession] = useState<CreateResp | null>(null);
  const [verify, setVerify] = useState<VerifyResp | null>(null);

  // If Stripe redirected here after payment, auto-verify.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sid = p.get("session_id");
    if (sid && p.get("status") === "success") {
      void runVerify(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function invokeRaw<T>(name: string, body: unknown = {}): Promise<{ data: T | null; status: number; error?: string }> {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? ""}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    if (!res.ok) {
      return { data: parsed, status: res.status, error: parsed?.error ?? `HTTP ${res.status}` };
    }
    return { data: parsed, status: res.status };
  }

  async function runCreate() {
    setCreating(true);
    const { data, status, error } = await invokeRaw<CreateResp>("admin-stripe-test-checkout");
    setCreating(false);
    if (error || !data?.url) {
      const msg = `[admin-stripe-test-checkout] HTTP ${status} — ${error ?? "Failed"} ${data ? JSON.stringify(data) : ""}`;
      console.error(msg, { data, status });
      toast.error(msg);
      return;
    }
    setSession(data);
    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  async function runVerify(sessionId?: string) {
    setVerifying(true);
    const { data, status, error } = await invokeRaw<VerifyResp>("admin-stripe-test-verify", sessionId ? { sessionId } : {});
    setVerifying(false);
    if (error) {
      const msg = `[admin-stripe-test-verify] HTTP ${status} — ${error} ${data ? JSON.stringify(data) : ""}`;
      console.error(msg, { data, status });
      toast.error(msg);
      return;
    }
    setVerify(data);
  }

  async function runCleanup() {
    if (!confirm("Disable the internal QA product? Orders and payments are preserved.")) return;
    setCleaning(true);
    const { data, status, error } = await invokeRaw<{ ok: boolean; error?: string }>("admin-stripe-test-cleanup");
    setCleaning(false);
    if (error || !data?.ok) {
      const msg = `[admin-stripe-test-cleanup] HTTP ${status} — ${error ?? "Cleanup failed"} ${data ? JSON.stringify(data) : ""}`;
      console.error(msg, { data, status });
      toast.error(msg);
    } else toast.success("QA product disabled. Financial records preserved.");
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <Helmet>
        <title>Stripe Test Checkout — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div>
        <h1 className="text-3xl font-bold">Stripe Live Test Checkout</h1>
        <p className="text-muted-foreground mt-1">
          Internal QA. Creates a real $0.50 live Stripe Checkout with wallet
          support (Apple Pay / Google Pay / Link) and no shipping friction.
        </p>
      </div>

      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-destructive text-base">LIVE TEST PAYMENT — real charge</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A real card will be charged $0.50. Refund via Stripe dashboard.
          Max 3 sessions per admin per 24 hours. Product is hidden from the
          storefront, sitemap, Pinterest and business KPIs.
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>1. Create $0.50 live Stripe test checkout</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={runCreate} disabled={creating} size="lg">
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create $0.50 Live Stripe Test Checkout
          </Button>
          {session?.url && (
            <div className="text-sm space-y-1">
              <div>Mode: <span className="font-mono">{session.mode}</span></div>
              <div>Session: <span className="font-mono break-all">{session.sessionId}</span></div>
              <a
                href={session.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline"
              >
                Open Stripe Checkout <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2. Verify latest test payment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => runVerify()} disabled={verifying} variant="secondary">
            {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify latest test payment
          </Button>
          {verify && (
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/30">
              <div className={`font-bold ${verify.verdict === "PASS" ? "text-green-600" : "text-destructive"}`}>
                {verify.verdict === "PASS" ? <ShieldCheck className="inline h-4 w-4 mr-1" /> : <AlertTriangle className="inline h-4 w-4 mr-1" />}
                {verify.verdict ?? "—"}
              </div>
              <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(verify, null, 2)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>3. Cleanup (archive QA product)</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={runCleanup} disabled={cleaning} variant="destructive">
            {cleaning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Disable QA product (preserve orders)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StripeTestCheckoutPage() {
  return (
    <AdminRouteGuard>
      <StripeTestCheckoutInner />
    </AdminRouteGuard>
  );
}