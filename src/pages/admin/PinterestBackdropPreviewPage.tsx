import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Image as ImageIcon, Send, RefreshCw, Dices } from "lucide-react";

type PreviewPin = {
  hook_group: string;
  pin_variant: string;
  pin_title: string;
  pin_description: string;
  pin_image_url: string;
  destination_link: string;
  scheduled_at: string;
  overlay_text: string;
  backdrop_url: string | null;
  backdrop_query: string | null;
  backdrop_avg_color?: string | null;
  backdrop_source?: "pexels" | "cloudinary_fallback" | null;
  backdrop_width?: number | null;
  backdrop_height?: number | null;
  backdrop_photographer?: string | null;
  backdrop_pexels_page?: string | null;
  backdrop_hook_group?: string | null;
  backdrop_style?: "dark" | "subtle" | "accent" | null;
  backdrop_score?: number | null;
  backdrop_variants?: Array<{ style: string; score: number; url: string }> | null;
  uses_lifestyle_backdrop: boolean;
};

const DEFAULT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

const HOOKS: Array<{ key: string; label: string }> = [
  { key: "pain", label: "Pain" },
  { key: "curiosity", label: "Curiosity" },
  { key: "time_saving", label: "Time-saving" },
  { key: "social_proof", label: "Social proof" },
  { key: "transformation", label: "Transformation" },
];

export default function PinterestBackdropPreviewPage() {
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [useBackdrop, setUseBackdrop] = useState(true);
  // Per-hook toggle. Default mirrors legacy "every other pin" pattern (0,2,4).
  const [backdropByHook, setBackdropByHook] = useState<Record<string, boolean>>({
    pain: true,
    curiosity: false,
    time_saving: true,
    social_proof: false,
    transformation: true,
  });
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [rerollingAll, setRerollingAll] = useState(false);
  const [rerollingHook, setRerollingHook] = useState<string | null>(null);
  const [pins, setPins] = useState<PreviewPin[]>([]);
  const [batchTag, setBatchTag] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setPins([]);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: slug,
          useLifestyleBackdrop: useBackdrop,
          backdropByHook: useBackdrop ? backdropByHook : undefined,
          dryRun: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Preview failed");
      setPins(data.pins || []);
      setBatchTag(data.batchTag || null);
      toast.success(`Preview ready — ${data.pins?.length ?? 0} pins`);
    } catch (e: any) {
      toast.error(e?.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-roll backdrops without rebuilding AI copy / queue order.
   * - When `hookKey` is null → reroll ALL enabled hooks.
   * - When `hookKey` is set  → reroll just that one hook (others unchanged).
   * Server returns a fresh dry-run; we merge only the backdrop_* fields onto
   * existing pins so titles/descriptions/scheduled_at stay stable.
   */
  async function rerollBackdrops(hookKey: string | null) {
    if (!useBackdrop) {
      toast.error("Lifestyle backdrop is uitgeschakeld");
      return;
    }
    if (hookKey) setRerollingHook(hookKey);
    else setRerollingAll(true);
    try {
      const targetMap: Record<string, boolean> = hookKey
        ? { ...Object.fromEntries(HOOKS.map((h) => [h.key, false])), [hookKey]: true }
        : backdropByHook;
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: slug,
          useLifestyleBackdrop: true,
          backdropByHook: targetMap,
          dryRun: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Reroll failed");
      const fresh: PreviewPin[] = data.pins || [];
      setPins((prev) =>
        prev.map((p) => {
          const updated = fresh.find((f) => f.hook_group === p.hook_group);
          if (!updated || !updated.uses_lifestyle_backdrop) return p;
          if (hookKey && p.hook_group !== hookKey) return p;
          return {
            ...p,
            pin_image_url: updated.pin_image_url,
            pin_variant: updated.pin_variant,
            backdrop_url: updated.backdrop_url,
            backdrop_query: updated.backdrop_query,
            backdrop_avg_color: updated.backdrop_avg_color,
            backdrop_source: updated.backdrop_source,
            backdrop_width: updated.backdrop_width,
            backdrop_height: updated.backdrop_height,
            backdrop_photographer: updated.backdrop_photographer,
            backdrop_pexels_page: updated.backdrop_pexels_page,
            backdrop_hook_group: updated.backdrop_hook_group,
            backdrop_style: updated.backdrop_style,
            backdrop_score: updated.backdrop_score,
            backdrop_variants: updated.backdrop_variants,
            uses_lifestyle_backdrop: true,
          };
        }),
      );
      toast.success(hookKey ? `Re-rolled ${hookKey}` : "Re-rolled all backdrops");
    } catch (e: any) {
      toast.error(e?.message || "Reroll failed");
    } finally {
      setRerollingAll(false);
      setRerollingHook(null);
    }
  }

  async function queueForReal() {
    setQueueing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: slug,
          useLifestyleBackdrop: useBackdrop,
          backdropByHook: useBackdrop ? backdropByHook : undefined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Queue failed");
      toast.success(data.message || "Queued");
    } catch (e: any) {
      toast.error(e?.message || "Queue failed");
    } finally {
      setQueueing(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Pinterest Backdrop Preview | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-primary" />
            Pinterest Backdrop Preview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspecteer welke Pexels lifestyle-backdrops gekozen worden vóórdat
            de pins in de queue belanden. Product foto blijft altijd dominant.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-end">
              <div>
                <Label htmlFor="slug" className="text-xs">Product slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="product-slug"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="lifestyle"
                  checked={useBackdrop}
                  onCheckedChange={setUseBackdrop}
                />
                <Label htmlFor="lifestyle" className="text-xs cursor-pointer">
                  Lifestyle backdrop
                </Label>
              </div>
              <Button onClick={runPreview} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Generate preview
              </Button>
            </div>

            {useBackdrop && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Backdrop per hook
                  </Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setBackdropByHook(Object.fromEntries(HOOKS.map((h) => [h.key, true])))
                      }
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      All on
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBackdropByHook(Object.fromEntries(HOOKS.map((h) => [h.key, false])))
                      }
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      All off
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {HOOKS.map((h) => (
                    <label
                      key={h.key}
                      className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border cursor-pointer hover:bg-accent"
                    >
                      <Switch
                        checked={!!backdropByHook[h.key]}
                        onCheckedChange={(v) =>
                          setBackdropByHook((prev) => ({ ...prev, [h.key]: v }))
                        }
                      />
                      <span>{h.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {pins.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4">
                <div className="text-xs text-muted-foreground">
                  Batch: <span className="font-mono">{batchTag}</span> · {pins.length} pins ·{" "}
                  {pins.filter((p) => p.uses_lifestyle_backdrop).length} met backdrop
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => rerollBackdrops(null)}
                    disabled={rerollingAll || !useBackdrop}
                  >
                    {rerollingAll ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Dices className="h-4 w-4 mr-2" />
                    )}
                    Reroll all backdrops
                  </Button>
                  <Button onClick={queueForReal} disabled={queueing}>
                    {queueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Queue for publish
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {pins.length === 0 && !loading && (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              Geen preview geladen. Klik op "Generate preview".
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pins.map((pin, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="relative bg-muted aspect-[9/16]">
                <img
                  src={pin.pin_image_url}
                  alt={pin.pin_title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <Badge className="absolute top-2 left-2 capitalize">
                  {pin.hook_group.replace("_", " ")}
                </Badge>
                {pin.uses_lifestyle_backdrop && (
                  <Badge variant="secondary" className="absolute top-2 right-2">
                    Lifestyle
                  </Badge>
                )}
                {pin.uses_lifestyle_backdrop && (
                  <button
                    type="button"
                    onClick={() => rerollBackdrops(pin.hook_group)}
                    disabled={rerollingHook === pin.hook_group || rerollingAll}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background/90 backdrop-blur text-[10px] font-medium border hover:bg-background disabled:opacity-50"
                    title="Reroll this backdrop"
                  >
                    {rerollingHook === pin.hook_group ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Dices className="h-3 w-3" />
                    )}
                    Reroll
                  </button>
                )}
              </div>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium line-clamp-2">{pin.pin_title}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {pin.pin_description}
                </p>
                {pin.uses_lifestyle_backdrop && pin.backdrop_url && (
                  <div className="border-t pt-2 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pin.backdrop_source === "cloudinary_fallback" ? "Fallback" : "Pexels"} · "{pin.backdrop_query}"
                      {pin.backdrop_avg_color && (
                        <span
                          className="inline-block w-3 h-3 rounded-sm border ml-2 align-middle"
                          style={{ backgroundColor: pin.backdrop_avg_color }}
                          title={`avg color ${pin.backdrop_avg_color}`}
                        />
                      )}
                      {pin.backdrop_source === "cloudinary_fallback" && (
                        <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1">
                          fallback
                        </Badge>
                      )}
                    </p>
                    <div className="text-[10px] text-muted-foreground space-y-0.5 leading-snug">
                      {pin.backdrop_hook_group && (
                        <div>
                          Hook:{" "}
                          <span className="font-medium capitalize text-foreground">
                            {pin.backdrop_hook_group.replace("_", " ")}
                          </span>
                        </div>
                      )}
                      {pin.backdrop_width && pin.backdrop_height && (
                        <div>
                          Resolution:{" "}
                          <span className="font-mono">
                            {pin.backdrop_width}×{pin.backdrop_height}
                          </span>
                        </div>
                      )}
                      {pin.backdrop_photographer && (
                        <div className="truncate">
                          Photo by{" "}
                          {pin.backdrop_pexels_page ? (
                            <a
                              href={pin.backdrop_pexels_page}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-foreground"
                            >
                              {pin.backdrop_photographer}
                            </a>
                          ) : (
                            <span>{pin.backdrop_photographer}</span>
                          )}{" "}
                          on Pexels
                        </div>
                      )}
                      <div className="truncate">
                        Source:{" "}
                        <a
                          href={pin.backdrop_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline hover:text-foreground"
                          title={pin.backdrop_url}
                        >
                          {pin.backdrop_url.replace(/^https?:\/\//, "").slice(0, 48)}
                          {pin.backdrop_url.length > 55 ? "…" : ""}
                        </a>
                      </div>
                    </div>
                    {pin.backdrop_variants && pin.backdrop_variants.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {pin.backdrop_variants.map((v) => {
                          const isWinner = v.style === pin.backdrop_style;
                          return (
                            <a
                              key={v.style}
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block rounded border overflow-hidden ${
                                isWinner
                                  ? "ring-2 ring-primary border-primary"
                                  : "opacity-70 hover:opacity-100"
                              }`}
                              title={`${v.style} · score ${v.score}`}
                            >
                              <div className="aspect-[9/16] bg-muted">
                                <img
                                  src={v.url}
                                  alt={`${v.style} variant`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="px-1 py-0.5 flex items-center justify-between text-[9px]">
                                <span className="capitalize font-medium">
                                  {v.style}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {v.score.toFixed(2)}
                                </span>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <a
                        href={pin.backdrop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={pin.backdrop_url}
                          alt="Pexels backdrop"
                          className="w-full h-24 object-cover rounded border"
                          loading="lazy"
                        />
                      </a>
                    )}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {new Date(pin.scheduled_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}