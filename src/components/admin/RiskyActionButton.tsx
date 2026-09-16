import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CONFIRM_PHRASE,
  RISK_LEVELS,
  evaluateActionGate,
  type PreconditionState,
  type RiskLevel,
} from '@/lib/riskyActions';

const TONE_CLASS: Record<string, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  caution: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
};

export interface RiskyActionButtonProps extends Omit<ButtonProps, 'onClick'> {
  risk: RiskLevel;
  /** Short title of the action, shown in the dialog header. */
  actionLabel: string;
  /** Exactly what will happen, in plain sentences. */
  impact: string[];
  preconditions?: PreconditionState[];
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
}

/**
 * The ONE confirmation surface for destructive / external / financial admin
 * actions (Batch E). Fail-closed: unknown preconditions block execution, and
 * high-risk levels require the typed confirmation phrase.
 */
export function RiskyActionButton({
  risk,
  actionLabel,
  impact,
  preconditions,
  onConfirm,
  children,
  variant,
  ...buttonProps
}: RiskyActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [running, setRunning] = useState(false);

  const meta = RISK_LEVELS[risk];
  const gate = evaluateActionGate({ risk, preconditions, typedConfirmation: typed });

  const run = async () => {
    if (!gate.allowed || running) return;
    setRunning(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped('');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        {...buttonProps}
        variant={variant ?? (meta.tone === 'danger' ? 'destructive' : 'outline')}
        onClick={() => {
          setTyped('');
          setOpen(true);
        }}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent data-testid="risky-action-dialog" data-risk={risk}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              {actionLabel}
            </DialogTitle>
            <DialogDescription>{meta.description}</DialogDescription>
          </DialogHeader>

          <Badge variant="outline" className={cn('w-fit text-[10px] font-semibold', TONE_CLASS[meta.tone])}>
            {meta.label}
          </Badge>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {impact.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {preconditions?.length ? (
            <div className="space-y-1 rounded-md border p-2 text-xs">
              {preconditions.map((p) => (
                <div key={p.label} className="flex items-center justify-between gap-2">
                  <span>{p.label}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      p.satisfied === true
                        ? 'text-emerald-600'
                        : p.satisfied === false
                          ? 'text-destructive'
                          : 'text-amber-600',
                    )}
                  >
                    {p.satisfied === true ? 'OK' : p.satisfied === false ? 'FAILED' : 'UNKNOWN'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {meta.requiresTypedConfirmation && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="risky-confirm-input">
                Type <span className="font-mono font-semibold">{CONFIRM_PHRASE[risk]}</span> to continue
              </label>
              <Input
                id="risky-confirm-input"
                data-testid="risky-action-confirm-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          {!gate.allowed && (
            <p className="flex items-start gap-2 text-xs text-amber-600" data-testid="risky-action-gate-message">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {gate.message}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={running}>
              Cancel
            </Button>
            <Button
              data-testid="risky-action-run"
              variant={meta.tone === 'danger' ? 'destructive' : 'default'}
              disabled={!gate.allowed || running}
              onClick={() => void run()}
            >
              {running ? 'Running…' : actionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default RiskyActionButton;
