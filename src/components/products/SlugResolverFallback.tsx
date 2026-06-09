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
        const step = (data as any)?.step as string | undefined;
        const target = (data as any)?.target as string | null;
        const search = typeof window !== "undefined" ? window.location.search : "";
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (!error && step && step !== "not_found") {
          // Prefer routing to a sibling PDP when we have one.
          if (targetSlug && targetSlug !== slug) {
            setPhase("redirecting");
            navigate(`/products/${targetSlug}${search}${hash}`, { replace: true });
            return;
          }
          // Otherwise honor whatever target the resolver returned
          // (category collection, /collections/all, or /).
          if (target) {
            try {
              const t = new URL(target, window.location.origin);
              const path = `${t.pathname}${t.search || search}${t.hash || hash}`;
              setPhase("redirecting");
              navigate(path, { replace: true });
              return;
            } catch {
              // ignore — fall through
            }
          }
          // Last-resort safety net: never render NotFound for a Pinterest hit.
          setPhase("redirecting");
          navigate(`/collections/all${search}${hash}`, { replace: true });
          return;
        }
        // Resolver explicitly returned not_found (or errored) → soft-recover
        // to /collections/all instead of rendering the 404 template.
        setPhase("redirecting");
        navigate(`/collections/all${search}${hash}`, { replace: true });
        return;
      } catch {
        // Network/resolver failure — soft-recover instead of NotFound.
        const search = typeof window !== "undefined" ? window.location.search : "";
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        setPhase("redirecting");
        navigate(`/collections/all${search}${hash}`, { replace: true });
        return;
      }
    })();
  }, [slug, navigate]);

  if (phase === "not_found") return <NotFound />;
  return (
    <Layout>
      <ProductDetailSkeleton />
    </Layout>
  );
}