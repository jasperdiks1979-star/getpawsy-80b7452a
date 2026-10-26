import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import poster from '@/assets/mascot-kitten.webp';
import webm from '@/assets/videos/mascot-kitten.webm.asset.json';
import mp4 from '@/assets/videos/mascot-kitten.mp4.asset.json';

/**
 * Generated photoreal kitten. Real looping video (breathing/blink/ear/tail)
 * only when motion is allowed and the element is on screen; otherwise a still.
 */
export function KittenMascot() {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    setReduced(mq.matches || !!saveData);
    const on = () => setReduced(mq.matches || !!saveData);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !paused && !document.hidden) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [reduced, paused]);

  const cls = 'h-20 w-20 shrink-0 rounded-full object-cover shadow-md ring-2 ring-primary/20 sm:h-24 sm:w-24';

  if (reduced) {
    return <img src={poster} alt="" width={96} height={96} loading="lazy" decoding="async" className={cls} />;
  }

  return (
    <div className="relative shrink-0">
      <video
        ref={ref}
        className={cls}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        width={96}
        height={96}
      >
        <source src={webm.url} type="video/webm" />
        <source src={mp4.url} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={() => {
          const v = ref.current;
          if (!v) return;
          if (paused) { v.play().catch(() => {}); setPaused(false); } else { v.pause(); setPaused(true); }
        }}
        aria-label={paused ? 'Play kitten animation' : 'Pause kitten animation'}
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
