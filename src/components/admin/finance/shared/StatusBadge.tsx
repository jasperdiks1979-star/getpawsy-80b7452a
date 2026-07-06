import { Badge } from "@/components/ui/badge";
import { STATUS_VARIANT, type FinanceStatus } from "@/lib/finance/state/types";

export function StatusBadge({ status, className }: { status: FinanceStatus; className?: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {status}
    </Badge>
  );
}
