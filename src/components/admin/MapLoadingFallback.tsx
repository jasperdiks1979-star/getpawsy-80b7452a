import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, RotateCw } from "lucide-react";

/**
 * Suspense fallback for the VisitorWorldMap that escalates after 12s
 * so the user is never stuck on a silent spinner.
 */
export const MapLoadingFallback = () => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const stuck = elapsed >= 12;

  return (
    <Card className="p-8">
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-muted" />
          {stuck ? (
            <AlertTriangle className="h-8 w-8 text-amber-500 absolute inset-0 m-auto" />
          ) : (
            <Loader2 className="h-16 w-16 animate-spin text-primary absolute inset-0" />
          )}
        </div>
        <div className="text-center space-y-2 max-w-md">
          {!stuck ? (
            <>
              <p className="font-medium">Wereldkaart wordt geladen… ({elapsed}s)</p>
              <p className="text-sm text-muted-foreground">
                Mapbox-bibliotheek (~800KB) + bezoekersdata ophalen.
                <br />
                Eerste keer: 5–10 sec. Daarna direct.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Het laden duurt langer dan verwacht ({elapsed}s)
              </p>
              <p className="text-sm text-muted-foreground">
                De Mapbox chunk laadt niet. Mogelijke oorzaken:
              </p>
              <ul className="text-xs text-muted-foreground text-left list-disc pl-6 space-y-1">
                <li>Trage verbinding (chunk is ~3MB unzipped)</li>
                <li>Browser blokkeert de chunk (adblocker/privacy)</li>
                <li>Mapbox token niet geconfigureerd</li>
                <li>Netwerk fout — check console voor details</li>
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => window.location.reload()}
              >
                <RotateCw className="w-4 h-4 mr-2" />
                Opnieuw proberen
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};