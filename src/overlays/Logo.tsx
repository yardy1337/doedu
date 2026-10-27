import React from "react";
import { BRAND } from "../brand";

/** Логотип «Доеду», перерисованный по logo.png (координаты исходника 796×710) */
const VB = { x: 40, y: 88, w: 740, h: 520 };
const DOTS: [number, number, number][] = [
  [360, 565, 21], [443, 539, 19], [518, 500, 16.5], [578, 452, 14.5],
  [625, 401, 12.5], [662, 350, 10.5], [689, 302, 9], [708, 259, 7.5],
];

export const LogoMark: React.FC<{ width: number; man?: number; dots?: number; pin?: number; glow?: number }> = ({
  width,
  man = 1,
  dots = 1,
  pin = 1,
  glow = 0,
}) => (
  <svg width={width} height={(width * VB.h) / VB.w} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} style={{ overflow: "visible" }}>
    <g opacity={man}>
      <ellipse cx={92} cy={321} rx={44} ry={50} fill={BRAND.red} style={{ filter: glow ? `drop-shadow(0 0 ${18 * glow}px ${BRAND.red})` : undefined }} />
      <path d="M91 266 L68 243 M91 266 L114 243" fill="none" stroke={BRAND.red} strokeWidth={15} strokeLinecap="round" />
      <path d="M78 258 L300 326" stroke={BRAND.white} strokeWidth={21} strokeLinecap="round" />
      <g fill="none" stroke={BRAND.white} strokeWidth={26} strokeLinecap="round" strokeLinejoin="round">
        <path d="M224 300 L218 426" />
        <path d="M218 426 L170 565" />
        <path d="M218 426 L267 565" />
        <path d="M222 322 L180 370 L166 428" />
        <path d="M222 322 L270 375 L300 326" />
      </g>
      <circle cx={228} cy={256} r={42} fill={BRAND.white} />
    </g>
    {DOTS.map(([x, y, r], i) => {
      const k = Math.max(0, Math.min(1, dots * DOTS.length - i));
      return <circle key={i} cx={x} cy={y} r={r * k} fill={BRAND.white} />;
    })}
    <g transform={`translate(720 216) scale(${pin}) translate(-720 -216)`} style={{ filter: glow ? `drop-shadow(0 0 ${16 * glow}px ${BRAND.red})` : undefined }}>
      <path d="M720 216 C 705 196, 682 172, 682 143 A 39 39 0 1 1 760 143 C 760 172, 737 196, 720 216 Z" fill={BRAND.red} />
      <circle cx={721} cy={143} r={15} fill={BRAND.black} />
    </g>
  </svg>
);
