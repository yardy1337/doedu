import React from "react";
import { AbsoluteFill, spring, useVideoConfig } from "remotion";
import { BRAND } from "../brand";
import { FONT, FONT_HAND } from "../fonts";
import { LogoMark } from "./Logo";

/**
 * Финальная карточка серии: логотип, «Серия N», «Продолжение следует…».
 * С slogan (серия 2+): логотип → рукописный слоган алым (beats.subtitle) → «Серия N» (beats.title).
 */
export const EpisodeCard: React.FC<{
  frame: number;
  title: string;
  subtitle: string;
  beats: { logo: number; title: number; subtitle: number };
  slogan?: string;
}> = ({ frame, title, subtitle, beats, slogan }) => {
  const { width: W, height: H, fps } = useVideoConfig();
  const vertical = H > W;
  const sp = (at: number, cfg = { damping: 14, stiffness: 120 }) => (frame < at ? 0 : spring({ frame: frame - at, fps, config: cfg }));
  const logo = sp(beats.logo, { damping: 18, stiffness: 90 });
  const dots = frame < beats.logo + 8 ? 0 : spring({ frame: frame - beats.logo - 8, fps, config: { damping: 200 }, durationInFrames: 22 });
  const pin = sp(beats.logo + 20, { damping: 9, stiffness: 160 });
  const t1 = sp(beats.title);
  const t2 = sp(beats.subtitle, { damping: 200, stiffness: 80 });
  // многоточие печатается по точке
  const shownDots = Math.min(3, Math.max(0, Math.floor((frame - beats.subtitle - 10) / 7)));
  const base = subtitle.replace(/[.…]+$/, "");
  const glow = 0.6 + 0.4 * Math.sin(frame / 10);
  if (slogan) {
    // «пишется от руки»: проявление слева направо с мягким краем + лёгкий подъём
    const write = frame < beats.subtitle ? 0 : Math.min(1, (frame - beats.subtitle) / (fps * 1.1));
    const ease = 1 - Math.pow(1 - write, 2.2);
    const edge = ease * 112 - 6;
    return (
      <AbsoluteFill style={{ background: BRAND.black, alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: FONT }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * logo})`, opacity: logo }}>
          <LogoMark width={vertical ? 720 : 560} dots={dots} pin={pin} glow={glow * pin} />
        </div>
        <div
          style={{
            marginTop: vertical ? 40 : 14,
            fontFamily: FONT_HAND,
            fontWeight: 700,
            fontSize: vertical ? 132 : 112,
            lineHeight: 1.05,
            color: BRAND.red,
            whiteSpace: "nowrap",
            transform: `rotate(-3deg) translateY(${(1 - ease) * 10}px)`,
            WebkitMaskImage: `linear-gradient(90deg, #000 ${edge}%, transparent ${edge + 6}%)`,
            maskImage: `linear-gradient(90deg, #000 ${edge}%, transparent ${edge + 6}%)`,
            textShadow: `0 0 ${26 * glow * ease}px rgba(227,30,36,0.5)`,
          }}
        >
          {slogan}
        </div>
        <div
          style={{
            marginTop: vertical ? 54 : 26,
            fontWeight: 900,
            fontSize: vertical ? 64 : 54,
            letterSpacing: vertical ? 10 : 8,
            color: BRAND.white,
            textTransform: "uppercase",
            opacity: t1,
            transform: `translateY(${(1 - t1) * 24}px)`,
          }}
        >
          {title}
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: BRAND.black, alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: FONT }}>
      <div style={{ transform: `scale(${0.85 + 0.15 * logo})`, opacity: logo }}>
        <LogoMark width={vertical ? 760 : 620} dots={dots} pin={pin} glow={glow * pin} />
      </div>
      <div
        style={{
          marginTop: vertical ? 70 : 34,
          fontWeight: 900,
          fontSize: vertical ? 92 : 78,
          letterSpacing: vertical ? 6 : 5,
          color: BRAND.red,
          textTransform: "uppercase",
          opacity: t1,
          transform: `translateY(${(1 - t1) * 30}px)`,
          textShadow: `0 0 ${30 * glow}px rgba(227,30,36,0.55)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: vertical ? 34 : 18,
          fontWeight: 500,
          fontSize: vertical ? 56 : 48,
          color: BRAND.white,
          opacity: t2,
          transform: `translateY(${(1 - t2) * 20}px)`,
        }}
      >
        {base}
        <span style={{ display: "inline-block", width: "1.1em", textAlign: "left" }}>{"…".slice(0, shownDots ? 1 : 0) && ".".repeat(shownDots)}</span>
      </div>
    </AbsoluteFill>
  );
};
