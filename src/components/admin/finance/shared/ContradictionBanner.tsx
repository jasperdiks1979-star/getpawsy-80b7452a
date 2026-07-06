import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useFinanceState } from "@/lib/finance/state/FinanceStateProvider";

/**
 * Enterprise validation surface: renders every invariant the Contradiction
 * Detector found. Whenever this is visible, no panel should show Verified.
 */
export function ContradictionBanner() {
  const { state } = useFinanceState();
  if (!state.contradictions || state.contradictions.length === 0) return null;
  return (
    <Card className="border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="text-sm font-medium text-destructive">
            Finance data inconsistency detected ({state.contradictions.length})
          </div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {state.contradictions.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-foreground">{c.severity === "critical" ? "Critical" : "Warning"}:</span>{" "}
                {c.message}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Verified badges are automatically blocked until every listed contradiction is resolved.
          </p>
        </div>
      </div>
    </Card>
  );
}
