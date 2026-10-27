import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { rng } from "../lib/anim";

/**
 * Старая плёнка (флешбэк): мерцание, царапины, пылинки, тяжёлая виньетка и скруглённые
 * углы кадра. Всё зависит только от номера кадра. amount 0..1.
 * burn 0..1 — плёнка прогорает от центра (флешбэк рассыпается).
 */
export const Film: React.FC<{ frame: number; amount: number; burn?: number }> = ({ frame, amount, burn = 0 }) => {
  const { width: W, height: H } = useVideoConfig();
  if (amount <= 0.001 && burn <= 0) return null;
  const r = rng(frame * 131 + 7);
  const flick = 0.06 + r() * 0.1;
  // царапины живут по несколько кадров
  const rs = rng(Math.floor(frame / 4) * 17 + 3);
  const scratches = Array.from({ length: 3 }, () => ({ x: rs() * W, w: 1 + rs() * 2.5, o: rs() < 0.6 ? 0.5 + rs() * 0.4 : 0, dark: rs() < 0.5 }));
  const specks = Array.from({ length: 14 }, () => ({ x: r() * W, y: r() * H, rad: 1.5 + r() * 4.5, dark: r() < 0.65, o: 0.4 + r() * 0.5, hair: r() < 0.18, a: r() * 6.28 }));
  const R = Math.max(W, H) * 0.035;
  const burnR = Math.pow(burn, 1.6) * Math.hypot(W, H) * 0.75;
  const cx = W * 0.52;
  const cy = H * 0.46;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={W} height={H}>
        <defs>
          <radialGradient id="filmVig" cx="50%" cy="50%" r="72%">
            <stop offset="0.45" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.85} />
          </radialGradient>
          <radialGradient id="burn" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffffff" stopOpacity={1} />
            <stop offset="0.72" stopColor="#f2f2f2" stopOpacity={1} />
            <stop offset="0.86" stopColor="#9a9a9a" stopOpacity={1} />
            <stop offset="0.95" stopColor="#1a1a1a" stopOpacity={0.95} />
            <stop offset="1" stopColor="#000" stopOpacity={0} />
          </radialGradient>
          <filter id="burnEdge">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={3} seed={11} />
            <feDisplacementMap in="SourceGraphic" scale={Math.min(W, H) * 0.12} />
          </filter>
        </defs>
        <g opacity={amount}>
          <rect width={W} height={H} fill="#000" opacity={flick} />
          <rect width={W} height={H} fill="url(#filmVig)" />
          {scratches.map((s, i) =>
            s.o > 0 ? <rect key={i} x={s.x} y={0} width={s.w} height={H} fill={s.dark ? "#000" : "#fff"} opacity={s.o * 0.55} /> : null,
          )}
          {specks.map((s, i) =>
            s.hair ? (
              <path
                key={i}
                d={`M${s.x} ${s.y} q ${Math.cos(s.a) * 30} ${Math.sin(s.a) * 30} ${Math.cos(s.a + 1) * 55} ${Math.sin(s.a + 1) * 55}`}
                stroke={s.dark ? "#000" : "#fff"}
                strokeWidth={1.6}
                fill="none"
                opacity={s.o}
              />
            ) : (
              <circle key={i} cx={s.x} cy={s.y} r={s.rad} fill={s.dark ? "#000" : "#fff"} opacity={s.o} />
            ),
          )}
          {/* скруглённые углы кадра плёнки */}
          <path
            d={`M0 0 H${W} V${H} H0 Z M${R} 0 Q0 0 0 ${R} V${H - R} Q0 ${H} ${R} ${H} H${W - R} Q${W} ${H} ${W} ${H - R} V${R} Q${W} 0 ${W - R} 0 Z`}
            fill="#000"
            fillRule="evenodd"
          />
        </g>
        {burn > 0 && (
          <g filter="url(#burnEdge)">
            <circle cx={cx} cy={cy} r={burnR} fill="url(#burn)" />
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};

/** Белая вспышка (переходы флешбэка) */
export const Flash: React.FC<{ amount: number }> = ({ amount }) =>
  amount > 0.001 ? <AbsoluteFill style={{ background: "#ffffff", opacity: Math.min(1, amount) }} /> : null;
