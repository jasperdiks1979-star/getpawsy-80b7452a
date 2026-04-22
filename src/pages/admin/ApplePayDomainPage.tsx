import { Helmet } from "react-helmet-async";
import { ApplePayDomainPanel } from "@/components/admin/ApplePayDomainPanel";

export default function ApplePayDomainPage() {
  return (
    <>
      <Helmet>
        <title>Apple Pay Domain | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="p-6 max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Apple Pay Domain</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify and monitor Apple Pay / Google Pay surfacing on getpawsy.pet via Stripe.
          </p>
        </header>
        <ApplePayDomainPanel />
      </div>
    </>
  );
}
