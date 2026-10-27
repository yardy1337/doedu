import { BRAND } from "../brand";
import { FONT } from "../fonts";
import { clamp, lerp, out, outBack, inOut } from "../lib/anim";
import { roundRect } from "../lib/canvasTexture";

/**
 * Экран приложения «Доеду» — гибридный маршрут. Рисуется на canvas по состоянию,
 * которое сценарий считает от времени (детерминированно).
 */
export type RouteUIState = {
  t: number; // секунды с включения экрана (мелкая «жизнь» интерфейса)
  appear: number; // 0..1 — экран загорается
  gather: number; // 0..1 — иконки видов транспорта стягиваются друг к другу
  merge: number; // 0..1 — сливаются в одну алую линию (прорисовка)
  seg: [number, number, number]; // подсветка сегментов: поезд, автобус, пешком
  all: number; // 0..1 — весь маршрут «в одном приложении»
  noTransfers: number; // 0..1 — плашка «без пересадок в других сервисах»
  exit: number; // 0..1 — линия «вытекает» за край экрана
};

export const UI_W = 720;
export const UI_H = 1480;

const RED = BRAND.red;
const P = {
  A: [128, 930] as const, // Москва
  B: [318, 676] as const, // Тверь
  C: [500, 540] as const, // Причал
  D: [596, 420] as const, // Санаторий
};
type Pt = readonly [number, number];

// сегменты маршрута — кубические кривые Безье (рисуются по доле t)
const SEGS: [Pt, Pt, Pt, Pt][] = [
  [P.A, [180, 840], [250, 740], P.B], // поезд — почти прямая «железка»
  [P.B, [390, 690], [420, 560], P.C], // автобус — по дороге с поворотом
  [P.C, [540, 525], [585, 490], P.D], // пешком — короткий отрезок
];
const bez = (s: [Pt, Pt, Pt, Pt], u: number): [number, number] => {
  const a = 1 - u;
  return [
    a * a * a * s[0][0] + 3 * a * a * u * s[1][0] + 3 * a * u * u * s[2][0] + u * u * u * s[3][0],
    a * a * a * s[0][1] + 3 * a * a * u * s[1][1] + 3 * a * u * u * s[2][1] + u * u * u * s[3][1],
  ];
};
const strokeBez = (g: CanvasRenderingContext2D, s: [Pt, Pt, Pt, Pt], u0: number, u1: number) => {
  const N = 40;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = lerp(u0, u1, i / N);
    const [x, y] = bez(s, u);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
};

// ---------------- пиктограммы ----------------
export type Mode = "train" | "bus" | "walk";

export const drawIcon = (g: CanvasRenderingContext2D, mode: Mode, x: number, y: number, s: number, color: string) => {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (mode === "train") {
    roundRect(g, -30, -40, 60, 66, 16);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.85)";
    roundRect(g, -21, -31, 42, 24, 6);
    g.fill();
    g.beginPath();
    g.arc(-15, 10, 5.5, 0, Math.PI * 2);
    g.arc(15, 10, 5.5, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-18, 32);
    g.lineTo(-28, 46);
    g.moveTo(18, 32);
    g.lineTo(28, 46);
    g.stroke();
  } else if (mode === "bus") {
    // автобус в профиль: длинный корпус, ряд окон, два колеса
    roundRect(g, -46, -30, 92, 52, 12);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.85)";
    for (let i = 0; i < 3; i++) {
      roundRect(g, -38 + i * 22, -22, 17, 18, 3);
      g.fill();
    }
    roundRect(g, 30, -22, 10, 34, 3);
    g.fill();
    g.beginPath();
    g.arc(-26, 24, 12, 0, Math.PI * 2);
    g.arc(24, 24, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(-26, 24, 7, 0, Math.PI * 2);
    g.arc(24, 24, 7, 0, Math.PI * 2);
    g.fill();
  } else {
    // пешеход — человечек из логотипа «Доеду»
    g.beginPath();
    g.arc(4, -36, 11, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(2, -22);
    g.lineTo(-2, 8);
    g.lineTo(-16, 40);
    g.moveTo(-2, 8);
    g.lineTo(14, 40);
    g.moveTo(1, -14);
    g.lineTo(-16, -2);
    g.lineTo(-20, 14);
    g.moveTo(1, -14);
    g.lineTo(16, 0);
    g.lineTo(24, -10);
    g.stroke();
  }
  g.restore();
};

/** Пин из логотипа: алая капля с тёмным «глазком» */
const drawPin = (g: CanvasRenderingContext2D, x: number, y: number, s: number, glow: number) => {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.shadowColor = RED;
  g.shadowBlur = 30 * glow;
  g.fillStyle = RED;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-15, -20, -38, -44, -38, -73);
  g.arc(0, -73, 38, Math.PI, 0);
  g.bezierCurveTo(38, -44, 15, -20, 0, 0);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#111111";
  g.beginPath();
  g.arc(0, -73, 15, 0, Math.PI * 2);
  g.fill();
  g.restore();
};

const text = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left") => {
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(s, x, y);
};

// ---------------- карта ----------------
const MAP = { x: 24, y: 300, w: UI_W - 48, h: 700 };

const drawMap = (g: CanvasRenderingContext2D) => {
  g.save();
  roundRect(g, MAP.x, MAP.y, MAP.w, MAP.h, 30);
  g.clip();
  g.fillStyle = "#171717";
  g.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  // кварталы
  g.fillStyle = "#1c1c1c";
  const blocks: [number, number, number, number][] = [
    [60, 860, 150, 120], [40, 760, 90, 70], [230, 900, 120, 90], [400, 820, 160, 130], [580, 900, 120, 80],
    [250, 600, 90, 60], [430, 380, 120, 90], [60, 420, 160, 150], [620, 600, 80, 140],
  ];
  for (const [x, y, w, h] of blocks) {
    roundRect(g, x, y, w, h, 10);
    g.fill();
  }
  // река (Волга) с озером у причала
  g.strokeStyle = "#202020";
  g.lineWidth = 46;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(MAP.x - 20, 700);
  g.bezierCurveTo(200, 760, 330, 470, 470, 600);
  g.bezierCurveTo(560, 680, 640, 560, MAP.x + MAP.w + 30, 470);
  g.stroke();
  g.strokeStyle = "#262626";
  g.lineWidth = 3;
  g.stroke();
  // дороги
  g.strokeStyle = "#2b2b2b";
  g.lineCap = "round";
  const roads: [number, number, number, number, number][] = [
    [MAP.x, 980, MAP.x + MAP.w, 860, 8],
    [90, MAP.y, 260, MAP.y + MAP.h, 6],
    [MAP.x, 500, MAP.x + MAP.w, 640, 5],
    [380, MAP.y, 560, MAP.y + MAP.h, 6],
    [MAP.x, 380, 700, 330, 4],
    [600, MAP.y, 700, MAP.y + MAP.h, 4],
  ];
  for (const [x0, y0, x1, y1, w] of roads) {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  g.restore();
};

/** Иконка вида транспорта в кружке */
const bubble = (g: CanvasRenderingContext2D, mode: Mode, x: number, y: number, s: number, active: number) => {
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = 16;
  g.fillStyle = active > 0.5 ? RED : BRAND.white;
  g.beginPath();
  g.arc(x, y, s / 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (active > 0.01 && active <= 0.5) {
    g.strokeStyle = RED;
    g.lineWidth = 6 * active * 2;
    g.beginPath();
    g.arc(x, y, s / 2 + 4, 0, Math.PI * 2);
    g.stroke();
  }
  drawIcon(g, mode, x, y + 2, s * 0.56, active > 0.5 ? BRAND.white : "#111111");
};

const MODES: Mode[] = ["train", "bus", "walk"];
// где иконки «живут» до слияния — порознь, каждая со своим обрывком маршрута
const SCATTER: [number, number][] = [
  [140, 470],
  [610, 830],
  [330, 950],
];

export function drawRouteUI(g: CanvasRenderingContext2D, w: number, h: number, s: RouteUIState) {
  const sx = w / UI_W;
  g.save();
  g.scale(sx, h / UI_H);
  g.fillStyle = "#0e0e0e";
  g.fillRect(0, 0, UI_W, UI_H);
  if (s.appear <= 0) {
    g.restore();
    return;
  }
  g.globalAlpha = clamp(s.appear * 1.5);

  // статус-бар
  text(g, "23:47", 44, 52, 28, 700, BRAND.white);
  g.fillStyle = BRAND.white;
  roundRect(g, 610, 30, 54, 26, 7);
  g.fill();
  g.fillStyle = "#0e0e0e";
  roundRect(g, 614, 34, 30, 18, 4);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.fillStyle = BRAND.white;
    g.fillRect(540 + i * 13, 52 - (i + 1) * 6, 8, (i + 1) * 6);
  }

  // шапка: логотип + имя помощника
  drawPin(g, 62, 160, 0.62, 0.3);
  text(g, "Доеду", 100, 150, 50, 900, BRAND.white);
  const live = 0.6 + 0.4 * Math.sin(s.t * 5);
  g.fillStyle = RED;
  g.globalAlpha = clamp(s.appear * 1.5) * live;
  g.beginPath();
  g.arc(470, 135, 9, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = clamp(s.appear * 1.5);
  text(g, "До онлайн", 488, 146, 28, 600, "#9a9a9a");

  // строка поиска
  g.fillStyle = "#1c1c1c";
  roundRect(g, 24, 190, UI_W - 48, 92, 26);
  g.fill();
  text(g, "Москва", 54, 248, 34, 800, BRAND.white);
  g.strokeStyle = "#8a8a8a";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(208, 237);
  g.lineTo(248, 237);
  g.moveTo(236, 226);
  g.lineTo(248, 237);
  g.lineTo(236, 248);
  g.stroke();
  text(g, "Санаторий", 268, 248, 34, 800, BRAND.white);
  text(g, "сегодня", UI_W - 54, 248, 26, 600, "#8a8a8a", "right");

  // карта
  drawMap(g);
  g.save();
  roundRect(g, MAP.x, MAP.y, MAP.w, MAP.h, 30);
  g.clip();
  // подписи
  const labels: [string, Pt, number][] = [
    ["Москва", P.A, 0],
    ["Тверь", P.B, 0],
    ["Причал", P.C, 1],
    ["Санаторий", P.D, 2],
  ];
  // до слияния: обрывки маршрутов разных сервисов — серые пунктиры, каждый сам по себе
  const gather = inOut(clamp(s.gather));
  const merge = clamp(s.merge);
  for (let i = 0; i < 3; i++) {
    const seg = SEGS[i];
    const mid = bez(seg, 0.5);
    const [ox, oy] = [SCATTER[i][0] - mid[0], SCATTER[i][1] - mid[1]];
    const k = 1 - gather;
    g.save();
    g.translate(ox * k, oy * k);
    g.globalAlpha = clamp(s.appear * 1.5) * (1 - merge * 0.9);
    g.strokeStyle = "#7a7a7a";
    g.lineWidth = 7;
    g.setLineDash([16, 14]);
    strokeBez(g, seg, 0.06, 0.94);
    g.setLineDash([]);
    g.restore();
  }
  g.globalAlpha = clamp(s.appear * 1.5);
  // единая алая линия: прорисовывается от Москвы до санатория
  const total = merge * 3;
  const all = clamp(s.all);
  for (let i = 0; i < 3; i++) {
    const u1 = clamp(total - i);
    if (u1 <= 0) continue;
    const hl = clamp(s.seg[i]);
    g.save();
    g.strokeStyle = RED;
    g.lineCap = "round";
    g.shadowColor = RED;
    g.shadowBlur = 10 + 26 * Math.max(hl, all * 0.7);
    g.lineWidth = 12 + 7 * hl + 3 * all;
    if (i === 2) g.setLineDash([2, 22]), (g.lineWidth = 15 + 7 * hl + 3 * all);
    strokeBez(g, SEGS[i], 0, u1);
    g.restore();
  }
  // бегущий блик по линии, когда «всё в одном»
  if (all > 0.01) {
    const u = (s.t * 0.45) % 1;
    const segI = Math.min(2, Math.floor(u * 3));
    const [x, y] = bez(SEGS[segI], u * 3 - segI);
    const grd = g.createRadialGradient(x, y, 0, x, y, 40);
    grd.addColorStop(0, `rgba(255,255,255,${0.85 * all})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(x - 40, y - 40, 80, 80);
  }
  // остановки
  const stops: [Pt, number][] = [
    [P.A, 0],
    [P.B, 1],
    [P.C, 2],
  ];
  for (const [p, i] of stops) {
    const k = outBack(clamp((total - i) * 3));
    if (k <= 0) continue;
    g.fillStyle = BRAND.white;
    g.strokeStyle = RED;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(p[0], p[1], 13 * k, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // пин в конце
  const pin = outBack(clamp((total - 2.85) / 0.15));
  if (pin > 0) drawPin(g, P.D[0], P.D[1] + 4, 0.75 * pin, 0.6 + 0.4 * Math.sin(s.t * 4));
  // подписи
  for (const [name, p, segI] of labels) {
    const active = segI === 0 ? Math.max(clamp(s.seg[0]), 0) : clamp(s.seg[segI - 1] ?? 0);
    const reached = name === "Москва" ? 1 : clamp((total - (segI === 0 ? 0 : segI - 1)) * 2 - 1);
    const col = active > 0.4 || all > 0.4 ? BRAND.white : reached > 0.5 ? "#c8c8c8" : "#7a7a7a";
    const dx = name === "Санаторий" ? -44 : 24;
    const dy = name === "Санаторий" ? -34 : name === "Москва" ? 46 : name === "Причал" ? 46 : 8;
    text(g, name, p[0] + dx, p[1] + dy, 28 + 4 * active, active > 0.4 ? 800 : 600, col, name === "Санаторий" ? "right" : "left");
  }
  // иконки: летят друг к другу и садятся на свои сегменты
  for (let i = 0; i < 3; i++) {
    const mid = bez(SEGS[i], i === 2 ? 0.45 : 0.5);
    const x = lerp(SCATTER[i][0], mid[0], gather);
    const y = lerp(SCATTER[i][1], mid[1], gather) - (i === 1 ? 6 : 0);
    const hl = clamp(s.seg[i]);
    const pulse = 1 + 0.22 * hl * (0.75 + 0.25 * Math.sin(s.t * 9));
    // «сжатие» в момент слияния
    const squash = 1 - 0.18 * Math.sin(clamp((gather - 0.85) / 0.15) * Math.PI);
    bubble(g, MODES[i], x, y, 74 * pulse * squash, hl > 0.5 ? 1 : merge > 0.3 ? 0.45 : 0);
  }
  // вспышка слияния
  const flash = Math.sin(clamp((merge - 0.0) / 0.25) * Math.PI) * clamp(gather * 4 - 3);
  if (flash > 0.01) {
    const c = bez(SEGS[1], 0.5);
    const grd = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], 260);
    grd.addColorStop(0, `rgba(227,30,36,${0.45 * flash})`);
    grd.addColorStop(1, "rgba(227,30,36,0)");
    g.fillStyle = grd;
    g.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  }
  g.restore();

  // нижняя панель маршрута
  const sheet = out(clamp(merge * 1.6 - 0.2));
  const sy0 = lerp(UI_H, 1024, sheet);
  g.save();
  g.translate(0, sy0 - 1024);
  g.fillStyle = "#1a1a1a";
  roundRect(g, 0, 1024, UI_W, UI_H - 1024 + 40, 40);
  g.fill();
  g.fillStyle = "#3a3a3a";
  roundRect(g, UI_W / 2 - 40, 1040, 80, 8, 4);
  g.fill();
  text(g, "Гибридный маршрут", 40, 1110, 38, 900, BRAND.white);
  text(g, "3 ч 30 мин", UI_W - 40, 1108, 28, 700, "#bdbdbd", "right");
  // «всё в одном приложении»
  const one = out(clamp(s.all * 1.3));
  if (one > 0.01) {
    g.save();
    g.globalAlpha = one;
    g.shadowColor = RED;
    g.shadowBlur = 24 * (0.7 + 0.3 * Math.sin(s.t * 6));
    g.fillStyle = RED;
    roundRect(g, 40, 1126, 330, 2 + 4 * one, 3);
    g.fill();
    g.restore();
  }
  const rows: [Mode, string, string, string][] = [
    ["train", "Поезд", "до Твери", "2 ч 05 мин"],
    ["bus", "Автобус", "до причала", "1 ч 10 мин"],
    ["walk", "Пешком", "до санатория", "15 мин"],
  ];
  rows.forEach(([mode, a, b, tm], i) => {
    const y = 1146 + i * 84;
    const hl = clamp(s.seg[i]);
    if (hl > 0.01) {
      g.fillStyle = `rgba(227,30,36,${0.16 * hl})`;
      roundRect(g, 24, y - 6, UI_W - 48, 76, 18);
      g.fill();
      g.fillStyle = RED;
      g.globalAlpha = hl;
      roundRect(g, 24, y - 6, 8, 76, 4);
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = hl > 0.5 ? RED : "#2a2a2a";
    g.beginPath();
    g.arc(78, y + 32, 28, 0, Math.PI * 2);
    g.fill();
    drawIcon(g, mode, 78, y + 34, 34, BRAND.white);
    text(g, a, 126, y + 30, 31, 800, BRAND.white);
    text(g, b, 126, y + 62, 25, 600, hl > 0.5 ? "#e6e6e6" : "#8a8a8a");
    text(g, tm, UI_W - 44, y + 44, 27, 700, hl > 0.5 ? BRAND.white : "#9a9a9a", "right");
    // соединительная линия между пунктами — один маршрут
    if (i < 2) {
      g.strokeStyle = all > 0.3 || merge > 0.99 ? RED : "#3a3a3a";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(78, y + 62);
      g.lineTo(78, y + 86 + 2);
      g.stroke();
    }
  });
  // плашка «без пересадок в других сервисах»
  const nt = out(clamp(s.noTransfers));
  if (nt > 0) {
    g.globalAlpha = nt;
    g.fillStyle = "#242424";
    roundRect(g, 24, 1404, UI_W - 48, 56, 28);
    g.fill();
    g.fillStyle = RED;
    g.beginPath();
    g.arc(60, 1432, 9, 0, Math.PI * 2);
    g.fill();
    text(g, "Без пересадок в других сервисах", 82, 1442, 27, 800, BRAND.white);
    g.globalAlpha = 1;
  }
  g.restore();

  // «вытекание» линии за край экрана: алая волна снизу вверх
  if (s.exit > 0) {
    const e = clamp(s.exit);
    const grd = g.createLinearGradient(0, UI_H, 0, UI_H * (1 - e));
    grd.addColorStop(0, `rgba(227,30,36,${0.55 * Math.sin(e * Math.PI)})`);
    grd.addColorStop(1, "rgba(227,30,36,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, UI_W, UI_H);
  }
  g.restore();
}
