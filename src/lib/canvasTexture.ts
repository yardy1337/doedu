import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { continueRender, delayRender } from "remotion";
import { fontsReady } from "../fonts";

let fontsLoaded = false;
fontsReady.then(() => (fontsLoaded = true));

/**
 * Текстура, которая рисуется на canvas при каждом рендере кадра (детерминированно — draw
 * зависит только от переданных данных). Ждёт загрузки шрифтов, чтобы текст
 * не попал в кадр запасным шрифтом.
 */
export function useCanvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const [ready, setReady] = useState(fontsLoaded);
  useEffect(() => {
    if (ready) return;
    const handle = delayRender("canvas texture fonts");
    fontsReady.then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [ready]);
  const { canvas, tex } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return { canvas, tex };
  }, [w, h]);
  if (ready) {
    const g = canvas.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
    tex.needsUpdate = true;
  }
  return tex;
}

/** Скруглённый прямоугольник (путь) */
export const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};
