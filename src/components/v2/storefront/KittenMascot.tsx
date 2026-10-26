import { useEffect, useRef, useState } from 'react';
import poster from '@/assets/mascot-kitten.webp';
import idleWebm from '@/assets/videos/mascot-v2-k-idle.webm.asset.json';
import idleMp4 from '@/assets/videos/mascot-v2-k-idle.mp4.asset.json';
import waveWebm from '@/assets/videos/mascot-k3-w.webm.asset.json';
import waveMp4 from '@/assets/videos/mascot-k3-w.mp4.asset.json';
import groomWebm from '@/assets/videos/mascot-k3-g.webm.asset.json';
import groomMp4 from '@/assets/videos/mascot-k3-g.mp4.asset.json';
import lookWebm from '@/assets/videos/mascot-k4-l.webm.asset.json';
import lookMp4 from '@/assets/videos/mascot-k4-l.mp4.asset.json';
import { idleCyclesBeforeAction, idleRate, isStalled, nextAction, type MascotAction } from '@/lib/mascotScheduler';

type Clip = 'idle' | MascotAction;
const SRC: Record<Clip, [string, string]> = {
  idle: [idleWebm.url, idleMp4.url],
  wave: [waveWebm.url, waveMp4.url],
  groom: [groomWebm.url, groomMp4.url],
  // look (6 s): looks left, right, back; ear flick, soft blink, breathing
  look: [lookWebm.url, lookMp4.url],
};
const pick = (v: HTMLVideoElement, [webm, mp4]: [string, string]) =>
  v.canPlayType('video/webm; codecs="vp9"') === 'probably' ? webm : mp4;

/** Ms the outgoing clip keeps playing under the incoming one (crossfade). */
const FADE_MS = 350;

/**
 * Generated photoreal GetPawsy kitten — real video, three clips that all
 * start and end on the same resting frame, so every handoff lands on the
 * same pose:
 * - idle (10 s, native loop): breathing, blinks, ear twitch, tail sway
 * - wave (5.9 s): looks left/right, ears swivel, paw wave
 * - groom (6.5 s): head tilt, yawn, paw lick
 * - look (6 s): looks left/right/back, ear flick, soft blink
 * After 1–2 idle loops a random action plays (never the same twice), with
 * slight idle speed variation. Handoffs crossfade (FADE_MS) so any residual
 * frame noise is blended instead of popping; the incoming clip is only
 * revealed once it is actually playing (no poster flash on iPhone).
 * A watchdog resumes stalled playback. Pauses offscreen / hidden tab.
 * Still photo for reduced-motion / data-saver. The pause control is hidden
 * visually (screen readers and keyboard focus only) — never visible text or
 * an icon in the card.
 */
export function KittenMascot({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const refs = { idle: useRef<HTMLVideoElement>(null), wave: useRef<HTMLVideoElement>(null), groom: useRef<HTMLVideoElement>(null), look: useRef<HTMLVideoElement>(null) };
  const [reduced, setReduced] = useState(true);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const visible = useRef(false);
  const active = useRef<Clip>('idle');
  const queued = useRef<MascotAction | null>(null);
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const on = () => setReduced(mq.matches || !!saveData);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const v = { idle: refs.idle.current!, wave: refs.wave.current!, groom: refs.groom.current!, look: refs.look.current! };
    if (!v.idle || !v.wave || !v.groom || !v.look) return;
    let loaded = false;
    let cycles = 0;
    let target = idleCyclesBeforeAction(Math.random());
    let last: MascotAction | null = null;
    let lastT = 0;
    let prevIdleT = 0;
    let stallT = -1;
    const shouldPlay = () => visible.current && !pausedRef.current && !document.hidden;

    (Object.keys(v) as Clip[]).forEach((k) => {
      const el = v[k];
      el.muted = true; el.defaultMuted = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', '');
    });
    v.idle.loop = true;

    const playActive = () => { if (shouldPlay()) v[active.current].play().catch(() => {}); };
    kick.current = playActive;

    /** Crossfade to `to` once it is really playing, then park the others. */
    const swapTo = (to: Clip) => {
      if (to === active.current) return;
      const el = v[to];
      const reveal = () => {
        el.style.opacity = '1';
        (Object.keys(v) as Clip[]).forEach((k) => { if (k !== to) v[k].style.opacity = '0'; });
        active.current = to;
        // Let the outgoing clip keep playing under the fade, then pause it.
        window.setTimeout(() => {
          (Object.keys(v) as Clip[]).forEach((k) => { if (k !== to && active.current === to) v[k].pause(); });
        }, FADE_MS + 50);
      };
      el.currentTime = 0;
      if (to === 'idle') el.playbackRate = idleRate(Math.random());
      if (!shouldPlay()) { reveal(); return; }
      const p = el.play();
      p.catch(() => {});
      const rvfc = (el as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      if (rvfc) rvfc.call(el, reveal);
      else el.addEventListener('playing', reveal, { once: true });
    };

    const onIdleTime = () => {
      const t = v.idle.currentTime;
      if (active.current === 'idle' && t + 0.5 < prevIdleT) {
        // Loop wrapped back to the resting frame.
        cycles += 1;
        if (queued.current || cycles >= target) {
          const a = queued.current ?? nextAction(last, Math.random());
          queued.current = null; last = a; cycles = 0; target = idleCyclesBeforeAction(Math.random());
          swapTo(a);
        } else {
          v.idle.playbackRate = idleRate(Math.random());
        }
      }
      prevIdleT = t;
    };
    const onActionEnd = () => { prevIdleT = 0; swapTo('idle'); };
    v.idle.addEventListener('timeupdate', onIdleTime);
    v.wave.addEventListener('ended', onActionEnd);
    v.groom.addEventListener('ended', onActionEnd);
    v.look.addEventListener('ended', onActionEnd);

    const vis = () => { if (document.hidden) (Object.values(v)).forEach((e) => e.pause()); else playActive(); };
    document.addEventListener('visibilitychange', vis);
    // Retry after first user gesture (iOS Low Power Mode blocks muted autoplay).
    const gesture = () => playActive();
    window.addEventListener('pointerdown', gesture, { passive: true });

    // Watchdog: if it should be playing but time is frozen twice in a row, resume.
    const dog = window.setInterval(() => {
      if (!loaded) return;
      const el = v[active.current];
      const t = el.currentTime;
      if (isStalled(shouldPlay(), el.paused, lastT, t)) {
        if (stallT === t) { if (el.ended) onActionEnd(); else el.play().catch(() => {}); }
        stallT = t;
      } else stallT = -1;
      lastT = t;
    }, 1500);

    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting && !loaded) {
        loaded = true;
        (Object.keys(v) as Clip[]).forEach((k) => { v[k].src = pick(v[k], SRC[k]); v[k].preload = 'auto'; v[k].load(); });
      }
      if (e.isIntersecting) playActive(); else v[active.current].pause();
    }, { rootMargin: '100px' });
    io.observe(v.idle);
    return () => {
      io.disconnect();
      window.clearInterval(dog);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pointerdown', gesture);
      v.idle.removeEventListener('timeupdate', onIdleTime);
      v.wave.removeEventListener('ended', onActionEnd);
      v.groom.removeEventListener('ended', onActionEnd);
      v.look.removeEventListener('ended', onActionEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const dim = size === 'sm' ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-20 w-20 sm:h-24 sm:w-24';
  const ring = 'rounded-full shadow-md ring-2 ring-primary/20';

  if (reduced) {
    return <img src={poster} alt="" width={96} height={96} loading="lazy" decoding="async" className={`${dim} ${ring} shrink-0 object-cover`} />;
  }

  const vCls = 'absolute inset-0 h-full w-full rounded-full object-cover transition-opacity duration-300';
  return (
    <div className="flex shrink-0 flex-col items-center">
      <button
        type="button"
        onClick={() => {
          pausedRef.current = false; setPaused(false);
          if (active.current === 'idle') queued.current = 'wave';
          kick.current();
        }}
        aria-label="Say hi to the GetPawsy kitten"
        className={`relative block overflow-hidden ${dim} ${ring} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        style={{ backgroundImage: `url(${poster})`, backgroundSize: 'cover' }}
      >
        <video ref={refs.idle} className={vCls} poster={poster} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
        <video ref={refs.wave} className={vCls} style={{ opacity: 0 }} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
        <video ref={refs.groom} className={vCls} style={{ opacity: 0 }} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
        <video ref={refs.look} className={vCls} style={{ opacity: 0 }} muted playsInline preload="none" aria-hidden="true" width={96} height={96} />
      </button>
      <button
        type="button"
        aria-pressed={paused}
        onClick={() => {
          const next = !pausedRef.current;
          pausedRef.current = next;
          setPaused(next);
          const el = refs[active.current].current;
          if (next) el?.pause(); else kick.current();
        }}
        data-testid="mascot-motion-toggle"
        className="sr-only focus-visible:not-sr-only focus-visible:mt-1 focus-visible:rounded focus-visible:bg-background focus-visible:px-1 focus-visible:text-[10px] focus-visible:font-medium focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {paused ? 'Play kitten animation' : 'Pause kitten animation'}
      </button>
    </div>
  );
}
