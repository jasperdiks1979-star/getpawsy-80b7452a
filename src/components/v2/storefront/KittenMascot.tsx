import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import poster from '@/assets/mascot-kitten.webp';
import idleWebm from '@/assets/videos/mascot-kitten.webm.asset.json';
import idleMp4 from '@/assets/videos/mascot-kitten.mp4.asset.json';
import waveWebm from '@/assets/videos/mascot-kitten-wave.webm.asset.json';
import waveMp4 from '@/assets/videos/mascot-kitten-wave.mp4.asset.json';

type Clip = 'idle' | 'wave';
const pick = (v: HTMLVideoElement, webm: string, mp4: string) =>
  v.canPlayType('video/webm; codecs="vp9"') ? webm : mp4;

/**
 * Generated photoreal kitten, real video animation:
 * - idle loop: breathing, slow blink, ear twitch, tail sway
 * - "say hi" clip: looks left/right, ears swivel, small paw wave (first view + on tap)
 * Still photo for reduced-motion / data-saver.
 */
export function KittenMascot() {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  const clip = useRef<Clip>('wave');
  const greeted = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const on = () => setReduced(mq.matches || !!saveData);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const load = (c: Clip) => {
    const v = ref.current;
    if (!v) return;
    clip.current = c;
    v.loop = c === 'idle';
    v.src = c === 'idle' ? pick(v, idleWebm.url, idleMp4.url) : pick(v, waveWebm.url, waveMp4.url);
    v.play().catch(() => {});
  };

  useEffect(() => {
    const v = ref.current;
    if (!v || reduced) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !paused && !document.hidden) {
        if (!greeted.current) { greeted.current = true; load('wave'); }
        else v.play().catch(() => {});
      } else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [reduced, paused]);

  const cls = 'h-20 w-20 rounded-full object-cover shadow-md ring-2 ring-primary/20 sm:h-24 sm:w-24';

  if (reduced) {
    return <img src={poster} alt="" width={96} height={96} loading="lazy" decoding="async" className={`${cls} shrink-0`} />;
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => { setPaused(false); load('wave'); }}
        aria-label="Say hi to the GetPawsy kitten"
        className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <video
          ref={ref}
          className={cls}
          poster={poster}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          width={96}
          height={96}
          onEnded={() => { if (clip.current === 'wave') load('idle'); }}
        />
      </button>
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
