import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ban, CheckCircle2, Radio } from "lucide-react";
import { availableChannels, unavailableChannels } from "@/config/channel-availability";

export default function ChannelAvailabilityCard() {
  const on = availableChannels();
  const off = unavailableChannels();
  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4" /> Channel Availability — Organic Growth Constitution
          <Badge className="bg-emerald-600 text-white ml-2">{on.length} active</Badge>
          <Badge className="bg-red-600 text-white">{off.length} unavailable</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Genesis will not recommend, budget, forecast, or spend AI credits on unavailable channels.
          Historical data is preserved.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {off.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
              <Ban className="h-3.5 w-3.5" /> UNAVAILABLE
            </div>
            <div className="space-y-2">
              {off.map((c) => (
                <div key={c.key} className="text-xs">
                  <span className="font-medium text-red-800">{c.label}</span>
                  {c.unavailable_since && (
                    <span className="text-red-600/70 ml-2">since {c.unavailable_since}</span>
                  )}
                  {c.reason && <div className="text-red-700/80 mt-0.5">{c.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> ACTIVE — organic-first ranking
          </div>
          <div className="flex flex-wrap gap-1.5">
            {on.map((c) => (
              <Badge
                key={c.key}
                variant="outline"
                className={
                  c.priority === "P0"
                    ? "border-emerald-500 text-emerald-700"
                    : c.priority === "P1"
                    ? "border-amber-500 text-amber-700"
                    : "border-slate-300 text-slate-600"
                }
              >
                {c.priority} · {c.label}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}