/**
 * PinterestDynamicLanding — /go/:slug
 *
 * Mobile-first, Pinterest-native continuity page. Composes hero copy,
 * lifestyle narrative, transformation block, social proof, premium trust
 * stack and a sticky CTA from a `pinterest_landing_templates` row served
 * by the `pinterest-landing-resolver` edge function.
 *
 * Phase 1 of the Pinterest Ecommerce Growth Engine — keeps pin → page
 * tone, palette, and emotional angle congruent with the inbound pin.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";
import PinterestLandingBanner from "@/components/products/PinterestLandingBanner";
import { TrustStack } from "@/components/products/TrustStack";
import { WhyCustomersChoose } from "@/components/products/WhyCustomersChoose";
import {
  recordPinterestAttribution,
  emitClarityEvent,
  enqueueCapiEvent,
} from "@/lib/pinterest-conversion-intel";

interface ResolvedProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
}

interface ResolvedTemplate {
  slug: string;
  niche_key?: string | null;
  hook_type?: string | null;
  emotional_angle?: string | null;
  hero_eyebrow?: string | null;
  hero_headline: string;
  hero_subhead?: string | null;
  cta_label: string;
  cta_tone?: string | null;
  color_atmosphere?: string | null;
  lifestyle_image_keywords?: string[] | null;
  transformation_before?: string | null;
  transformation_after?: string | null;
  trust_block_variant?: string | null;
  recommended_product_slug?: string | null;
  recommended_collection_slug?: string | null;
  pin_mode?: string | null;
  aesthetic_tone?: string | null;
}

const ATMOSPHERE_BG: Record<string, string> = {
  cozy_neutral: "from-stone-50 via-amber-50/40 to-rose-50/30",
  warm_travel: "from-amber-50 via-orange-50/40 to-stone-50",
  scandi_warm: "from-stone-50 via-amber-50/30 to-amber-100/20",
  soft_morning: "from-rose-50/40 via-amber-50/40 to-stone-50",
  warm_bedroom: "from-amber-50/60 via-rose-50/30 to-stone-50",
  cool_clean: "from-sky-50/40 via-stone-50 to-emerald-50/20",
};

function bgFor(atmosphere?: string | null) {
  return ATMOSPHERE_BG[atmosphere ?? "cozy_neutral"] ?? ATMOSPHERE_BG.cozy_neutral;
}

// Phase 7 — per-pin-mode visual congruency. Each mode swaps the hero
// treatment so the landing page matches the inbound pin's aesthetic.
type PinModeTreatment = {
  bg: string;
  heroAlign: "center" | "left";
  headlineSize: string;
  eyebrowTone: string;
  emphasizeTransformation: boolean;
};
const PIN_MODE_TREATMENT: Record<string, PinModeTreatment> = {
  luxury_minimal: {
    bg: "from-stone-50 via-amber-50/20 to-stone-100/40",
    heroAlign: "center",
    headlineSize: "text-3xl sm:text-4xl tracking-tight",
    eyebrowTone: "text-stone-500",
    emphasizeTransformation: false,
  },
  cozy_lifestyle: {
    bg: "from-amber-50 via-rose-50/30 to-stone-50",
    heroAlign: "center",
    headlineSize: "text-3xl sm:text-4xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
  before_after: {
    bg: "from-stone-50 via-amber-50/30 to-emerald-50/20",
    heroAlign: "left",
    headlineSize: "text-2xl sm:text-3xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: true,
  },
  transformation: {
    bg: "from-amber-50 via-stone-50 to-emerald-50/30",
    heroAlign: "left",
    headlineSize: "text-3xl sm:text-4xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: true,
  },
  emotional_pain: {
    bg: "from-stone-100/60 via-stone-50 to-amber-50/30",
    heroAlign: "left",
    headlineSize: "text-2xl sm:text-3xl",
    eyebrowTone: "text-stone-500",
    emphasizeTransformation: true,
  },
  social_proof: {
    bg: "from-amber-50/60 via-rose-50/20 to-stone-50",
    heroAlign: "center",
    headlineSize: "text-2xl sm:text-3xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
  viral_curiosity: {
    bg: "from-stone-50 via-amber-100/30 to-rose-50/30",
    heroAlign: "center",
    headlineSize: "text-3xl sm:text-4xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
  ugc_style: {
    bg: "from-amber-50/50 via-stone-50 to-rose-50/20",
    heroAlign: "left",
    headlineSize: "text-2xl sm:text-3xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
  moodboard_collage: {
    bg: "from-stone-50 via-amber-50/30 to-rose-50/20",
    heroAlign: "center",
    headlineSize: "text-3xl sm:text-4xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
  product_lifestyle_blend: {
    bg: "from-stone-50 via-amber-50/40 to-rose-50/30",
    heroAlign: "center",
    headlineSize: "text-3xl sm:text-4xl",
    eyebrowTone: "text-primary",
    emphasizeTransformation: false,
  },
};
const DEFAULT_TREATMENT: PinModeTreatment = PIN_MODE_TREATMENT.product_lifestyle_blend;

function treatmentFor(pinMode?: string | null): PinModeTreatment {
  if (!pinMode) return DEFAULT_TREATMENT;
  return PIN_MODE_TREATMENT[pinMode] ?? DEFAULT_TREATMENT;
}

export default function PinterestDynamicLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const hookParam = searchParams.get("hook");
  const intentParam = searchParams.get("intent");
  const pinModeParam = searchParams.get("pin_mode");
  const pinId = searchParams.get("pin_id");

  const [template, setTemplate] = useState<ResolvedTemplate | null>(null);
  const [products, setProducts] = useState<ResolvedProduct[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "missing" | "error">(
    "loading",
  );

  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!slug) return;
      setStatus("loading");
      try {
        const { data, error } = await supabase.functions.invoke(
          "pinterest-landing-resolver",
          {
            body: undefined,
            method: "GET",
          },
        );
        // The supabase-js invoke can't pass query params directly for GET,
        // so fall back to a direct fetch using the project URL.
        let payload: { ok: boolean; data?: { template: ResolvedTemplate; products: ResolvedProduct[] } } | null = null;
        if (data && (data as { ok?: boolean }).ok) {
          payload = data as typeof payload;
        } else {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pinterest-landing-resolver?slug=${encodeURIComponent(slug)}${hookParam ? `&hook=${encodeURIComponent(hookParam)}` : ""}${intentParam ? `&intent=${encodeURIComponent(intentParam)}` : ""}${pinModeParam ? `&pin_mode=${encodeURIComponent(pinModeParam)}` : ""}`;
          const resp = await fetch(url, {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          });
          payload = await resp.json();
          if (error && !payload?.ok) console.warn("[go] resolver invoke fallback", error);
        }
        if (aborted) return;
        if (!payload?.ok || !payload.data) {
          setStatus("missing");
          return;
        }
        setTemplate(payload.data.template);
        setProducts(payload.data.products ?? []);
        setStatus("ok");
      } catch (e) {
        console.error("[go] load failed", e);
        if (!aborted) setStatus("error");
      }
    }
    void load();
    return () => {
      aborted = true;
    };
  }, [slug, hookParam, intentParam, pinModeParam]);

  // Fire a Clarity tag so /go heatmaps can filter by slug + hook.
  useEffect(() => {
    if (status !== "ok" || !template) return;
    try {
      const w = window as unknown as {
        clarity?: (cmd: string, key: string, value: string) => void;
      };
      w.clarity?.("set", "go_slug", template.slug);
      if (template.hook_type) w.clarity?.("set", "go_hook", template.hook_type);
      if (template.emotional_angle) w.clarity?.("set", "go_intent", template.emotional_angle);
      if (template.pin_mode) w.clarity?.("set", "go_pin_mode", template.pin_mode);
      if (template.aesthetic_tone) w.clarity?.("set", "go_aesthetic", template.aesthetic_tone);
      if (pinId) w.clarity?.("set", "go_pin_id", pinId);
    } catch {
      /* noop */
    }

    // Phase 6 — persist attribution + emit a Pinterest-native funnel event +
    // enqueue a server-side view_content event for the CAPI relay.
    void recordPinterestAttribution({
      pin_id: pinId,
      pin_mode: template.pin_mode,
      landing_slug: template.slug,
      niche_key: template.niche_key,
      hook_category: template.hook_type,
    });
    emitClarityEvent("pinterest_landing_view", {
      pin_mode: template.pin_mode ?? "unknown",
      slug: template.slug,
    });
    void enqueueCapiEvent("view_content", {
      product_id: primaryProduct?.id ?? null,
      value: primaryProduct?.price ?? null,
      currency: "USD",
      custom_data: {
        pin_mode: template.pin_mode,
        landing_slug: template.slug,
        niche_key: template.niche_key,
      },
    });
  }, [status, template, pinId]);

  const primaryProduct = products[0];
  const ctaHref = useMemo(() => {
    if (primaryProduct?.slug) {
      const u = new URLSearchParams(searchParams);
      if (!u.get("utm_source")) u.set("utm_source", "pinterest");
      if (!u.get("utm_medium")) u.set("utm_medium", "social");
      if (!u.get("utm_campaign")) u.set("utm_campaign", "go_landing");
      u.set("utm_content", template?.slug ?? "go");
      return `/products/${primaryProduct.slug}?${u.toString()}`;
    }
    if (template?.recommended_collection_slug) {
      return `/collections/${template.recommended_collection_slug}`;
    }
    return "/products";
  }, [primaryProduct, template, searchParams]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading your experience…</div>
      </div>
    );
  }

  if (status === "missing" || status === "error" || !template) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 text-center">
        <Helmet>
          <meta name="robots" content="noindex,follow" />
        </Helmet>
        <h1 className="text-2xl font-display font-semibold text-foreground">
          We couldn’t find that experience.
        </h1>
        <p className="mt-3 text-muted-foreground max-w-sm">
          The link may have expired. Browse our most-loved picks instead.
        </p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Shop bestsellers <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const title = `${template.hero_headline} | GetPawsy`;
  const description =
    template.hero_subhead ??
    "A premium, calmer way to care for your pet — built around what actually works.";

  const treatment = treatmentFor(template.pin_mode);
  const heroBg = template.color_atmosphere ? bgFor(template.color_atmosphere) : treatment.bg;
  const heroAlignClass = treatment.heroAlign === "left" ? "text-left" : "text-center";

  return (
    <main
      className={`min-h-screen bg-gradient-to-b ${heroBg}`}
      data-pin-mode={template.pin_mode ?? "default"}
      data-aesthetic-tone={template.aesthetic_tone ?? "default"}
    >
      <Helmet>
        <title>{title.slice(0, 60)}</title>
        <meta name="description" content={description.slice(0, 160)} />
        {/* Pinterest landing pages are intentionally not indexed — drive paid/social traffic only */}
        <meta name="robots" content="noindex,follow" />
      </Helmet>

      <div className="mx-auto max-w-md px-4 pt-4 pb-32">
        <PinterestLandingBanner hook={template.hook_type} />

        {/* Hero */}
        <section className={`mt-6 ${heroAlignClass}`}>
          {template.hero_eyebrow && (
            <p className={`inline-flex items-center gap-1.5 rounded-full bg-background/70 backdrop-blur px-3 py-1 text-[11px] font-medium uppercase tracking-wider ${treatment.eyebrowTone}`}>
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              {template.hero_eyebrow}
            </p>
          )}
          <h1 className={`mt-3 ${treatment.headlineSize} font-display font-bold text-foreground leading-tight`}>
            {template.hero_headline}
          </h1>
          {template.hero_subhead && (
            <p className="mt-3 text-base text-muted-foreground leading-relaxed">
              {template.hero_subhead}
            </p>
          )}
        </section>

        {/* Hero product / CTA */}
        {primaryProduct && (
          <section className="mt-6 rounded-2xl bg-background/80 backdrop-blur border border-border/40 p-4 shadow-sm">
            {primaryProduct.image_url && (
              <img
                src={primaryProduct.image_url}
                alt={primaryProduct.name}
                className="w-full aspect-square rounded-xl object-cover"
                loading="eager"
                width={400}
                height={400}
              />
            )}
            <h2 className="mt-3 text-base font-semibold text-foreground line-clamp-2">
              {primaryProduct.name}
            </h2>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-bold text-foreground">
                ${Number(primaryProduct.price).toFixed(2)}
              </span>
              {primaryProduct.compare_at_price &&
                Number(primaryProduct.compare_at_price) > Number(primaryProduct.price) && (
                  <span className="text-xs text-muted-foreground line-through">
                    ${Number(primaryProduct.compare_at_price).toFixed(2)}
                  </span>
                )}
            </div>
            <Link
              to={ctaHref}
              data-cta="go_hero"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:shadow-lg transition-shadow"
            >
              {template.cta_label} <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        )}

        {/* Transformation narrative */}
        {(template.transformation_before || template.transformation_after) && (
          <section className={`mt-8 grid grid-cols-1 gap-3 ${treatment.emphasizeTransformation ? "scale-[1.01]" : ""}`}>
            {template.transformation_before && (
              <div className={`rounded-xl border ${treatment.emphasizeTransformation ? "border-stone-300/60" : "border-border/40"} bg-background/60 p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Today
                </p>
                <p className="mt-1 text-sm text-foreground/90 leading-relaxed">
                  {template.transformation_before}
                </p>
              </div>
            )}
            {template.transformation_after && (
              <div className={`rounded-xl ${treatment.emphasizeTransformation ? "border-2 border-primary/40 bg-primary/10" : "border border-primary/30 bg-primary/5"} p-4`}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  After
                </p>
                <p className="mt-1 text-sm text-foreground leading-relaxed">
                  {template.transformation_after}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Companions */}
        {products.length > 1 && (
          <section className="mt-10">
            <h2 className="text-lg font-display font-bold text-foreground">
              Pairs beautifully with
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {products.slice(1, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/products/${p.slug}`}
                  className="rounded-xl border border-border/40 bg-background/80 p-2"
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      loading="lazy"
                      width={200}
                      height={200}
                      className="w-full aspect-square rounded-lg object-cover"
                    />
                  )}
                  <p className="mt-2 text-xs font-medium text-foreground line-clamp-2">
                    {p.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    ${Number(p.price).toFixed(2)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Trust */}
        <section className="mt-10 rounded-2xl bg-background/80 backdrop-blur border border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">
              Why thousands of US pet parents trust GetPawsy
            </h2>
          </div>
          <TrustStack />
        </section>

        <WhyCustomersChoose />
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
        <div className="mx-auto max-w-md">
          <Link
            to={ctaHref}
            data-cta="go_sticky"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            {template.cta_label} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}