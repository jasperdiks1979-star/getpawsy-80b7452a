import { AbsoluteFill, Series, Audio, Sequence, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Anton";
import { loadFont as loadBody } from "@remotion/google-fonts/Inter";

const display = loadDisplay("normal", { weights: ["400"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["500", "700", "800", "900"], subsets: ["latin"] });

// 27s @ 30fps = 810 frames
// Hook 90 + P1 150 + P2 150 + P3 150 + Social 120 + CTA 150 = 810

const COLORS = {
  cream: "#FFF6EC",
  ink: "#0E0E10",
  hot: "#FF4D2E",
  amber: "#FFB200",
  mint: "#1FB386",
  lilac: "#7B5CFF",
};

const AnimatedBackground: React.FC<{ color: string; accent: string }> = ({ color, accent }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);
  return (
    <AbsoluteFill style={{ background: color }}>
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: accent,
          opacity: 0.18,
          top: -200 + drift * 60,
          left: -200 - drift * 80,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: accent,
          opacity: 0.12,
          bottom: -150 - drift * 40,
          right: -100 + drift * 50,
          filter: "blur(80px)",
        }}
      />
    </AbsoluteFill>
  );
};

const FilmGrain: React.FC = () => (
  <AbsoluteFill
    style={{
      opacity: 0.06,
      backgroundImage:
        "radial-gradient(circle at 20% 30%, #000 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, #000 0.5px, transparent 1px)",
      backgroundSize: "3px 3px, 5px 5px",
      pointerEvents: "none",
    }}
  />
);

// ── SCENE 1: HOOK (0–3s) ────────────────────────────────────────────
const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stop = spring({ frame, fps, config: { damping: 8, stiffness: 140 } });
  const line1 = spring({ frame: frame - 18, fps, config: { damping: 12, stiffness: 120 } });
  const line2 = spring({ frame: frame - 36, fps, config: { damping: 12, stiffness: 120 } });
  const arrow = interpolate(frame, [60, 90], [0, 30], { extrapolateRight: "clamp" });
  const wiggle = Math.sin(frame * 0.4) * 4;

  return (
    <AbsoluteFill>
      <AnimatedBackground color={COLORS.cream} accent={COLORS.hot} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 220,
              color: COLORS.hot,
              lineHeight: 0.9,
              transform: `scale(${stop}) rotate(${wiggle * 0.3}deg)`,
              textShadow: "8px 8px 0 #0E0E10",
              letterSpacing: -2,
            }}
          >
            STOP
          </div>
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 130,
              color: COLORS.ink,
              lineHeight: 0.95,
              marginTop: 30,
              opacity: line1,
              transform: `translateY(${interpolate(line1, [0, 1], [40, 0])}px)`,
            }}
          >
            SCROLLING.
          </div>
          <div
            style={{
              fontFamily: body.fontFamily,
              fontSize: 56,
              fontWeight: 700,
              color: COLORS.ink,
              marginTop: 50,
              opacity: line2,
              transform: `translateY(${interpolate(line2, [0, 1], [20, 0])}px)`,
              maxWidth: 880,
            }}
          >
            Your pet is going to <span style={{ color: COLORS.hot, fontStyle: "italic" }}>love</span> this.
          </div>
          <div
            style={{
              fontSize: 100,
              marginTop: 80,
              transform: `translateY(${arrow}px)`,
              opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            👇
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── PRODUCT SHOWCASE SCENE ──────────────────────────────────────────
const ProductScene: React.FC<{
  number: string;
  badge: string;
  badgeColor: string;
  bgColor: string;
  accentColor: string;
  productName: string;
  tagline: string;
  price: string;
  oldPrice: string;
  imageSrc: string;
}> = ({ number, badge, badgeColor, bgColor, accentColor, productName, tagline, price, oldPrice, imageSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardEnter = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const numberEnter = spring({ frame: frame - 8, fps, config: { damping: 12, stiffness: 140 } });
  const nameEnter = spring({ frame: frame - 22, fps, config: { damping: 16, stiffness: 100 } });
  const taglineEnter = spring({ frame: frame - 38, fps, config: { damping: 18 } });
  const priceEnter = spring({ frame: frame - 60, fps, config: { damping: 10, stiffness: 160 } });
  const badgeEnter = spring({ frame: frame - 75, fps, config: { damping: 8, stiffness: 180 } });

  const float = Math.sin(frame * 0.06) * 12;
  const breathe = 1 + Math.sin(frame * 0.04) * 0.015;

  return (
    <AbsoluteFill>
      <AnimatedBackground color={bgColor} accent={accentColor} />

      {/* HUGE number background */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 60,
          fontFamily: display.fontFamily,
          fontSize: 480,
          color: "rgba(14,14,16,0.06)",
          lineHeight: 0.8,
          opacity: numberEnter,
          transform: `scale(${interpolate(numberEnter, [0, 1], [0.85, 1])})`,
        }}
      >
        {number}
      </div>

      {/* Product image card */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: 820,
            height: 820,
            borderRadius: 48,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 40px 80px rgba(0,0,0,0.18), 0 0 0 8px rgba(255,255,255,0.6)",
            opacity: cardEnter,
            transform: `translateY(${interpolate(cardEnter, [0, 1], [60, float])}px) scale(${cardEnter * breathe})`,
            marginTop: -180,
          }}
        >
          <Img
            src={staticFile(imageSrc)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </AbsoluteFill>

      {/* Badge top right */}
      <div
        style={{
          position: "absolute",
          top: 100,
          right: 60,
          background: badgeColor,
          color: "#fff",
          fontFamily: body.fontFamily,
          fontWeight: 900,
          fontSize: 38,
          padding: "18px 32px",
          borderRadius: 999,
          transform: `scale(${badgeEnter}) rotate(${interpolate(badgeEnter, [0, 1], [-15, -6])}deg)`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          letterSpacing: 0.5,
        }}
      >
        {badge}
      </div>

      {/* Bottom info panel */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          left: 60,
          right: 60,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 84,
            color: COLORS.ink,
            lineHeight: 1.0,
            opacity: nameEnter,
            transform: `translateY(${interpolate(nameEnter, [0, 1], [30, 0])}px)`,
            letterSpacing: -1,
          }}
        >
          {productName}
        </div>
        <div
          style={{
            fontFamily: body.fontFamily,
            fontWeight: 600,
            fontSize: 38,
            color: COLORS.ink,
            marginTop: 18,
            opacity: taglineEnter * 0.85,
            transform: `translateY(${interpolate(taglineEnter, [0, 1], [20, 0])}px)`,
          }}
        >
          {tagline}
        </div>
        <div
          style={{
            marginTop: 28,
            display: "flex",
            justifyContent: "center",
            alignItems: "baseline",
            gap: 24,
            opacity: priceEnter,
            transform: `scale(${interpolate(priceEnter, [0, 1], [0.7, 1])})`,
          }}
        >
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 96,
              color: COLORS.hot,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            {price}
          </div>
          <div
            style={{
              fontFamily: body.fontFamily,
              fontWeight: 700,
              fontSize: 44,
              color: "rgba(14,14,16,0.45)",
              textDecoration: "line-through",
            }}
          >
            {oldPrice}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── SOCIAL PROOF SCENE ──────────────────────────────────────────────
const SceneSocial: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const t1 = spring({ frame, fps, config: { damping: 14 } });
  const stat1 = spring({ frame: frame - 18, fps, config: { damping: 10, stiffness: 140 } });
  const stat2 = spring({ frame: frame - 36, fps, config: { damping: 10, stiffness: 140 } });
  const stat3 = spring({ frame: frame - 54, fps, config: { damping: 10, stiffness: 140 } });

  const stats = [
    { big: "50% OFF", small: "limited drop", color: COLORS.hot, anim: stat1 },
    { big: "FREE", small: "US shipping", color: COLORS.mint, anim: stat2 },
    { big: "30-DAY", small: "happy returns", color: COLORS.lilac, anim: stat3 },
  ];

  return (
    <AbsoluteFill>
      <AnimatedBackground color={COLORS.ink} accent={COLORS.amber} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div
          style={{
            fontFamily: display.fontFamily,
            fontSize: 110,
            color: "#fff",
            textAlign: "center",
            lineHeight: 0.95,
            opacity: t1,
            transform: `translateY(${interpolate(t1, [0, 1], [30, 0])}px)`,
            marginBottom: 80,
          }}
        >
          WHY PET PARENTS<br />
          <span style={{ color: COLORS.amber, fontStyle: "italic" }}>OBSESS</span> OVER US
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 36, width: "100%" }}>
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(255,255,255,0.08)",
                border: "2px solid rgba(255,255,255,0.15)",
                padding: "32px 48px",
                borderRadius: 32,
                opacity: s.anim,
                transform: `translateX(${interpolate(s.anim, [0, 1], [-80, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: display.fontFamily,
                  fontSize: 92,
                  color: s.color,
                  lineHeight: 1,
                  letterSpacing: -1,
                }}
              >
                {s.big}
              </div>
              <div
                style={{
                  fontFamily: body.fontFamily,
                  fontWeight: 600,
                  fontSize: 34,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {s.small}
              </div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── CTA SCENE ──────────────────────────────────────────────────────
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tap = spring({ frame, fps, config: { damping: 8, stiffness: 140 } });
  const url = spring({ frame: frame - 22, fps, config: { damping: 14 } });
  const button = spring({ frame: frame - 50, fps, config: { damping: 8, stiffness: 160 } });
  const pulse = 1 + Math.sin(frame * 0.25) * 0.04;
  const arrowBounce = Math.sin(frame * 0.3) * 14;

  return (
    <AbsoluteFill>
      <AnimatedBackground color={COLORS.hot} accent={COLORS.amber} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: display.fontFamily,
              fontSize: 200,
              color: "#fff",
              lineHeight: 0.9,
              transform: `scale(${tap})`,
              textShadow: "10px 10px 0 #0E0E10",
              letterSpacing: -3,
            }}
          >
            TAP THE<br />LINK
          </div>
          <div style={{ fontSize: 90, marginTop: 30, transform: `translateY(${arrowBounce}px)` }}>👆</div>

          <div
            style={{
              marginTop: 60,
              display: "inline-block",
              background: "#fff",
              padding: "32px 64px",
              borderRadius: 999,
              opacity: url,
              transform: `scale(${url * pulse})`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                fontFamily: display.fontFamily,
                fontSize: 78,
                color: COLORS.ink,
                letterSpacing: -1,
              }}
            >
              getpawsy.pet 🐾
            </div>
          </div>

          <div
            style={{
              marginTop: 50,
              fontFamily: body.fontFamily,
              fontWeight: 800,
              fontSize: 44,
              color: "#fff",
              opacity: button,
              transform: `translateY(${interpolate(button, [0, 1], [20, 0])}px)`,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Your pet will thank you ❤️
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── MAIN COMPOSITION ───────────────────────────────────────────────
export const MainVideoTikTokAd: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Background music — soft, ducked under VO */}
      <Audio src={staticFile("audio/tiktok-ad-music.mp3")} volume={0.18} />

      {/* Voice-over — starts ~6 frames in */}
      <Sequence from={6}>
        <Audio src={staticFile("audio/tiktok-ad-vo.mp3")} volume={1.0} />
      </Sequence>

      <Series>
        <Series.Sequence durationInFrames={90}>
          <SceneHook />
        </Series.Sequence>

        <Series.Sequence durationInFrames={150}>
          <ProductScene
            number="01"
            badge="HOT 🔥"
            badgeColor={COLORS.hot}
            bgColor="#FFE9D6"
            accentColor={COLORS.hot}
            productName="Cooling Dog Bed"
            tagline="Breathable mesh. Stays cool all summer."
            price="$127"
            oldPrice="$178"
            imageSrc="images/tiktok-ad/cooling-bed.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={150}>
          <ProductScene
            number="02"
            badge="VIRAL ✨"
            badgeColor={COLORS.mint}
            bgColor="#E6F7EE"
            accentColor={COLORS.mint}
            productName="Cactus Cat Tree"
            tagline="Sisal posts + cozy condo. Cats obsessed."
            price="$79"
            oldPrice="$109"
            imageSrc="images/tiktok-ad/cactus-tree.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={150}>
          <ProductScene
            number="03"
            badge="NEW 💫"
            badgeColor={COLORS.lilac}
            bgColor="#EFE9FF"
            accentColor={COLORS.lilac}
            productName="Pet Travel Backpack"
            tagline="Expandable. Breathable. Adventure-ready."
            price="$79"
            oldPrice="$108"
            imageSrc="images/tiktok-ad/carrier-backpack.jpg"
          />
        </Series.Sequence>

        <Series.Sequence durationInFrames={120}>
          <SceneSocial />
        </Series.Sequence>

        <Series.Sequence durationInFrames={150}>
          <SceneCTA />
        </Series.Sequence>
      </Series>

      <FilmGrain />
    </AbsoluteFill>
  );
};