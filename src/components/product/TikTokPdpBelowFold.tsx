/**
 * Below-the-fold details for the TikTok PDP variant. Loaded lazily so the
 * initial paint contains only the hero + buy box.
 */
interface Product {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
}

export default function TikTokPdpBelowFold({ product }: { product: Product }) {
  const descriptionHasHtml =
    !!product.description && product.description.includes('<') && product.description.includes('>');

  return (
    <div className="mt-3 space-y-6 text-sm text-foreground/90 leading-relaxed pb-8">
      {product.description && (
        <div>
          <h2 className="text-base font-bold mb-2">About this product</h2>
          {descriptionHasHtml ? (
            <div
              className="prose prose-sm max-w-none"
              // Description HTML originates from the trusted product CMS; sanitized upstream.
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          ) : (
            <p className="whitespace-pre-line">{product.description}</p>
          )}
        </div>
      )}

      <div>
        <h2 className="text-base font-bold mb-2">Shipping & returns</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Free US shipping on orders over $35.</li>
          <li>Ships in 1–2 business days from US warehouses.</li>
          <li>30-day hassle-free returns.</li>
          <li>Secure checkout via Stripe — Apple Pay, Google Pay, cards.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-base font-bold mb-2">FAQs</h2>
        <details className="rounded-lg bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer font-semibold">Is it safe for my pet?</summary>
          <p className="mt-2 text-foreground/80">
            Yes — all GetPawsy products are vetted against US safety standards before listing.
          </p>
        </details>
        <details className="rounded-lg bg-muted/40 px-3 py-2 mt-2">
          <summary className="cursor-pointer font-semibold">How long does shipping take?</summary>
          <p className="mt-2 text-foreground/80">
            Orders ship within 1–2 business days and arrive in 3–7 business days within the US.
          </p>
        </details>
        <details className="rounded-lg bg-muted/40 px-3 py-2 mt-2">
          <summary className="cursor-pointer font-semibold">Can I return it?</summary>
          <p className="mt-2 text-foreground/80">
            Yes. Returns are accepted within 30 days of delivery for any reason.
          </p>
        </details>
      </div>

      <p className="text-xs text-muted-foreground">
        Looking for the full product page?{' '}
        <a
          href={`?notiktok=1`}
          className="underline font-semibold"
        >
          View the desktop version
        </a>
        .
      </p>
    </div>
  );
}