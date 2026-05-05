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
import { Loader2, Image as ImageIcon, Send, RefreshCw } from "lucide-react";

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
  backdrop_style?: "dark" | "subtle" | "accent" | null;
  backdrop_score?: number | null;
  backdrop_variants?: Array<{ style: string; score: number; url: string }> | null;
  uses_lifestyle_backdrop: boolean;
};

const DEFAULT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

export default function PinterestBackdropPreviewPage() {
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [useBackdrop, setUseBackdrop] = useState(true);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [pins, setPins] = useState<PreviewPin[]>([]);
  const [batchTag, setBatchTag] = useState<string | null>(null);

  async function runPreview() {
    setLoading(true);
    setPins([]);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: { productSlug: slug, useLifestyleBackdrop: useBackdrop, dryRun: true },
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

  async function queueForReal() {
    setQueueing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: { productSlug: slug, useLifestyleBackdrop: useBackdrop },
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

            {pins.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4">
                <div className="text-xs text-muted-foreground">
                  Batch: <span className="font-mono">{batchTag}</span> · {pins.length} pins ·{" "}
                  {pins.filter((p) => p.uses_lifestyle_backdrop).length} met backdrop
                </div>
                <Button onClick={queueForReal} disabled={queueing}>
                  {queueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Queue for publish
                </Button>
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
              </div>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-medium line-clamp-2">{pin.pin_title}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {pin.pin_description}
                </p>
                {pin.uses_lifestyle_backdrop && pin.backdrop_url && (
                  <div className="border-t pt-2 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pexels · "{pin.backdrop_query}"
                      {pin.backdrop_avg_color && (
                        <span
                          className="inline-block w-3 h-3 rounded-sm border ml-2 align-middle"
                          style={{ backgroundColor: pin.backdrop_avg_color }}
                          title={`avg color ${pin.backdrop_avg_color}`}
                        />
                      )}
                    </p>
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