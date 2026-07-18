import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { Play, ChevronDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ProductVideo {
  id: string;
  storage_url: string;
  supplier_url: string | null;
  variant_key: string | null;
  source: string | null;
}

/**
 * Product-specific video suppression list.
 *
 * Some SKUs only have generic AI-generated `cinematic_v3` slideshow clips
 * attached — visually near-identical, no unique informational value beyond
 * the hero image, and they make the PDP feel like a low-effort dropship
 * page. For these SKUs we render no prominent video (and no "Show more
 * clips" reveal) rather than degrade the buying experience.
 *
 * Add a product ID here only after a manual media audit confirms none of
 * the attached videos meet the premium bar for that PDP. Removing a video
 * row from `product_media` is preferable long-term; this list is the
 * fail-safe for cases where the underlying rows are still referenced by
 * other tooling (e.g. Pinterest cinematic pipeline).
 */
const SUPPRESS_VIDEO_FOR_PRODUCT_IDS = new Set<string>([
  // GetPawsy Automatic Cat Litter Box — 2 cinematic_v3 slideshow clips only.
  "128e0207-8a94-4d71-b428-5b7f5002528f",
]);

interface Props {
  productId: string;
  productName: string;
  posterUrl?: string;
  className?: string;
  /**
   * Max videos shown up-front. Prevents the "3 stacked repetitive videos"
   * amateur look on PDPs where suppliers ship near-identical slideshow
   * clips. Extras stay accessible behind a "More clips" reveal. Default 1.
   */
  maxVisible?: number;
}

/**
 * Product video section — fetches `product_media` rows of type `video` for
 * the given product and renders them as tap-to-play players below the main
 * gallery. Safe for CWV: poster only, no autoplay, `preload="metadata"`.
 * Emits a VideoObject schema for the first video so it's eligible for the
 * Google video carousel.
 */
export function ProductVideoSection({ productId, productName, posterUrl, className, maxVisible = 1 }: Props) {
  // Product-specific override: skip the network call entirely for suppressed SKUs.
  const suppressed = SUPPRESS_VIDEO_FOR_PRODUCT_IDS.has(productId);
  const { data } = useQuery({
    queryKey: ["product-media-videos", productId],
    queryFn: async (): Promise<ProductVideo[]> => {
      const { data, error } = await supabase
        .from("product_media")
        .select("id, storage_url, supplier_url, variant_key, source")
        .eq("product_id", productId)
        .eq("media_type", "video")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductVideo[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !suppressed,
  });

  const [showAll, setShowAll] = useState(false);
  if (suppressed) return null;
  const videos = data ?? [];
  if (videos.length === 0) return null;

  const firstVideoUrl = videos[0]?.storage_url;
  const primary = videos.slice(0, Math.max(1, maxVisible));
  const extras = videos.slice(primary.length);

  return (
    <section className={cn("w-full space-y-3", className)} aria-label="Product videos">
      {firstVideoUrl && (
        <Helmet>
          <script type="application/ld+json">
            {JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoObject",
              name: `${productName} — Product video`,
              description: `${productName} product video on GetPawsy.`,
              thumbnailUrl: posterUrl ?? firstVideoUrl,
              contentUrl: firstVideoUrl,
              uploadDate: new Date().toISOString().split("T")[0],
            })}
          </script>
        </Helmet>
      )}
      <div className="w-full">
        {primary.map((v, idx) => (
          <ProductVideoTile
            key={v.id}
            src={v.storage_url}
            posterUrl={posterUrl}
            label={idx === 0 ? `Watch: ${productName}` : `${productName} – clip ${idx + 1}`}
          />
        ))}
      </div>
      {extras.length > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Show {extras.length} more clip{extras.length !== 1 ? "s" : ""}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
      {extras.length > 0 && showAll && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extras.map((v, idx) => (
            <ProductVideoTile
              key={v.id}
              src={v.storage_url}
              posterUrl={posterUrl}
              label={`${productName} – clip ${primary.length + idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductVideoTile({ src, posterUrl, label }: { src: string; posterUrl?: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-muted shadow-soft">
      {playing ? (
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          autoPlay
          muted
          className="w-full h-full object-contain bg-black"
          aria-label={label}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group relative w-full h-full"
          aria-label={`Play video: ${label}`}
        >
          {posterUrl ? (
            <img src={posterUrl} alt={label} loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <video
              src={src}
              preload="metadata"
              muted
              playsInline
              className="w-full h-full object-cover pointer-events-none"
              // first frame as poster; #t=0.1 helps Safari render a frame
              poster={undefined}
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <span className="rounded-full bg-white/95 p-4 shadow-soft">
              <Play className="h-7 w-7 text-foreground fill-foreground" aria-hidden="true" />
            </span>
          </span>
          <span className="absolute bottom-2 left-2 right-2 text-xs text-white/95 drop-shadow font-medium truncate">
            {label}
          </span>
        </button>
      )}
    </div>
  );
}

export default ProductVideoSection;