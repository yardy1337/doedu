import React, { useEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";
import { fontsReady } from "../fonts";
import { drawRouteUI, UI_H, UI_W } from "../props/RouteUI";
import { clamp } from "../lib/anim";

/** Стенд экрана телефона: 0–2 с иконки порознь, 2–4 слияние, 4–10 подсветка сегментов */
export const UITest: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const h = delayRender();
    fontsReady.then(() => {
      const g = ref.current!.getContext("2d")!;
      const r = (a: number, b: number) => clamp((t - a) / (b - a));
      drawRouteUI(g, UI_W, UI_H, {
        t,
        appear: r(0, 0.4),
        gather: r(1, 2.2),
        merge: r(2.1, 3.4),
        seg: [r(4, 4.3) * (1 - r(5.5, 5.8)), r(5.5, 5.8) * (1 - r(7, 7.3)), r(7, 7.3) * (1 - r(8.5, 8.8))],
        all: r(8.5, 9),
        noTransfers: r(9.2, 9.6),
        exit: r(10, 11),
      });
      continueRender(h);
    });
  }, [t]);
  return (
    <AbsoluteFill style={{ background: "#333", alignItems: "center", justifyContent: "center" }}>
      <canvas ref={ref} width={UI_W} height={UI_H} style={{ width: UI_W, height: UI_H }} />
    </AbsoluteFill>
  );
};
