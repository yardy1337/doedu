/**
 * «Доеду. Серия 1» — сценарий. Здесь только «что и когда происходит»:
 * функции время (сек) → состояние героя, толпы, Спасителя, камеры, эффектов и звука.
 * Персонажи, станция, камера, звук — общие компоненты.
 */
import timingJson from "./audio-timing.json";
import { AudioCue } from "../audio/Soundtrack";
import { CameraState } from "../camera/CameraRig";
import { Limb, mixPose, pointOf, Pose, rigMatrices, STAND, walk, withPose } from "../characters/rig";
import { EYES_DEFAULT, Eyes } from "../characters/Stickman3D";
import { SAVIOR_SCALE } from "../characters/Characters";
import { STATION } from "../sets/Station";
import { angleLerp, clamp, inn, inOut, lerp, lerp3, linear, out, pulse, ramp, rng, shake, track, track3, V3 } from "../lib/anim";
import { CrowdState, Episode, FxState, HeroState, SaviorState } from "./types";

// ---------------------------------------------------------------------
// Длительность реплик (из ElevenLabs) — тайминг подстраивается под них
// ---------------------------------------------------------------------
type Timing = { duration: number; words: { word: string; start: number; end: number }[] };
const VO = timingJson as Record<string, Timing>;
const dur = (id: string) => VO[id]?.duration ?? 1.5;

// ---------------------------------------------------------------------
// Ключевые моменты (секунды)
// ---------------------------------------------------------------------
const HERO01_AT = 12.35;
const LOOK1_END = Math.max(14.6, HERO01_AT + dur("hero_01") + 0.15);
const HERO02_AT = 32.15;
const SQUEEZE = Math.max(33.9, HERO02_AT + dur("hero_02") + 0.1);
const SAVIOR01_AT = 49.75;
const FREEZE = Math.max(51.4, SAVIOR01_AT + dur("savior_01") + 0.6);
const CUT = Math.max(53.0, FREEZE + 1.5);
const NARRATOR_AT = CUT + 0.9;
const narratorSecondWord = VO.narrator_01?.words?.[1]?.start ?? 0.8;
const END = Math.max(CUT + 5, NARRATOR_AT + dur("narrator_01") + 2.2);

export const BEATS = {
  walk: 4.0,
  heads: [6.0, 8.6] as const,
  look1: 12.2,
  look1End: LOOK1_END,
  look2: 17.0,
  look2End: 18.0,
  stop: 20.0,
  turn: [20.2, 21.0] as const,
  close: [21.4, 25.0] as const,
  backUp: [25.0, 26.8] as const,
  suitcaseDrop: 25.5,
  wallHit: 26.85,
  sweat: [27.6, 30.9] as const,
  slide: [32.0, SQUEEZE] as const,
  squeeze: SQUEEZE,
  pov: SQUEEZE + 0.3,
  lidsClosed: SQUEEZE + 1.4,
  silence: [36.0, 37.0] as const,
  whoosh: 37.0,
  land: 37.55,
  eyeOpen: 39.1,
  focus: [40.2, 41.8] as const,
  stumble: 40.4,
  stand: [43.0, 44.6] as const,
  lookAround: [44.6, 46.4] as const,
  saviorWalk: [44.4, 48.6] as const,
  flare: 46.8,
  hand: [49.0, 49.9] as const,
  freeze: FREEZE,
  cut: CUT,
  end: END,
};
const B = BEATS;

// ---------------------------------------------------------------------
// Вспомогательное: ходьба по траектории (фаза шага интегрируется по пути)
// ---------------------------------------------------------------------
const stride = (v: number) => 0.95 + 0.45 * clamp(v / 3.2);
const STEP = 1 / 30;
function walker(t: number, pos: (t: number) => [number, number], from: number) {
  const p = pos(t);
  const p2 = pos(t + 0.04);
  const p1 = pos(t - 0.04);
  const v = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.08;
  let phase = 0;
  for (let s = from; s < t; s += STEP) {
    const a = pos(s);
    const b = pos(Math.min(t, s + STEP));
    const dd = Math.hypot(b[0] - a[0], b[1] - a[1]);
    phase += (dd / stride(dd / STEP)) * Math.PI;
  }
  return { x: p[0], z: p[1], v, phase };
}

const blinkAt = (t: number, times: number[]) => Math.max(0, ...times.map((b) => pulse(t, b, b + 0.06, b + 0.1, b + 0.2)));

// ---------------------------------------------------------------------
// ГЕРОЙ
// ---------------------------------------------------------------------
const HERO_WALL_X = STATION.WALL_X - 0.27;
const heroX = (t: number) =>
  track(t, [
    [0, -10.2],
    [4.0, -10.2],
    [4.9, -9.6, inn],
    [11.6, -1.2, linear],
    [12.3, -0.6, out],
    [LOOK1_END, -0.6],
    [LOOK1_END + 0.5, 0.0, inn],
    [17.0, 3.6, linear],
    [18.0, 4.7, linear],
    [18.3, 5.2, inn],
    [19.6, 9.5, linear],
    [20.1, 10.0, out],
    [B.backUp[0], 10.0],
    [B.backUp[1], HERO_WALL_X, inOut],
  ]);
const heroPos = (t: number): [number, number] => [heroX(t), 0];

/** правая рука тянет чемодан */
const TOW_ARM: Limb = { pitch: -0.42, roll: 0.14, bend: 0.06 };

function heroPose(t: number): Pose {
  const w = walker(t, heroPos, 3.9);
  const backing = t > B.backUp[0] - 0.1 && t < B.backUp[1] + 0.2;
  const fast = clamp((w.v - 1.3) / 1.2);
  // разворот в конце платформы — через «лицом к камере» (yaw проходит 0)
  const yaw = lerp(Math.PI / 2, -Math.PI / 2, ramp(t, B.turn[0], B.turn[1]));
  let p: Pose = withPose(STAND, { x: w.x, z: w.z, yaw, lean: 0.03 });
  // дыхание
  p.lean += Math.sin(t * 2.2) * 0.012;
  // ходьба (назад — фаза в обратную сторону)
  const amount = clamp(w.v / 0.9);
  p = walk(p, backing ? -w.phase : w.phase, amount, fast * 0.55);
  if (backing) p.lean -= 0.12 * amount;
  // буксируем чемодан до момента падения
  if (t < B.suitcaseDrop) p.armR = TOW_ARM;
  // ---- оборот через плечо ----
  const look1 = ramp(t, B.look1, B.look1 + 0.5) * (1 - ramp(t, LOOK1_END - 0.4, LOOK1_END));
  const look2 = ramp(t, B.look2, B.look2 + 0.32) * (1 - ramp(t, B.look2End - 0.3, B.look2End));
  const look = Math.max(look1, look2);
  p.headYaw += 1.85 * look;
  p.twist += 0.45 * look;
  p.headPitch -= 0.05 * look;
  // ---- после разворота: страх, руки к груди, голова мечется ----
  const fear = ramp(t, B.turn[1], B.turn[1] + 0.8) * (1 - ramp(t, B.stand[0], B.stand[1]));
  if (fear > 0) {
    p.headYaw += Math.sin(t * 2.6) * 0.32 * fear * (1 - ramp(t, B.wallHit, B.wallHit + 0.5)) + Math.sin(t * 7.3) * 0.04 * fear;
    p.armL = mixLimbs(p.armL, { pitch: 0.75, roll: 0.25, bend: 1.55 }, fear * 0.85);
    if (t > B.suitcaseDrop) p.armR = mixLimbs(p.armR, { pitch: 0.7, roll: 0.25, bend: 1.6 }, fear * 0.85);
    p.lean -= 0.05 * fear;
  }
  // ---- удар о стену: голова дёргается ----
  p.headPitch += shake(t, B.wallHit, 0.6, 0.12, 3);
  p.headRoll += shake(t, B.wallHit, 0.6, 0.08, 5);
  // ---- сползание по стене и сидение ----
  const sit = ramp(t, B.slide[0], B.slide[1], inOut) * (1 - ramp(t, B.stand[0], B.stand[1], inOut));
  if (sit > 0) {
    const SIT: Pose = withPose(p, {
      lean: -0.08,
      lift: -0.335,
      legL: { pitch: 1.3, roll: 0.16, bend: 1.95 },
      legR: { pitch: 1.18, roll: 0.12, bend: 1.7 },
      armL: { pitch: 0.95, roll: 0.3, bend: 1.15 },
      armR: { pitch: 0.9, roll: 0.3, bend: 1.2 },
      headPitch: 0.32,
      headYaw: 0.05,
      twist: 0,
    });
    p = mixPose(p, SIT, sit);
  }
  // ---- встаёт и оглядывается ----
  const around = ramp(t, B.lookAround[0], B.lookAround[0] + 0.3) * (1 - ramp(t, B.lookAround[1] - 0.3, B.lookAround[1]));
  p.headYaw += Math.sin((t - B.lookAround[0]) * 3.4) * 0.85 * around;
  // на Спасителя смотрит снизу вверх
  const upLook = ramp(t, B.lookAround[1], B.lookAround[1] + 0.6);
  p.headPitch -= 0.28 * upLook;
  p.lean -= 0.04 * upLook;
  return p;
}
const mixLimbs = (a: Limb, b: Limb, k: number): Limb => ({
  pitch: lerp(a.pitch, b.pitch, k),
  roll: lerp(a.roll, b.roll, k),
  bend: lerp(a.bend, b.bend, k),
});

function heroEyes(t: number): Eyes {
  const e: Eyes = { ...EYES_DEFAULT };
  e.blink = blinkAt(t, [1.6, 5.4, 8.9, 11.4, 15.6, 19.3, 22.6, 24.4, 29.4, 45.1, 47.6, 50.6]);
  // первый оборот: удивление → настороженность
  e.wide = 0.5 * ramp(t, 12.7, 13.1) + 0.5 * ramp(t, 17.3, 17.6);
  e.lookX = 0.9 * pulse(t, 12.4, 12.7, 14.3, 14.6) + 0.9 * pulse(t, 17.05, 17.25, 17.7, 17.95);
  if (t > B.turn[0]) e.lookX = Math.sin(t * 3.1) * 0.6 * (1 - ramp(t, B.slide[0], B.slide[1]));
  if (t > 27 && t < 31.5) e.lookY = 0.3;
  // зажмуривается — до POV и чёрного
  const sq = ramp(t, B.squeeze, B.squeeze + 0.12);
  if (t < B.stand[0]) e.squeeze = sq;
  // открывает глаза по одному
  if (t >= B.stand[0]) {
    e.squeeze = 0;
    e.openR = ramp(t, B.stand[0], B.stand[0] + 0.4);
    e.openL = ramp(t, B.stand[0] + 0.7, B.stand[0] + 1.1);
    e.lookX = Math.sin((t - B.lookAround[0]) * 3.4) * 0.9 * pulse(t, B.lookAround[0], B.lookAround[0] + 0.3, B.lookAround[1] - 0.3, B.lookAround[1]);
    e.wide = 0.9 * ramp(t, B.lookAround[1], B.lookAround[1] + 0.3) * (1 - ramp(t, 49.4, 50.2) * 0.5);
    e.lookY = 0.6 * ramp(t, B.lookAround[1], B.lookAround[1] + 0.6);
  }
  return e;
}

const heroAt = (t: number): HeroState => {
  const pose = heroPose(t);
  let suitcase: HeroState["suitcase"] = { mode: "towed" };
  if (t >= B.suitcaseDrop) {
    // где был чемодан в момент, когда герой его отпустил
    const p0 = heroPose(B.suitcaseDrop);
    const m = rigMatrices(p0);
    const w = pointOf(m.root, [-0.2, 0, -0.62]);
    suitcase = {
      mode: "fallen",
      pos: [w[0], 0, w[2] + 0.45],
      yaw: p0.yaw + Math.PI / 2,
      fall: clamp(ramp(t, B.suitcaseDrop, B.suitcaseDrop + 0.42, inn) - Math.max(0, Math.sin(clamp((t - B.suitcaseDrop - 0.42) / 0.25) * Math.PI)) * 0.08),
      tilt0: 0.55,
    };
  }
  return { pose, eyes: heroEyes(t), sweat: clamp((t - B.sweat[0]) / (B.sweat[1] - B.sweat[0]), 0, 0.999), suitcase, visible: true };
};

/** Положение руки героя (для чемодана) — в локальных координатах корня */
export const heroHandLocal = (p: Pose): V3 => {
  const m = rigMatrices(withPose(p, { x: 0, z: 0, yaw: 0 }));
  return pointOf(m.handR) as V3;
};

// ---------------------------------------------------------------------
// ТОЛПА
// ---------------------------------------------------------------------
const CROWD_X = [-9.4, -8.6, -7.6, -6.9, -6.0, -5.1, -4.4, -3.6, -2.9, -2.1, -1.4, -0.4];
const CROWD_Z = [2.9, -1.6, 3.2, -1.9, 2.8, 3.3, -1.5, 3.0, -2.0, 3.2, 2.7, -1.7];
const R = rng(42);
const CROWD = CROWD_X.map((x, i) => ({
  x,
  z: CROWD_Z[i],
  scale: 1.07 + R() * 0.1,
  lean: (R() - 0.5) * 0.08,
  tilt: (R() - 0.5) * 0.12,
  arm: R() * 0.15,
}));
// порядок по полукругу — по исходной стороне платформы, чтобы не пересекались
const ARC_ORDER = CROWD.map((c, i) => ({ i, key: c.z * 10 + c.x * 0.1 }))
  .sort((a, b) => a.key - b.key)
  .map((o) => o.i);
const STUMBLER = 6;
const FLEE = B.land + 0.05;

/** Центр полукруга — герой (у стены после того, как попятился) */
const arcCenter = (t: number): [number, number] => [heroX(t), 0];
const arcR = (t: number) => track(t, [[B.close[0], 4.6], [B.close[1], 3.0, inOut], [34, 1.75, inOut]]);

function crowdPos(t: number, i: number): [number, number] {
  const c = CROWD[i];
  // 1) стоят; 2) идут следом (16.4–20.4)
  const followDist = (s: number) => {
    // интеграл скорости 1.05 м/с с плавным стартом/остановкой
    const a = 16.4, b = 20.4, ease = 0.6;
    if (s <= a) return 0;
    const up = Math.min(s, a + ease) - a;
    const V = 1.6;
    let d = V * (up * up) / (2 * ease);
    if (s > a + ease) d += V * (Math.min(s, b) - a - ease);
    if (s > b) d += V * Math.min(ease, s - b) * (1 - Math.min(ease, s - b) / (2 * ease));
    return d;
  };
  let x = c.x + followDist(t);
  let z = lerp(c.z, c.z * 0.55, ramp(t, 16.4, 20.4));
  // 3) смыкаются полукругом
  const k = ramp(t, B.close[0], B.close[0] + 2.4);
  if (k > 0) {
    const n = ARC_ORDER.indexOf(i);
    const a = -1.2 + (2.4 * n) / (CROWD.length - 1);
    const tc = Math.min(t, FLEE);
    const [cx, cz] = arcCenter(tc);
    const r = arcR(tc) + (n % 2) * 0.55; // два ряда
    const ax = cx - r * Math.cos(a) * 1.0;
    const az = cz + r * Math.sin(a) * 1.15;
    x = lerp(x, ax, k);
    z = lerp(z, az, k);
  }
  // 4) убегают
  if (t > FLEE) {
    const tau = Math.max(0, t - FLEE - i * 0.04);
    let run = 4.4 * (tau - 0.35 * (1 - Math.exp(-tau / 0.35)));
    if (i === STUMBLER) run -= 3.2 * ramp(t, B.stumble, B.stumble + 0.9, out) - 0.0;
    x -= run;
    z = lerp(z, z * 0.6, ramp(t, FLEE, FLEE + 1.5));
  }
  return [x, z];
}

function crowdAt(t: number, i: number): CrowdState {
  const c = CROWD[i];
  const [x, z] = crowdPos(t, i);
  const w = walker(t, (s) => crowdPos(s, i), 15.5);
  const [hx] = heroPos(t);
  const toHero = Math.atan2(hx - x, 0 - z);
  // тело: смотрит на поезд → разворачивается к герою → убегает (−X)
  let yaw = Math.PI;
  yaw = angleLerp(yaw, toHero, ramp(t, 15.0, 16.4));
  if (t > 16.4 && t < FLEE) yaw = toHero;
  if (t >= FLEE) yaw = angleLerp(toHero, -Math.PI / 2, ramp(t, FLEE, FLEE + 0.3));
  let p: Pose = withPose(STAND, { x, z, yaw, lean: 0.03 + c.lean, side: c.tilt * 0.3 });
  // синхронное медленное «дыхание» всей толпы
  p.lean += Math.sin(t * 1.4) * 0.01;
  p.armL = { pitch: 0.05 + c.arm, roll: 0.1, bend: 0.12 };
  p.armR = { pitch: 0.05 + c.arm * 0.5, roll: 0.1, bend: 0.12 };
  // головы поворачиваются вслед герою — синхронно и медленно
  const h = ramp(t, B.heads[0], B.heads[1]);
  let rel = toHero - yaw;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const headRel = clamp(rel, -1.7, 1.7);
  p.headYaw = headRel * h;
  p.twist = clamp(rel - headRel, -0.6, 0.6) * h;
  p.headPitch = 0.12 * h + c.tilt * 0.3;
  p.headRoll = c.tilt;
  const running = t > FLEE ? 1 : 0;
  p = walk(p, w.phase, clamp(w.v / 0.8), running);
  // споткнулся
  if (i === STUMBLER) {
    const fall = pulse(t, B.stumble, B.stumble + 0.25, B.stumble + 0.75, B.stumble + 1.25);
    p.lean += 0.95 * fall;
    p.lift -= 0.3 * fall;
    p.armL = mixLimbs(p.armL, { pitch: 1.2, roll: 0.4, bend: 0.2 }, fall);
    p.armR = mixLimbs(p.armR, { pitch: 1.1, roll: 0.4, bend: 0.2 }, fall);
    p.legL = mixLimbs(p.legL, { pitch: -0.5, roll: 0.1, bend: 1.4 }, fall);
  }
  const visible = !(t > FLEE + 1 && x < STATION.startX + 8);
  return { pose: p, scale: c.scale, visible };
}

// ---------------------------------------------------------------------
// СПАСИТЕЛЬ
// ---------------------------------------------------------------------
const SAVIOR_STOP = HERO_WALL_X - 1.45;
const saviorX = (t: number) => track(t, [[B.saviorWalk[0], SAVIOR_STOP - 5.4], [B.saviorWalk[1], SAVIOR_STOP, out]]);
function saviorAt(t: number): SaviorState {
  const x = saviorX(t);
  const w = walker(t, (s) => [saviorX(s), 0.1], B.saviorWalk[0]);
  let p: Pose = withPose(STAND, { x, z: 0.1, yaw: Math.PI / 2, lean: -0.02 });
  p = walk(p, w.phase * 0.85, clamp(w.v / 0.7) * 0.75, 0);
  // уверенно: руки почти не качаются
  p.armL = mixLimbs(p.armL, { pitch: 0.05, roll: 0.12, bend: 0.15 }, 0.6);
  p.armR = mixLimbs(p.armR, { pitch: 0.05, roll: 0.12, bend: 0.15 }, 0.6);
  // протягивает руку
  const hand = ramp(t, B.hand[0], B.hand[1], inOut);
  p.armR = mixLimbs(p.armR, { pitch: 1.18, roll: 0.02, bend: 0.12 }, hand);
  p.headPitch = 0.18 * ramp(t, 48.0, 48.8);
  p.lean += 0.06 * hand;
  const glow = 2.4 + 7 * pulse(t, B.flare, B.flare + 0.12, B.flare + 0.3, B.flare + 1.4) + 1.2 * ramp(t, B.flare, B.flare + 1);
  const wind = 0.75 + 0.35 * pulse(t, B.flare - 0.2, B.flare, B.flare + 0.6, B.flare + 2);
  return { pose: p, glow, wind, visible: t >= B.saviorWalk[0] - 0.05 };
}

// ---------------------------------------------------------------------
// КАМЕРА
// ---------------------------------------------------------------------
const headOf = (p: Pose, scale = 1): V3 => pointOf(rigMatrices(p, scale).head) as V3;
const handOf = (p: Pose, scale = 1): V3 => pointOf(rigMatrices(p, scale).handR) as V3;

type Shot = { from: number; to: number; cam: (t: number) => CameraState; blend?: number };

function shots(vertical: boolean): Shot[] {
  const V = vertical;
  const ots = (t: number): CameraState => {
    const h = headOf(heroPose(t));
    // камера за затылком героя: голова — в нижнем углу, толпа — в глубине
    return V
      ? { pos: [h[0] + 1.35, h[1] + 0.3, -0.2], target: [h[0] - 8, 1.1, 0.35], fov: 50 }
      : { pos: [h[0] + 0.75, h[1] + 0.12, -0.42], target: [h[0] - 8, 1.2, 0.8], fov: 40 };
  };
  return [
    // 1. камера опускается сквозь туман
    {
      from: 0,
      to: 4.0,
      cam: (t) => ({
        pos: track3(t, [[0, [-16.0, 9.0, 2.6]], [4.0, [-12.9, 1.45, 2.2], inOut]]),
        target: track3(t, [[0, [-10.6, 0.6, -0.4]], [4.0, [-10.2, 0.95, 0], inOut]]),
        fov: V ? 48 : 40,
      }),
    },
    // 2. едем рядом сбоку
    {
      from: 4.0,
      to: 8.6,
      blend: 0.6,
      cam: (t) => {
        const hx = heroX(t);
        return { pos: [hx + 0.6, 1.15, 2.25], target: [hx + 0.3, 0.92, 0], fov: V ? 56 : 46 };
      },
    },
    // камера впереди, герой идёт на нас, головы толпы — за ним
    {
      from: 8.6,
      to: B.look1,
      blend: 0.9,
      cam: (t) => {
        const hx = heroX(t);
        return { pos: [hx + 3.6, 1.35, 2.3], target: [hx - 0.6, 1.05, 0.3], fov: V ? 50 : 40 };
      },
    },
    // 3. через плечо: все смотрят на него
    { from: B.look1, to: B.look1End, blend: 0.35, cam: ots },
    {
      from: B.look1End,
      to: B.look2,
      blend: 0.5,
      cam: (t) => {
        const hx = heroX(t);
        return { pos: [hx + 3.4, 1.3, 1.6], target: [hx, 1.0, 0.1], fov: V ? 50 : 40 };
      },
    },
    { from: B.look2, to: B.look2End, blend: 0.25, cam: ots },
    {
      from: B.look2End,
      to: B.stop,
      blend: 0.4,
      cam: (t) => {
        const hx = heroX(t);
        return { pos: [hx + 1.1, 0.75, 3.2], target: [hx + 0.4, 1.0, 0], fov: V ? 50 : 40, roll: 0.05 };
      },
    },
    // 4. конец платформы, толпа смыкается
    {
      from: B.stop,
      to: 22.6,
      blend: 0.5,
      cam: (t) => ({
        pos: track3(t, [[B.stop, [12.0, 2.3, 2.1]], [22.6, [12.05, 2.45, 1.9]]]),
        target: [7.6, 1.0, -0.1],
        fov: V ? 52 : 44,
      }),
    },
    {
      from: 22.6,
      to: B.backUp[0],
      blend: 0.6,
      cam: (t) => ({
        // из-за спин толпы: полукруг смыкается вокруг героя
        pos: track3(t, [[22.6, [4.6, 1.15, 1.2]], [B.backUp[0], [5.6, 1.1, 0.9]]]),
        target: [10.2, 1.05, 0],
        fov: V ? 50 : 40,
      }),
    },
    // 5. пятится к стене
    {
      from: B.backUp[0],
      to: 27.2,
      blend: 0.4,
      cam: (t) => {
        const sx = shake(t, B.wallHit, 0.7, 0.07, 1);
        const sy = shake(t, B.wallHit, 0.7, 0.05, 2);
        return { pos: [10.0 + sx, 1.2 + sy, 3.5], target: [11.2, 0.95, 0], fov: V ? 52 : 42 };
      },
    },
    // крупный план: капля пота по лбу
    {
      from: 27.2,
      to: 31.6,
      blend: 0.4,
      cam: (t) => {
        const h = headOf(heroPose(t));
        const push = ramp(t, 27.2, 31.6, inOut);
        return {
          pos: [h[0] - 0.95 + push * 0.25, h[1] + 0.03, h[2] + 0.3 - push * 0.08],
          target: [h[0], h[1] + 0.02, h[2]],
          fov: V ? 40 : 32,
        };
      },
    },
    // 6. сползает по стене
    {
      from: 31.6,
      to: B.pov,
      blend: 0.5,
      cam: (t) => ({
        pos: track3(t, [[31.6, [10.55, 1.1, 1.15]], [B.pov, [10.75, 0.8, 0.95]]]),
        target: track3(t, [[31.6, [11.9, 0.9, 0]], [B.pov, [12.0, 0.5, 0]]]),
        fov: V ? 56 : 44,
      }),
    },
    // POV: смотрит на толпу, глаза закрываются
    {
      from: B.pov,
      to: B.eyeOpen + 0.01,
      cam: () => ({ pos: [HERO_WALL_X - 0.25, 0.7, 0.03], target: [8.0, 1.35, 0.1], fov: V ? 56 : 46 }),
    },
    // 8. POV: один глаз открывается, платформа пуста
    {
      from: B.eyeOpen,
      to: B.stand[0],
      cam: (t) => ({
        pos: [HERO_WALL_X - 0.25, 0.7 + Math.sin(t * 1.3) * 0.01, 0.03],
        target: [2.0, 1.0 + Math.sin(t * 0.9) * 0.05, 0.25 + Math.sin(t * 0.7) * 0.15],
        fov: V ? 56 : 46,
        roll: 0.06 * (1 - ramp(t, B.eyeOpen, B.focus[1])),
      }),
    },
    // 9. встаёт, оглядывается
    {
      from: B.stand[0],
      to: 45.0,
      cam: () => ({ pos: [9.5, 1.15, 2.7], target: [11.9, 0.85, 0], fov: V ? 50 : 40 }),
    },
    // нижний ракурс: из тумана выходит Спаситель
    {
      from: 45.0,
      to: B.hand[0],
      blend: 0.3,
      cam: (t) => {
        const sx = saviorX(t);
        const push = ramp(t, 45.0, B.hand[0], inOut);
        // нижний ракурс сбоку: фигура целиком, плащ, контровой свет
        return {
          pos: [lerp(12.1, 11.8, push), 0.3, lerp(3.4, 3.0, push)],
          target: [sx - 0.2, 1.5, 0.1],
          fov: V ? 60 : 46,
        };
      },
    },
    // 10. протягивает руку
    {
      from: B.hand[0],
      to: 50.2,
      blend: 0.4,
      cam: () => ({ pos: [11.15, 1.3, 3.5], target: [11.15, 1.1, 0], fov: V ? 62 : 44 }),
    },
    {
      from: 50.2,
      to: B.end,
      blend: 0.5,
      cam: (t) => {
        const ts = Math.min(t, B.freeze);
        const hand = handOf(saviorAt(ts).pose, SAVIOR_SCALE);
        const head = headOf(heroPose(ts));
        void head;
        // сбоку: рука входит в кадр, за ней размыто светится «Д»
        const push = ramp(t, 50.2, B.cut, inOut);
        const pos: V3 = [hand[0] + 0.4, hand[1] + 0.08, hand[2] + lerp(1.35, 1.1, push)];
        return { pos, target: [hand[0] - 0.12, hand[1] + 0.02, hand[2]], fov: V ? 46 : 36 };
      },
    },
  ];
}

function camera(t: number, vertical: boolean): CameraState {
  const list = shots(vertical);
  const i = Math.max(0, list.findIndex((s) => t >= s.from && t < s.to));
  const cur = list[i];
  const c = cur.cam(t);
  // мягкая склейка с предыдущим планом (если задан blend)
  if (cur.blend && i > 0 && t < cur.from + cur.blend) {
    const prev = list[i - 1].cam(t);
    const k = inOut(clamp((t - cur.from) / cur.blend));
    return { pos: lerp3(prev.pos, c.pos, k), target: lerp3(prev.target, c.target, k), fov: lerp(prev.fov, c.fov, k), roll: lerp(prev.roll ?? 0, c.roll ?? 0, k) };
  }
  return c;
}

// ---------------------------------------------------------------------
// ЭФФЕКТЫ
// ---------------------------------------------------------------------
function fx(t: number): FxState {
  const closeLids = ramp(t, B.pov + 0.15, B.lidsClosed, inOut);
  const halfOpen = ramp(t, B.eyeOpen, B.eyeOpen + 0.9, out) * 0.36;
  const fullOpen = ramp(t, B.focus[1] - 0.4, B.focus[1] + 0.5, inOut);
  let open = 1 - closeLids;
  if (t >= B.eyeOpen - 0.01) open = lerp(halfOpen, 1, fullOpen);
  if (t >= B.stand[0]) open = 1;
  const glow = pulse(t, B.land, B.land + 0.08, B.land + 0.35, B.land + 1.2) * (t < B.eyeOpen ? 1 : 0);
  const sx = saviorX(Math.min(t, B.freeze));
  const closeup = t > 27.2 && t < 31.6;
  const handCU = t > 50.2;
  const pov = t >= B.eyeOpen && t < B.stand[0];
  const blurPov = 1 - ramp(t, B.focus[0], B.focus[1], inOut);
  let dof: FxState["post"]["dof"];
  if (closeup) dof = { target: headOf(heroPose(t)), bokeh: 2.2, focalLength: 0.02 };
  if (pov) dof = { target: [4, 1, 0], bokeh: 0.8 + blurPov * 9, focalLength: 0.01 + blurPov * 0.08 };
  if (handCU) dof = { target: handOf(saviorAt(Math.min(t, B.freeze)).pose, SAVIOR_SCALE), bokeh: 2.6, focalLength: 0.02 };
  return {
    post: {
      bloom: 0.9 + 0.9 * pulse(t, B.flare, B.flare + 0.1, B.flare + 0.4, B.flare + 1.4),
      dof,
      vignette: 0.55 + 0.25 * ramp(t, 20, 26) * (1 - ramp(t, 43, 45)),
      desat: ramp(t, B.freeze, B.freeze + 0.6, inOut),
    },
    eyelids: { open, tilt: pov ? 0.9 * (1 - fullOpen) : 0, glow },
    black: (t >= B.lidsClosed - 0.05 && t < B.eyeOpen ? 1 : 0) * (1 - glow) + (t >= B.cut ? 1 : 0),
    grain: 0.07,
    card: t >= B.cut,
    sparks: t > B.land ? 1 - ramp(t, 44.5, 46) : 0,
    sparksT: t - B.land,
    shadowLamp: { x: 9.6, target: [12.2, 0.6, 0] },
    lampWarmth: 1,
    rimLight: t > 43 ? { pos: [sx - 2.6, 3.2, -1.4], target: [sx, 1.6, 0.1], intensity: 90 } : undefined,
  };
}

// ---------------------------------------------------------------------
// ЗВУК (голос всегда громче эффектов)
// ---------------------------------------------------------------------
const audio: AudioCue[] = [
  { file: "audio/sfx/station_ambience.mp3", at: 0, dur: B.silence[0], loop: true, volume: 0.3, fadeIn: 1.5, fadeOut: 0.8 },
  { file: "audio/sfx/station_ambience.mp3", at: B.silence[1] + 1.2, dur: B.cut - B.silence[1] - 1.2, loop: true, volume: 0.18, fadeIn: 2, fadeOut: 0.2 },
  { file: "audio/sfx/announcement.mp3", at: 1.2, volume: 0.22 },
  { file: "audio/sfx/suitcase_wheels.mp3", at: 4.7, dur: 12.2 - 4.7, loop: true, volume: 0.3, fadeIn: 0.3, fadeOut: 0.4 },
  { file: "audio/sfx/suitcase_wheels.mp3", at: LOOK1_END + 0.1, dur: 20.1 - LOOK1_END - 0.1, loop: true, volume: 0.36, fadeIn: 0.2, fadeOut: 0.3 },
  { file: "audio/sfx/crowd_steps.mp3", at: 16.4, dur: 4.2, loop: true, volume: 0.32, fadeIn: 0.6, fadeOut: 0.5 },
  { file: "audio/sfx/crowd_steps.mp3", at: B.close[0], dur: B.close[1] - B.close[0], loop: true, volume: 0.26, fadeIn: 0.5, fadeOut: 0.8 },
  { file: "audio/sfx/drone.mp3", at: 12.0, dur: B.lidsClosed - 12.0 + 0.6, volume: 0.45, fadeIn: 4, fadeOut: 0.6 },
  { file: "audio/sfx/heartbeat.mp3", at: 26.0, dur: Math.min(8, B.lidsClosed - 26 + 0.4), volume: 0.55, fadeIn: 0.5, fadeOut: 0.5 },
  { file: "audio/sfx/suitcase_fall.mp3", at: B.suitcaseDrop + 0.35, volume: 0.5 },
  { file: "audio/sfx/wall_hit.mp3", at: B.wallHit - 0.05, volume: 0.6 },
  { file: "audio/sfx/air_whoosh.mp3", at: B.whoosh, volume: 0.65 },
  { file: "audio/sfx/heavy_landing.mp3", at: B.land - 0.05, volume: 0.75 },
  { file: "audio/sfx/cloak_flap.mp3", at: B.land + 0.3, volume: 0.55 },
  { file: "audio/sfx/running_away.mp3", at: B.eyeOpen + 0.1, volume: 0.4 },
  { file: "audio/sfx/mystic_glow.mp3", at: B.flare - 0.2, volume: 0.45 },
  { file: "audio/sfx/cloak_flap.mp3", at: B.flare + 0.1, volume: 0.3 },
  // голоса
  { file: "audio/hero_01.mp3", at: HERO01_AT, volume: 1 },
  { file: "audio/hero_02.mp3", at: HERO02_AT, volume: 1 },
  { file: "audio/savior_01.mp3", at: SAVIOR01_AT, volume: 1 },
  { file: "audio/narrator_01.mp3", at: NARRATOR_AT, volume: 1 },
];

export const EP1: Episode = {
  id: "ep1",
  title: "Серия 1",
  subtitle: "Продолжение следует…",
  duration: B.end,
  storyTime: (t) => Math.min(t, B.freeze),
  hero: heroAt,
  crowd: { count: CROWD.length, at: crowdAt },
  savior: saviorAt,
  camera,
  fx: (t) => fx(t),
  fogCards: [
    { x: -15, y: 7.0, z: 7.5, s: 7, o: 0.5 },
    { x: -14, y: 5.0, z: 6.5, s: 6, o: 0.45 },
    { x: -13, y: 3.3, z: 5.6, s: 5, o: 0.4 },
    { x: -11, y: 1.2, z: 2.6, s: 4, o: 0.22 },
    { x: 1.5, y: 1.2, z: 0.2, s: 4.5, o: 0.3 },
    { x: 4.2, y: 1.0, z: -0.4, s: 4, o: 0.35 },
    { x: 6.0, y: 0.8, z: 0.8, s: 3.5, o: 0.25 },
    { x: -3, y: 1.4, z: 1.2, s: 5, o: 0.2 },
  ],
  cardBeats: { logo: B.cut + 0.3, title: NARRATOR_AT - 0.1, subtitle: NARRATOR_AT + narratorSecondWord - 0.1 },
  audio,
};
