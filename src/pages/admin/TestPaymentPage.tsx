import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, AlertTriangle, CreditCard } from "lucide-react";

/**
 * Hidden admin-only test payment page.
 * Triggers a $0.50 real Stripe checkout to validate the production webhook flow.
 * Refund yourself afterwards via Stripe Dashboard.
 */
export default function TestPaymentPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="text-muted-foreground mt-2">Admin only.</p>
      </div>
    );
  }

  const handleStartTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "create-test-checkout",
        { body: {} },
      );
      if (invokeError) throw invokeError;
      if (!data?.url) throw new Error("No checkout URL returned");
      window.location.href = data.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Test Payment — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Test Payment</h1>
          <p className="text-muted-foreground mt-2">
            Validate the production webhook + email flow with a $0.50 charge.
          </p>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Real charge.</strong> Your card will be debited $0.50 USD
            (~€0.46) plus Stripe fees. Refund yourself afterwards via the
            Stripe Dashboard → Payments → Refund.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>What this validates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Stripe Checkout session creation (live mode)</li>
              <li>Webhook signature verification with the live secret</li>
              <li>Order creation in the database</li>
              <li>Order confirmation email delivery</li>
              <li>Redirect to /payment-success page</li>
            </ul>
            <p className="text-muted-foreground pt-2">
              The test charge is <strong>not</strong> added to your product
              catalog, sitemap, or feed. It exists only as a Stripe line item
              and a row in the orders table.
            </p>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          size="lg"
          onClick={handleStartTest}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating checkout session...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              Start $0.50 test payment
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          You will be redirected to Stripe Checkout. Use your own card.
        </p>
      </div>
    </>
  );
}