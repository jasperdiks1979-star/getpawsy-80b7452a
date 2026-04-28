import { AbsoluteFill, Audio, Img, Sequence, Series, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Anton";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });

// 15s @ 30fps = 450 frames
// Hook 90 (3s) | Problem 90 (3s) | Solution 120 (4s) | Result 90 (3s) | CTA 60 (2s)

const TT_YELLOW = "#FFEE00";
const TT_PINK = "#FF2D55";
const TT_BLACK = "#0E0E10";
const TT_WHITE = "#FFFFFF";

const KenBurns: React.FC<{ src: string; from?: number; to?: number; pan?: "left" | "right" | "up" | "down" }> = ({
  src, from = 1.0, to = 1.15, pan = "right",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [from, to]);
  const t = interpolate(frame, [0, durationInFrames], [0, 1]);
  const tx = pan === "left" ? -30 * t : pan === "right" ? 30 * t : 0;
  const ty = pan === "up" ? -30 * t : pan === "down" ? 30 * t : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: TT_BLACK }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        }}
      />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ text: string; bg?: string; color?: string; y?: number; delay?: number; size?: number; rotate?: number }> = ({
  text, bg = TT_YELLOW, color = TT_BLACK, y = 1450, delay = 0, size = 78, rotate = -2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 180 } });
  const wobble = Math.sin((frame - delay) * 0.18) * 0.6;
  return (
    <div
      style={{
        position: "absolute",
        top: y,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: pop,
        transform: `scale(${pop}) rotate(${rotate + wobble}deg)`,
      }}
    >
      <div
        style={{
          fontFamily: display.fontFamily,
          fontSize: size,
          color,
          background: bg,
          padding: "14px 32px",
          textTransform: "uppercase",
          letterSpacing: 1,
          lineHeight: 1,
          boxShadow: "6px 6px 0 rgba(0,0,0,0.85)",
          maxWidth: 940,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
};

const StickerBadge: React.FC<{ text: string; top: number; left: number; bg: string; color?: string; delay?: number; rotate?: number }> = ({
  text, top, left, bg, color = TT_WHITE, delay = 0, rotate = -8,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 7, stiffness: 220 } });
  return (
    <div
      style={{
        position: "absolute",
        top, left,
        opacity: pop,
        transform: `scale(${pop}) rotate(${rotate}deg)`,
        fontFamily: display.fontFamily,
        fontSize: 62,
        background: bg,
        color,
        padding: "10px 26px",
        textTransform: "uppercase",
        letterSpacing: 1,
        boxShadow: "5px 5px 0 rgba(0,0,0,0.85)",
      }}
    >
      {text}
    </div>
  );
};

// ── HOOK 0–3s ──────────────────────────────────────────────────────
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const flash = frame < 4 ? 1 - frame / 4 : 0;
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("images/tiktok-ad/dirty-litter.jpg")} from={1.05} to={1.2} pan="down" />
      <AbsoluteFill style={{ background: `rgba(255,255,255,${flash})` }} />
      <Caption text="THIS is why your house" y={120} bg={TT_WHITE} color={TT_BLACK} size={72} rotate={-2} delay={4} />
      <Caption text="SMELLS…" y={260} bg={TT_PINK} color={TT_WHITE} size={130} rotate={-3} delay={14} />
      <StickerBadge text="🤢 ew" top={900} left={120} bg={TT_BLACK} delay={32} rotate={-12} />
      <StickerBadge text="every day" top={1050} left={620} bg={TT_YELLOW} color={TT_BLACK} delay={46} rotate={6} />
    </AbsoluteFill>
  );
};

// ── PROBLEM 3–6s ───────────────────────────────────────────────────
const SceneProblem: React.FC = () => {
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("images/tiktok-ad/smell-reaction.jpg")} from={1.08} to={1.18} pan="left" />
      <Caption text="That smell" y={140} bg={TT_BLACK} color={TT_WHITE} size={110} rotate={-3} delay={2} />
      <Caption text="NEVER goes away" y={290} bg={TT_PINK} color={TT_WHITE} size={92} rotate={2} delay={16} />
      <StickerBadge text="scoop. clean. repeat." top={1500} left={120} bg={TT_YELLOW} color={TT_BLACK} delay={36} rotate={-4} />
    </AbsoluteFill>
  );
};

// ── SOLUTION 6–10s ─────────────────────────────────────────────────
const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 12, stiffness: 110 } });
  const ringPulse = 1 + Math.sin(frame * 0.18) * 0.04;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#0E0E10 0%, #1a1a1f 100%)" }}>
      {/* spinning halo */}
      <div
        style={{
          position: "absolute",
          top: 540,
          left: "50%",
          width: 880,
          height: 880,
          marginLeft: -440,
          borderRadius: "50%",
          border: `8px dashed ${TT_YELLOW}`,
          transform: `rotate(${frame * 1.4}deg) scale(${ringPulse})`,
          opacity: 0.55,
        }}
      />
      {/* product */}
      <div
        style={{
          position: "absolute",
          top: 600,
          left: "50%",
          width: 760,
          height: 760,
          marginLeft: -380,
          borderRadius: 40,
          overflow: "hidden",
          transform: `scale(${reveal})`,
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          background: TT_WHITE,
        }}
      >
        <Img src={staticFile("images/tiktok-ad/litter-box.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      <Caption text="But THIS" y={140} bg={TT_YELLOW} color={TT_BLACK} size={110} rotate={-3} delay={4} />
      <Caption text="changes everything." y={300} bg={TT_WHITE} color={TT_BLACK} size={68} rotate={1} delay={20} />

      <StickerBadge text="self-cleaning" top={1430} left={90} bg={TT_PINK} delay={50} rotate={-6} />
      <StickerBadge text="app control" top={1570} left={620} bg={TT_YELLOW} color={TT_BLACK} delay={70} rotate={5} />
      <StickerBadge text="odor-sealed" top={1710} left={200} bg={TT_WHITE} color={TT_BLACK} delay={90} rotate={-3} />
    </AbsoluteFill>
  );
};

// ── RESULT 10–13s ──────────────────────────────────────────────────
const SceneResult: React.FC = () => {
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("images/tiktok-ad/happy-cat-clean-home.jpg")} from={1.04} to={1.16} pan="up" />
      <Caption text="No more scooping." y={150} bg={TT_WHITE} color={TT_BLACK} size={78} rotate={-2} delay={2} />
      <Caption text="No more smell." y={290} bg={TT_PINK} color={TT_WHITE} size={90} rotate={2} delay={18} />
      <Caption text="Just a happy cat 🐾" y={1500} bg={TT_YELLOW} color={TT_BLACK} size={68} rotate={-3} delay={42} />
    </AbsoluteFill>
  );
};

// ── CTA 13–15s ─────────────────────────────────────────────────────
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleS = spring({ frame, fps, config: { damping: 9, stiffness: 160 } });
  const ctaS = spring({ frame: frame - 18, fps, config: { damping: 8, stiffness: 200 } });
  const arrowY = Math.sin(frame * 0.4) * 14;
  const arrowO = interpolate(frame, [30, 45], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: TT_YELLOW, justifyContent: "center", alignItems: "center" }}>
      {/* diagonal stripes */}
      <AbsoluteFill style={{
        backgroundImage: `repeating-linear-gradient(45deg, ${TT_BLACK} 0 18px, transparent 18px 90px)`,
        opacity: 0.08,
      }} />

      <div style={{ textAlign: "center", padding: "0 60px", transform: `scale(${titleS})` }}>
        <div style={{ fontFamily: display.fontFamily, fontSize: 180, color: TT_BLACK, lineHeight: 0.95, textTransform: "uppercase" }}>
          Get Yours
        </div>
        <div style={{ fontFamily: display.fontFamily, fontSize: 220, color: TT_PINK, lineHeight: 0.95, textTransform: "uppercase", textShadow: `8px 8px 0 ${TT_BLACK}` }}>
          Today
        </div>
      </div>

      <div
        style={{
          marginTop: 80,
          padding: "30px 70px",
          background: TT_BLACK,
          color: TT_WHITE,
          fontFamily: display.fontFamily,
          fontSize: 76,
          textTransform: "uppercase",
          letterSpacing: 2,
          boxShadow: "10px 10px 0 rgba(0,0,0,0.5)",
          transform: `scale(${ctaS})`,
        }}
      >
        Tap the link 👇
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 140,
          fontSize: 140,
          opacity: arrowO,
          transform: `translateY(${arrowY}px)`,
        }}
      >
        👇
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 60,
          fontFamily: body.fontFamily,
          fontWeight: 800,
          fontSize: 38,
          color: TT_BLACK,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        getpawsy.pet
      </div>
    </AbsoluteFill>
  );
};

export const MainVideoLitterBox: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: body.fontFamily, background: TT_BLACK }}>
      {/* Background music — quiet bed under VO */}
      <Audio src={staticFile("audio/tiktok-ad-music.mp3")} volume={0.12} />
      {/* Voice-over starts at frame 6 (~0.2s) */}
      <Sequence from={6}>
        <Audio src={staticFile("audio/litterbox-vo.mp3")} volume={1.0} />
      </Sequence>

      <Series>
        <Series.Sequence durationInFrames={90}>
          <SceneHook />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <SceneProblem />
        </Series.Sequence>
        <Series.Sequence durationInFrames={120}>
          <SceneSolution />
        </Series.Sequence>
        <Series.Sequence durationInFrames={90}>
          <SceneResult />
        </Series.Sequence>
        <Series.Sequence durationInFrames={60}>
          <SceneCTA />
        </Series.Sequence>
      </Series>

      {/* persistent grain */}
      <AbsoluteFill
        style={{
          opacity: 0.05,
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #000 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, #000 0.5px, transparent 1px)",
          backgroundSize: "3px 3px, 5px 5px",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
