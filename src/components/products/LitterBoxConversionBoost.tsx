import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  ShieldCheck,
  Truck,
  RotateCcw,
  Lock,
  Smartphone,
  Clock,
  Flame,
  Heart,
  CheckCircle2,
} from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import {
  RETURN_WINDOW_DAYS,
  FREE_SHIPPING_THRESHOLD,
} from "@/lib/shipping-constants";
import { APPROVED_SHIPPING_LINE } from "@/config/merchant-policy";

interface LitterBoxConversionBoostProps {
  /** Up to 14 product images — first 4 are cycled as an autoplaying visual loop. */
  images: string[];
  productName: string;
  inStock: boolean;
  reviewCount?: number;
  onCtaClick?: () => void;
}

/**
 * Litter Box PDP above-the-fold conversion booster.
 *
 * Renders ONLY for the Automatic Cat Litter Box product. Provides:
 * - Auto-cycling product image strip (acts as silent product video)
 * - Urgency + stock signal
 * - Trust badge row (shipping, returns, secure)
 * - "Why cat owners love this" 4-bullet block
 * - Before / After smell + mess messaging
 *
 * Production-safe: no checkout / pricing / cart logic. Pure presentation.
 */
export function LitterBoxConversionBoost({
  images,
  productName,
  inStock,
  reviewCount,
  onCtaClick,
}: LitterBoxConversionBoostProps) {
  const cycleImages = (images && images.length > 0 ? images : []).slice(0, 4);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (cycleImages.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % cycleImages.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [cycleImages.length]);

  return (
    <section
      aria-label="Why pet owners pick this self-cleaning litter box"
      className="mb-5 space-y-4"
    >
      {/* Auto-cycling kinetic visual + headline strip */}
      {cycleImages.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-background to-accent/5">
          <div className="relative aspect-[16/10] w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeIdx}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <OptimizedImage
                  src={cycleImages[activeIdx]}
                  alt={`${productName} — view ${activeIdx + 1}`}
                  className="h-full w-full object-cover"
                  priority
                />
              </motion.div>
            </AnimatePresence>

            {/* Top-left urgency chip */}
            {inStock && (
              <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm">
                <Flame className="h-3.5 w-3.5 text-destructive" />
                <span>Popular this week</span>
              </div>
            )}

            {/* Top-right app-control chip */}
            <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md backdrop-blur-sm">
              <Smartphone className="h-3.5 w-3.5" />
              <span>App control</span>
            </div>

            {/* Bottom dot indicator */}
            {cycleImages.length > 1 && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                {cycleImages.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === activeIdx ? "w-5 bg-primary" : "w-1.5 bg-foreground/30"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Urgency + shipping line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        {inStock ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            In stock — ships to United States
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
            <Clock className="h-3.5 w-3.5" /> Restocking soon
          </span>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Truck className="h-3.5 w-3.5" />
          Free US shipping over ${FREE_SHIPPING_THRESHOLD}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {APPROVED_SHIPPING_LINE}
        </span>
      </div>

      {/* Trust row — compact 4-icon strip */}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { icon: Truck, label: `Free over $${FREE_SHIPPING_THRESHOLD}` },
          { icon: RotateCcw, label: `${RETURN_WINDOW_DAYS}-day returns` },
          { icon: Lock, label: "Secure checkout" },
          { icon: ShieldCheck, label: "Customer Support" },
        ].map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 px-3 py-2 text-xs font-medium text-foreground"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Lower-funnel block — rendered further down the PDP under the buy box.
 * Emotional pain-point copy + before/after framing without breaking
 * compliance (no fabricated stats or fake reviews).
 */
export function LitterBoxLovedSection() {
  const reasons = [
    {
      icon: Sparkles,
      title: "Self-cleans after every visit",
      body:
        "Sensor-triggered cycle keeps the bed fresh so you don't scoop daily.",
    },
    {
      icon: Smartphone,
      title: "Control & monitor from your phone",
      body:
        "Start a cycle, check usage, and get alerts from the GetPawsy companion app.",
    },
    {
      icon: Heart,
      title: "Calmer cats, cleaner home",
      body:
        "Quiet motor and odor-sealed waste drawer reduce stress for shy cats.",
    },
    {
      icon: ShieldCheck,
      title: "Built for everyday use",
      body:
        "Removable parts, anti-tip base, and safety sensors that pause if your cat returns.",
    },
  ];

  return (
    <section
      aria-labelledby="why-cat-owners-love"
      className="my-10 rounded-2xl border border-border/40 bg-gradient-to-b from-muted/30 to-background p-5 md:p-8"
    >
      <header className="mb-6 text-center">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          Why cat owners love this
        </p>
        <h2
          id="why-cat-owners-love"
          className="text-2xl font-display font-bold text-foreground md:text-3xl"
        >
          Less scooping. Less smell. Happier cat.
        </h2>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {reasons.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex gap-3 rounded-xl bg-card p-4 shadow-sm"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="mb-1 text-sm font-semibold text-foreground">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Before / After smell + mess framing */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-destructive">
            Before
          </p>
          <ul className="space-y-1.5 text-sm text-foreground/90">
            <li>Daily scooping that nobody enjoys</li>
            <li>Lingering odor in the room</li>
            <li>Tracked litter across the floor</li>
          </ul>
        </div>
        <div className="rounded-xl border border-success/20 bg-success/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-success">
            After
          </p>
          <ul className="space-y-1.5 text-sm text-foreground/90">
            {[
              "Hands-off cleaning, every cycle",
              "Sealed drawer keeps odor contained",
              "Less mess around the box",
            ].map((item) => (
              <li key={item} className="flex items-start gap-1.5">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}