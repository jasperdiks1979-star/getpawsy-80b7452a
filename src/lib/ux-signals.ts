/**
 * CRO UX signals — lightweight rage-click, dead-click, scroll-depth and
 * form-abandonment capture. All events are batched and sent on visibility
 * change to keep the main thread free.
 *
 * Persisted into `public.cro_ux_signals` via the Supabase REST insert endpoint.
 */
import { supabase } from "@/integrations/supabase/client";

type SignalType = "rage_click" | "dead_click" | "scroll_depth" | "form_abandon";

interface Signal {
  session_id: string;
  path: string;
  signal_type: SignalType;
  payload: Record<string, unknown>;
  device: string;
  viewport_w: number;
  viewport_h: number;
}

const queue: Signal[] = [];
let installed = false;

function sessionId(): string {
  try {
    const k = "gp_cro_sid";
    let id = sessionStorage.getItem(k);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function device(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return "mobile";
  return "desktop";
}

function enqueue(type: SignalType, payload: Record<string, unknown>) {
  try {
    queue.push({
      session_id: sessionId(),
      path: window.location.pathname,
      signal_type: type,
      payload,
      device: device(),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    });
    if (queue.length >= 10) flush();
  } catch {
    /* swallow */
  }
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  try {
    await supabase.from("cro_ux_signals").insert(batch);
  } catch {
    /* never throw — non-blocking */
  }
}

export function installUxSignals() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Rage clicks: 3+ clicks within 800ms on the same coordinates (±30px).
  const clicks: { t: number; x: number; y: number; tgt: Element | null }[] = [];
  window.addEventListener(
    "click",
    (e: MouseEvent) => {
      const now = performance.now();
      const tgt = e.target as Element | null;
      clicks.push({ t: now, x: e.clientX, y: e.clientY, tgt });
      while (clicks.length && now - clicks[0].t > 800) clicks.shift();
      const near = clicks.filter(
        (c) => Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30,
      );
      if (near.length >= 3) {
        enqueue("rage_click", {
          x: e.clientX,
          y: e.clientY,
          tag: tgt?.tagName,
          id: (tgt as HTMLElement | null)?.id,
          cls: (tgt as HTMLElement | null)?.className?.toString()?.slice(0, 120),
        });
        clicks.length = 0;
      }

      // Dead-click: click on a non-interactive element with no nearby
      // mutation within 500ms.
      const interactive =
        !!tgt &&
        !!(tgt as HTMLElement).closest(
          'a,button,input,select,textarea,[role="button"],[role="link"],[onclick],label,summary',
        );
      if (!interactive && tgt) {
        let mutated = false;
        const obs = new MutationObserver(() => {
          mutated = true;
        });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true });
        setTimeout(() => {
          obs.disconnect();
          if (!mutated) {
            enqueue("dead_click", {
              tag: tgt.tagName,
              id: (tgt as HTMLElement).id,
              cls: (tgt as HTMLElement).className?.toString()?.slice(0, 120),
              text: (tgt.textContent || "").trim().slice(0, 80),
            });
          }
        }, 500);
      }
    },
    { passive: true },
  );

  // Scroll depth — record max 25/50/75/100 thresholds reached per path.
  let maxPct = 0;
  const reached = new Set<number>();
  window.addEventListener(
    "scroll",
    () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      const pct = Math.min(100, Math.round((window.scrollY / h) * 100));
      if (pct > maxPct) maxPct = pct;
      [25, 50, 75, 100].forEach((t) => {
        if (pct >= t && !reached.has(t)) {
          reached.add(t);
          enqueue("scroll_depth", { threshold: t });
        }
      });
    },
    { passive: true },
  );

  // Form abandonment — user focused into a form field but left the page
  // before submitting.
  const formState = { touched: false, submitted: false, lastForm: "" };
  window.addEventListener(
    "focusin",
    (e) => {
      const t = e.target as HTMLElement | null;
      const form = t?.closest("form");
      if (form && /input|select|textarea/i.test(t!.tagName)) {
        formState.touched = true;
        formState.lastForm = form.id || form.getAttribute("name") || "anon";
      }
    },
    { passive: true },
  );
  window.addEventListener(
    "submit",
    () => {
      formState.submitted = true;
    },
    true,
  );

  const flushAll = () => {
    if (formState.touched && !formState.submitted) {
      enqueue("form_abandon", { form: formState.lastForm, scroll_max_pct: maxPct });
      formState.touched = false; // avoid duplicate fires within same SPA route
    }
    flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
}