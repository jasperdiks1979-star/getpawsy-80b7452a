/**
 * SlugResolverFallback — rendered when /products/{slug} does not match an
 * active product. Calls the public resolve-product-slug edge function which
 * runs the full recovery ladder (slug history -> alias -> sku -> cj_map ->
 * similar). On match: silent client-side replace navigation to the live
 * slug, preserving every query param (UTM, gclid, fbclid, pin_id, etc.) so
 * Pinterest / Ads / GA attribution is unaffected. On miss: standard
 * NotFound (noindex) — identical behavior to before.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import NotFound from "@/pages/NotFound";
import { ProductDetailSkeleton } from "@/components/products/ProductDetailSkeleton";
import { Layout } from "@/components/layout/Layout";

type Phase = "resolving" | "redirecting" | "not_found";

export default function SlugResolverFallback({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const guard = useRef(false);
  const [phase, setPhase] = useState<Phase>("resolving");

  useEffect(() => {
    if (guard.current) return;
    guard.current = true;
    if (!slug) {
      setPhase("not_found");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-product-slug", {
          body: { slug },
        });
        const targetSlug = (data as any)?.product_slug as string | null;
        const category = (data as any)?.category as string | null;
        const step = (data as any)?.step as string | undefined;
        const search = typeof window !== "undefined" ? window.location.search : "";
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (!error && targetSlug && targetSlug !== slug && step && step !== "not_found" && step !== "category") {
          setPhase("redirecting");
          navigate(`/products/${targetSlug}${search}${hash}`, { replace: true });
          return;
        }
        // Category-level fallback: redirect to /collections/{category} so the
        // user lands on a real shopping surface instead of a 404. This
        // recovers Pinterest traffic for pins whose product was deactivated.
        if (!error && step === "category" && category) {
          setPhase("redirecting");
          navigate(`/collections/${category}${search}${hash}`, { replace: true });
          return;
        }
      } catch {
        // fall through to NotFound
      }
      setPhase("not_found");
    })();
  }, [slug, navigate]);

  if (phase === "not_found") return <NotFound />;
  return (
    <Layout>
      <ProductDetailSkeleton />
    </Layout>
  );
}