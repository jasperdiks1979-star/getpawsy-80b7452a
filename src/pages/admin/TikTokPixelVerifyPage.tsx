import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ttTrackViewContent,
  ttTrackAddToCart,
  ttTrackInitiateCheckout,
  ttTrackPurchase,
} from "@/lib/tiktok-pixel";

interface CapturedEvent {
  ts: string;
  tsMs: number;
  event: string;
  params: Record<string, unknown>;
  fired: boolean;
}

const PIXEL_ID = "D7KDRMBC77U9EB7RJROG";

/**
 * Admin diagnostic that fires the 4 core TikTok pixel events end-to-end
 * and captures the exact payload + timestamp that hit window.ttq.track.
 * If the pixel script hasn't loaded yet (consent not granted), the row
 * is still recorded with `fired: false` so we can see the call attempt.
 */
export default function TikTokPixelVerifyPage() {
  const [events, setEvents] = useState<CapturedEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [pixelLoaded, setPixelLoaded] = useState(false);
  const originalRef = useRef<((event: string, params?: any) => void) | null>(null);

  // Detect pixel loaded state.
  useEffect(() => {
    const i = setInterval(() => {
      const ttq = (window as any).ttq;
      setPixelLoaded(!!(ttq && typeof ttq.track === "function"));
    }, 500);
    return () => clearInterval(i);
  }, []);

  const installInterceptor = () => {
    const ttq: any = (window as any).ttq;
    if (!ttq || typeof ttq.track !== "function") return false;
    if (originalRef.current) return true; // already installed
    originalRef.current = ttq.track.bind(ttq);
    ttq.track = (event: string, params?: any) => {
      const ts = Date.now();
      setEvents((prev) => [
        ...prev,
        {
          ts: new Date(ts).toISOString(),
          tsMs: ts,
          event,
          params: params || {},
          fired: true,
        },
      ]);
      try {
        return originalRef.current!(event, params);
      } catch (e) {
        // swallow
      }
    };
    return true;
  };

  const uninstallInterceptor = () => {
    const ttq: any = (window as any).ttq;
    if (ttq && originalRef.current) {
      ttq.track = originalRef.current;
      originalRef.current = null;
    }
  };

  const recordAttempt = (event: string, params: Record<string, unknown>) => {
    if (!pixelLoaded) {
      setEvents((prev) => [
        ...prev,
        {
          ts: new Date().toISOString(),
          tsMs: Date.now(),
          event,
          params,
          fired: false,
        },
      ]);
    }
  };

  const runFullVerification = async () => {
    setRunning(true);
    setEvents([]);
    installInterceptor();

    const orderId = `verify_${Date.now()}`;
    const productId = "verify_product_123";
    const productName = "Pixel Verification Product";
    const price = 49.99;

    const steps: Array<() => void> = [
      () => {
        const p = { contentId: productId, contentName: productName, value: price, currency: "USD" };
        ttTrackViewContent(p);
        recordAttempt("ViewContent", p);
      },
      () => {
        const p = {
          contentId: productId,
          contentName: productName,
          value: price,
          quantity: 1,
          currency: "USD",
        };
        ttTrackAddToCart(p);
        recordAttempt("AddToCart", p);
      },
      () => {
        const p = {
          value: price,
          currency: "USD",
          contents: [{ content_id: productId, quantity: 1, price }],
        };
        ttTrackInitiateCheckout(p);
        recordAttempt("InitiateCheckout", p);
      },
      () => {
        const p = {
          orderId,
          value: price,
          currency: "USD",
          contents: [
            { content_id: productId, quantity: 1, price, content_name: productName },
          ],
        };
        ttTrackPurchase(p);
        recordAttempt("CompletePayment", p);
      },
    ];

    for (const step of steps) {
      step();
      // Stagger so timestamps differ + giving fireMarketingAsync time to flush.
      await new Promise((r) => setTimeout(r, 350));
    }

    // Allow trailing async flushes.
    await new Promise((r) => setTimeout(r, 800));
    uninstallInterceptor();
    setRunning(false);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(events, null, 2)).catch(() => {});
  };

  return (
    <div className="container mx-auto py-8 max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold">TikTok Pixel Verification</h1>
        <p className="text-muted-foreground text-sm">
          Pixel <code className="font-mono text-xs">{PIXEL_ID}</code> ·{" "}
          {pixelLoaded ? (
            <Badge variant="default">ttq loaded</Badge>
          ) : (
            <Badge variant="destructive">ttq NOT loaded — accept marketing cookies first</Badge>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run full funnel</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={runFullVerification} disabled={running}>
            {running ? "Running…" : "Run ViewContent → AddToCart → InitiateCheckout → Purchase"}
          </Button>
          <Button variant="outline" onClick={() => setEvents([])} disabled={running}>
            Clear log
          </Button>
          <Button variant="outline" onClick={copyJson} disabled={!events.length}>
            Copy JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Captured events ({events.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No events captured yet. Run the verification above.
            </p>
          )}
          {events.map((e, i) => (
            <div
              key={`${e.tsMs}-${i}`}
              className="rounded-lg border bg-muted/30 p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant={e.fired ? "default" : "destructive"}>
                    {e.fired ? "FIRED" : "QUEUED ONLY"}
                  </Badge>
                  <span className="font-mono font-semibold">{e.event}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {e.ts} ({e.tsMs})
                </span>
              </div>
              <pre className="text-xs overflow-x-auto bg-background rounded p-3 border">
                {JSON.stringify(e.params, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cross-check in TikTok Events Manager → Test Events. The "FIRED" rows show the exact
        payload that hit <code className="font-mono">window.ttq.track</code>. "QUEUED ONLY"
        means the pixel script was blocked or not yet loaded; the call is buffered and will
        flush once consent is granted.
      </p>
    </div>
  );
}
