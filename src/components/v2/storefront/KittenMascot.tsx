import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import poster from '@/assets/mascot-kitten.webp';
import idleWebm from '@/assets/videos/mascot-v2-k-idle.webm.asset.json';
import idleMp4 from '@/assets/videos/mascot-v2-k-idle.mp4.asset.json';
import waveWebm from '@/assets/videos/mascot-v2-k-wave.webm.asset.json';
import waveMp4 from '@/assets/videos/mascot-v2-k-wave.mp4.asset.json';

const pick = (v: HTMLVideoElement, webm: string, mp4: string) =>
  v.canPlayType('video/webm; codecs="vp9"') === 'probably' ? webm : mp4;

/**
 * Generated photoreal GetPawsy kitten — real video motion.
 * idle: 10s seamless palindrome loop (breathing, blinks, ear twitch, tail sway)
 * wave: looks left/right, ears swivel, paw wave; ends exactly on idle frame 0.
 * Two persistent <video> elements are swapped (no src reloads, no React
 * re-renders during playback). Idle repeats a random 1–3 times before a wave.
 * Still photo for reduced-motion / data-saver.
 */
export function KittenMascot({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const idleRef = useRef<HTMLVideoElement>(null);
  const waveRef = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const visible = useRef(false);
  const loopsLeft = useRef(1);
  const active = useRef<'idle' | 'wave'>('idle');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const on = () => setReduced(mq.matches || !!saveData);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  const show = (which: 'idle' | 'wave') => {
    const i = idleRef.current, w = waveRef.current;
    if (!i || !w) return;
    active.current = which;
    const on = which === 'idle' ? i : w;
    const off = which === 'idle' ? w : i;
    on.currentTime = 0;
    on.style.opacity = '1';
    off.style.opacity = '0';
    off.pause();
    if (visible.current && !pausedRef.current) on.play().catch(() => {});
  };

  useEffect(() => {
    const i = idleRef.current, w = waveRef.current;
    if (reduced || !i || !w) return;
    let loaded = false;
    const onIdleEnd = () => {
      loopsLeft.current -= 1;
      if (loopsLeft.current <= 0) { loopsLeft.current = 1 + Math.floor(Math.random() * 3); show('wave'); }
      else show('idle');
    };
    const onWaveEnd = () => show('idle');
    i.addEventListener('ended', onIdleEnd);
    w.addEventListener('ended', onWaveEnd);
    const vis = () => { if (document.hidden) { i.pause(); w.pause(); } else if (visible.current && !pausedRef.current) (active.current === 'idle' ? i : w).play().catch(() => {}); };
    document.addEventListener('visibilitychange', vis);
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting && !loaded) {
        loaded = true;
        i.src = pick(i, idleWebm.url, idleMp4.url);
        w.src = pick(w, waveWebm.url, waveMp4.url);
        w.preload = 'auto';
        w.load();
      }
      const cur = active.current === 'idle' ? i : w;
      if (e.isIntersecting && !pausedRef.current && !document.hidden) cur.play().catch(() => {});
      else cur.pause();
    }, { rootMargin: '100px' });
    io.observe(i);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
      i.removeEventListener('ended', onIdleEnd);
      w.removeEventListener('ended', onWaveEnd);
    };
  }, [reduced]);

  const dim = size === 'sm' ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-20 w-20 sm:h-24 sm:w-24';
  const ring = 'rounded-full shadow-md ring-2 ring-primary/20';

  if (reduced) {
    return <img src={poster} alt="" width={96} height={96} loading="lazy" decoding="async" className={`${dim} ${ring} shrink-0 object-cover`} />;
  }

  const vCls = 'absolute inset-0 h-full w-full rounded-full object-cover';
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => { pausedRef.current = false; setPaused(false); show('wave'); }}
        aria-label="Say hi to the GetPawsy kitten"
        className={`relative block overflow-hidden ${dim} ${ring} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        style={{ backgroundImage: `url(${poster})`, backgroundSize: 'cover' }}
      >
        <video ref={idleRef} className={vCls} poster={poster} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
        <video ref={waveRef} className={vCls} style={{ opacity: 0 }} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
      </button>
      <button
        type="button"
        onClick={() => {
          const cur = active.current === 'idle' ? idleRef.current : waveRef.current;
          const next = !pausedRef.current;
          pausedRef.current = next;
          setPaused(next);
          if (next) cur?.pause(); else cur?.play().catch(() => {});
        }}
        aria-label={paused ? 'Play kitten animation' : 'Pause kitten animation'}
        className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-background text-foreground shadow ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
