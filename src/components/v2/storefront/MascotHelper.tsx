import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { KittenMascot } from './KittenMascot';
import { mascotHint, HINTS_OFF_KEY } from '@/lib/mascotHints';

/** Compact in-page shopping tip from the kitten. Never floats; visitors can turn tips off (remembered on this device). */
export function MascotHelper(ctx: { slug?: string | null; name?: string | null; species?: string | null }) {
  const [off, setOff] = useState(() => { try { return localStorage.getItem(HINTS_OFF_KEY) === '1'; } catch { return false; } });
  if (off) return null;
  const h = mascotHint(ctx);
  const hide = () => { try { localStorage.setItem(HINTS_OFF_KEY, '1'); } catch { /* ignore */ } setOff(true); };
  return (
    <aside aria-label="Shopping tip" className="my-4 flex items-center gap-3 rounded-3xl border border-border bg-secondary/40 p-3">
      <div className="shrink-0"><KittenMascot size="sm" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{h.text}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {h.links.map((l) => (
            <Link key={l.to + l.label} to={l.to} className="text-sm font-medium text-primary underline-offset-2 hover:underline">{l.label} →</Link>
          ))}
        </div>
      </div>
      <button type="button" onClick={hide} aria-label="Turn off kitten tips" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
