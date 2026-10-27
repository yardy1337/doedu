import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { BRAND } from "../brand";

/**
 * POV-веки. open: 0 — закрыты, 1 — открыты полностью.
 * tilt: асимметрия (один глаз открывается раньше — щель шире с одной стороны).
 * glow: алый свет, пробивающийся сквозь закрытые веки.
 */
export const Eyelids: React.FC<{ open: number; tilt?: number; glow?: number }> = ({ open, tilt = 0, glow = 0 }) => {
  const { width: W, height: H } = useVideoConfig();
  if (open >= 0.999 && glow <= 0) return null;
  const o = Math.max(0, Math.min(1, open));
  const cy = H / 2;
  // полуширина щели по вертикали в центре; по краям уже (форма линзы)
  const gap = o * (H * 0.62);
  const N = 24;
  const edge = (sign: number) => {
    let d = "";
    for (let i = 0; i <= N; i++) {
      const x = -W * 0.1 + (W * 1.2 * i) / N;
      const u = (x - W / 2) / (W * 0.62);
      const lens = Math.max(0, 1 - u * u);
      const asym = 1 + tilt * (x / W - 0.5) * 1.6;
      const y = cy + sign * (gap * Math.pow(lens, 0.6) * Math.max(0.05, asym) + (o > 0.97 ? (o - 0.97) * H * 40 : 0));
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
  };
  const top = `${edge(-1)} L${W * 1.1} ${-H} L${-W * 0.1} ${-H} Z`;
  const bottom = `${edge(1)} L${W * 1.1} ${H * 2} L${-W * 0.1} ${H * 2} Z`;
  const blur = Math.max(W, H) * 0.012;
  const lidColor = BRAND.black;
  return (
    <AbsoluteFill>
      <svg width={W} height={H}>
        <defs>
          <filter id="lidBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={blur} />
          </filter>
          <radialGradient id="lidGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor={BRAND.red} stopOpacity={0.95} />
            <stop offset="0.45" stopColor="#7a0f12" stopOpacity={0.7} />
            <stop offset="1" stopColor="#2a0607" stopOpacity={0.4} />
          </radialGradient>
        </defs>
        <g filter="url(#lidBlur)">
          <path d={top} fill={lidColor} />
          <path d={bottom} fill={lidColor} />
        </g>
        {glow > 0 && <rect width={W} height={H} fill="url(#lidGlow)" opacity={glow} />}
      </svg>
    </AbsoluteFill>
  );
};

export const Black: React.FC<{ opacity: number }> = ({ opacity }) =>
  opacity > 0 ? <AbsoluteFill style={{ background: BRAND.black, opacity }} /> : null;

/** Плёночное зерно: шум, зависящий только от номера кадра */
export const Grain: React.FC<{ frame: number; amount: number }> = ({ frame, amount }) => {
  const { width: W, height: H } = useVideoConfig();
  return (
    <AbsoluteFill style={{ opacity: amount, mixBlendMode: "screen", pointerEvents: "none" }}>
      <svg width={W} height={H}>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={(frame * 7919) % 997} />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.5 -0.7" />
        </filter>
        <rect width={W} height={H} filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
