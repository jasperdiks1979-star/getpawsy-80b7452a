import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import {
  type CostAssessment,
  formatCredits,
  formatEur,
  formatUsd,
} from "@/lib/aiPricing";

interface Props {
  assessment: CostAssessment;
  /** Optional label describing what the cost refers to. */
  scopeLabel?: string;
  className?: string;
}

/**
 * Reusable cost panel for every AI-powered admin tool.
 * Always shows: credits + USD + EUR, balance check, shortfall, top-up recs.
 */
export function AiCostBreakdown({ assessment, scopeLabel, className }: Props) {
  const { required, balance, balanceCost, sufficient, shortfall, topUps } = assessment;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          <span>AI Cost {scopeLabel ? `· ${scopeLabel}` : ""}</span>
          {sufficient === true && (
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Sufficient balance</Badge>
          )}
          {sufficient === false && (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Insufficient balance</Badge>
          )}
          {sufficient === null && (
            <Badge variant="secondary" className="gap-1"><HelpCircle className="h-3 w-3" /> Balance unknown</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Money label="Estimated cost" primary={formatCredits(required.credits)} secondary={[formatUsd(required.usd), formatEur(required.eur)]} />
          <Money
            label="Current balance"
            primary={balance.credits_remaining != null ? formatCredits(balance.credits_remaining) : "—"}
            secondary={balanceCost ? [formatUsd(balanceCost.usd), formatEur(balanceCost.eur)] : ["Balance not reported"]}
            muted={!balance.is_live}
          />
          <Money
            label={shortfall ? "Additional needed" : "After this run"}
            primary={shortfall ? formatCredits(shortfall.credits) : (balanceCost ? formatCredits(Math.max(0, balanceCost.credits - required.credits)) : "—")}
            secondary={shortfall
              ? [formatUsd(shortfall.usd), formatEur(shortfall.eur)]
              : balanceCost ? [formatUsd(Math.max(0, balanceCost.usd - required.usd))] : []}
            highlight={!!shortfall}
          />
        </div>

        {sufficient === false && shortfall && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
            <div className="font-medium text-destructive">Not enough AI balance.</div>
            <div className="text-xs">
              Required {formatCredits(required.credits)} ≈ {formatUsd(required.usd)} ≈ {formatEur(required.eur)}.
              Current {balance.credits_remaining != null ? formatCredits(balance.credits_remaining) : "unknown"}.
              Top up at least {formatUsd(shortfall.usd)} ≈ {formatEur(shortfall.eur)}.
            </div>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Top-up recommendation</div>
          <div className="grid grid-cols-3 gap-3">
            {topUps.map((t) => (
              <div
                key={t.label}
                className={`rounded-md border p-3 text-sm ${t.recommended ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{t.label}</div>
                  {t.recommended && <Badge variant="default" className="text-[10px]">Recommended</Badge>}
                </div>
                <div className="text-lg font-semibold mt-1">{formatUsd(t.usd)}</div>
                <div className="text-xs text-muted-foreground">{formatEur(t.eur)} · {formatCredits(t.credits)}</div>
                {!t.covers && (
                  <div className="text-[11px] text-destructive mt-1">Does not fully cover</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Pricing: 1 credit ≈ $0.10 USD ≈ €0.093 EUR. Balance read from cached credit state — may lag by minutes.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Money({
  label,
  primary,
  secondary,
  highlight,
  muted,
}: {
  label: string;
  primary: string;
  secondary: string[];
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "border-destructive/40 bg-destructive/5" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${muted ? "text-muted-foreground" : ""}`}>{primary}</div>
      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
        {secondary.map((s, i) => <div key={i}>{s}</div>)}
      </div>
    </div>
  );
}