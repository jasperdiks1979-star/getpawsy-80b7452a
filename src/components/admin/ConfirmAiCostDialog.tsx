import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type CostAssessment,
  formatCredits,
  formatEur,
  formatUsd,
} from "@/lib/aiPricing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  productCount: number;
  assessment: CostAssessment;
  onConfirm: () => void;
  confirmLabel?: string;
}

/** Standardized confirmation dialog shown before any AI batch operation. */
export function ConfirmAiCostDialog({
  open,
  onOpenChange,
  title,
  productCount,
  assessment,
  onConfirm,
  confirmLabel = "Proceed",
}: Props) {
  const { required, sufficient, shortfall } = assessment;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-foreground">
              <div>This operation will process <span className="font-semibold">{productCount.toLocaleString()}</span> products.</div>
              <div className="rounded-md border p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated cost</div>
                <div className="font-semibold">{formatCredits(required.credits)}</div>
                <div className="text-xs text-muted-foreground">{formatUsd(required.usd)} · {formatEur(required.eur)}</div>
              </div>
              {sufficient === false && shortfall && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <div className="font-medium text-destructive mb-1">Insufficient balance.</div>
                  Need an additional {formatCredits(shortfall.credits)} ({formatUsd(shortfall.usd)} · {formatEur(shortfall.eur)}). The run will stop early when credits run out.
                </div>
              )}
              <div className="text-xs text-muted-foreground">Proceed?</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}