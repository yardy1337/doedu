import React from "react";
import { AbsoluteFill, spring, useVideoConfig } from "remotion";
import { BRAND } from "../brand";
import { FONT } from "../fonts";
import { LogoMark } from "./Logo";

/** Финальная карточка серии: логотип, «Серия N», «Продолжение следует…» */
export const EpisodeCard: React.FC<{ frame: number; title: string; subtitle: string; beats: { logo: number; title: number; subtitle: number } }> = ({
  frame,
  title,
  subtitle,
  beats,
}) => {
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
