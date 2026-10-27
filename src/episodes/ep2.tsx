/**
 * «Доеду. Серия 2: Гибридный маршрут» — сценарий. Прямое продолжение серии 1:
 * функции время (сек) → состояние героя, «толпы» (во флешбэке), Спасителя, камеры, эффектов,
 * реквизита и звука. Тайминг подстраивается под реальную длину реплик (ep2.audio-timing.json).
 */
import React from "react";
import * as THREE from "three";
import timingJson from "./ep2.audio-timing.json";
import { AudioCue } from "../audio/Soundtrack";
import { CameraState } from "../camera/CameraRig";
import { SAVIOR_SCALE } from "../characters/Characters";
import { DIMS, Limb, mixPose, pointOf, Pose, rigMatrices, STAND, tremble, walk, withPose } from "../characters/rig";
import { EYES_DEFAULT, Eyes } from "../characters/Stickman3D";
import { SuitcaseBody } from "../characters/Suitcase";
import { angleLerp, clamp, inn, inOut, lerp, lerp3, linear, out, outBack, pulse, ramp, rng, shake, track, track3, V3 } from "../lib/anim";
import { Film, Flash } from "../overlays/Film";
import { Dust, GlowDoor, Rope, sagRope, Sign, SignIcon } from "../props/Flashback";
import { Phone } from "../props/Phone";
import { RouteUIState } from "../props/RouteUI";
import { Pin3D, RoutePath } from "../props/RoutePath";
import { Wrapper } from "../props/Wrapper";
import { EP1 } from "./ep1";
import { blinkAt, headOf, mixLimbs, Shot, shotCamera, walker } from "./helpers";
import { CrowdState, Episode, FxState, HeroState, SaviorState } from "./types";

// ---------------------------------------------------------------------
// Реплики: длительность и время слов (ElevenLabs alignment)
// ---------------------------------------------------------------------
type Timing = { duration: number; words: { word: string; start: number; end: number }[] };
const VO = timingJson as Record<string, Timing>;
const dur = (id: string) => VO[id]?.duration ?? 1.5;
/** начало n-го вхождения слова в реплике (сек от начала реплики) */
const word = (id: string, w: string, n = 0, fallback = 0) => VO[id]?.words.filter((x) => x.word.toLowerCase() === w.toLowerCase())[n]?.start ?? fallback;

// ---------------------------------------------------------------------
// Ключевые моменты (секунды)
// ---------------------------------------------------------------------
const H01 = 10.2; // «Кто… кто вы?»
const CLOAK = H01 + dur("hero_01") + 0.9; // плащ распахивается
const S01 = CLOAK + 1.3; // «Я — Доеду…»
const S01_ASSIST = S01 + word("savior_01", "голосовой", 0, 2.5);
const S01_DO2 = S01 + word("savior_01", "До", 1, 5.5);
const S01_EDU = S01 + word("savior_01", "Еду", 0, 6.7);
const S01_END = S01 + dur("savior_01");
const BLINK2 = S01_END + 0.45; // двойное моргание
const WRAP_STICK = BLINK2 + 1.3; // обёртка прилипает к ноге
const SHAKE = WRAP_STICK + 0.85; // стряхивает, не глядя
const H02 = SHAKE + 1.1; // «А те люди?..»
const H02_EAT = H02 + word("hero_02", "съесть", 0, 4.3);
const FB_IN = H02 + dur("hero_02") + 0.25; // флешбэк
const S02 = FB_IN + 0.6; // «Хуже. Они — …»
const AVIA = S02 + word("savior_02", "Авиа", 0, 2.6) - 0.3;
const ZHD = S02 + word("savior_02", "Жэ", 0, 3.7) - 0.3;
const POP = S02 + word("savior_02", "Попутка", 0, 5.2) - 0.3;
const CHAOS = S02 + word("savior_02", "Каждый", 0, 6.2);
const SNAP = S02 + word("savior_02", "приложения", 0, 13.4) + 0.12; // верёвки лопаются
const CRUMBLE = SNAP + 0.45; // флешбэк рассыпается
const FB_OUT = SNAP + 1.35; // снова платформа
const H03 = FB_OUT + 0.6; // «И что теперь?»
const PHONE = H03 + dur("hero_03") + 0.15; // рука в карман плаща
const S03 = PHONE + 2.2; // «Теперь ты поедешь…»
const sw = (w: string, fb: number) => S03 + word("savior_03", w, 0, fb);
const UI_ON = S03 - 0.35;
const GATHER = sw("Гибридный", 2.0) - 0.35;
const MERGE = sw("маршрут", 2.9) - 0.15;
const SEG = [sw("поезд", 4.0) - 0.1, sw("автобус", 5.4) - 0.1, sw("пешком", 6.8) - 0.1];
const ALL = sw("Всё", 8.3) - 0.1;
const NOTR = sw("Без", 9.7) - 0.1;
const S03_END = S03 + dur("savior_03");
const EXIT = S03_END + 0.15; // линия выходит за пределы экрана
const PATH = EXIT + 0.45; // и ложится на пол
const PATH_DUR = 2.9;
const JOY = PATH + 1.7; // глаза радостно расширяются
const H04 = JOY + 1.7; // «А если я… опоздаю?»
const CLOSE = H04 + dur("hero_04") + 0.05; // запахивает плащ
const S04 = H04 + dur("hero_04") + 0.45; // «Тогда я приду снова…»
const VANISH = S04 + dur("savior_04") + 0.5; // исчез в порыве ветра
const PICK = VANISH + 0.35; // герой берёт чемодан
const WALK = PICK + 0.85; // и шагает по алой дорожке
const CARD = WALK + 3.7;
const NARR = CARD + 0.7;
const END = NARR + dur("narrator_01") + 2.1;

export const BEATS2 = { H01, CLOAK, S01, S01_DO2, S01_EDU, BLINK2, WRAP_STICK, SHAKE, H02, FB_IN, S02, AVIA, ZHD, POP, CHAOS, SNAP, FB_OUT, H03, PHONE, S03, GATHER, MERGE, SEG, ALL, NOTR, EXIT, PATH, JOY, H04, CLOSE, S04, VANISH, PICK, WALK, CARD, NARR, END };

const LIFT: [number, number] = [1.45, 2.35];

// ---------------------------------------------------------------------
// Расстановка (продолжение финального кадра серии 1)
// ---------------------------------------------------------------------
const EP1_END = EP1.hero(EP1.storyTime(EP1.duration));
const EP1_SAV = EP1.savior(EP1.storyTime(EP1.duration));
const SUITCASE = EP1_END.suitcase.mode === "fallen" ? EP1_END.suitcase : { mode: "fallen" as const, pos: [10.8, 0, 0.25] as V3, yaw: 0, fall: 1, tilt0: 0.55 };
const HERO_WALL: [number, number] = [EP1_END.pose.x, EP1_END.pose.z]; // 12.13, 0
const HERO_STAND: [number, number] = [11.55, 0.0];
const SAV0: [number, number] = [EP1_SAV.pose.x, EP1_SAV.pose.z]; // 10.68, 0.1
const SAV_BACK: [number, number] = [10.5, 0.05];
const SAV_SIDE: [number, number] = [10.3, -0.8]; // отходит чуть в сторону — так у героя открыт вид на платформу
const SAV_FOG: [number, number] = [7.0, -1.25]; // уходит в туман
const yawTo = (from: [number, number], to: [number, number]) => Math.atan2(to[0] - from[0], to[1] - from[1]);

const isFlashback = (t: number) => t >= FB_IN + 0.15 && t < FB_OUT;

// ---------------------------------------------------------------------
// Путь алой линии на полу
// ---------------------------------------------------------------------
const PHONE_SCALE = 1.6;
const FLOOR_Y = 0.026;

// ---------------------------------------------------------------------
// СПАСИТЕЛЬ
// ---------------------------------------------------------------------
const saviorXZ = (t: number): [number, number] => {
  const x = track(t, [
    [0, SAV0[0]],
    [LIFT[0], SAV0[0]],
    [LIFT[1] + 0.2, SAV_BACK[0], inOut],
    [4.4, SAV_BACK[0]],
    [6.0, SAV_SIDE[0], inOut],
    [S04 + 0.3, SAV_SIDE[0]],
    [S04 + dur("savior_04") + 0.3, SAV_FOG[0], inOut],
  ]);
  const z = track(t, [
    [0, SAV0[1]],
    [LIFT[0], SAV0[1]],
    [LIFT[1] + 0.2, SAV_BACK[1], inOut],
    [4.4, SAV_BACK[1]],
    [6.0, SAV_SIDE[1], inOut],
    [S04 + 0.3, SAV_SIDE[1]],
    [S04 + dur("savior_04") + 0.3, SAV_FOG[1], inOut],
  ]);
  return [x, z];
};

const HAND_OUT: Limb = { pitch: 1.18, roll: 0.02, bend: 0.12 };

function saviorPose(t: number): Pose {
  const [x, z] = saviorXZ(t);
  // шагает только в начале (отходит в сторону) и в конце (уходит в туман)
  const w = walker(t, saviorXZ, t > S04 ? S04 : t > 6.5 ? t : 0);
  const hp = heroXZ(t);
  const face = yawTo([x, z], hp);
  let p: Pose = withPose(STAND, { x, z, yaw: lerp(Math.PI / 2, face, ramp(t, 3.0, 4.6)), lean: -0.02 });
  if (t > 4.6) p.yaw = face;
  // идёт спиной вперёд в туман — фаза шага в обратную сторону
  const backing = t > S04;
  p = walk(p, (backing ? -1 : 1) * w.phase * 0.85, clamp(w.v / 0.7) * 0.75, 0);
  p.armL = mixLimbs(p.armL, { pitch: 0.05, roll: 0.12, bend: 0.15 }, 0.6);
  p.armR = mixLimbs(p.armR, { pitch: 0.05, roll: 0.12, bend: 0.15 }, 0.6);
  p.headPitch = 0.16;
  // 1) рука протянута (финал серии 1) → рывок вверх (поднимает героя) → отпускает
  const hold = 1 - ramp(t, LIFT[1] + 0.25, LIFT[1] + 0.9);
  const pull = ramp(t, LIFT[0], LIFT[1], inOut);
  if (hold > 0) {
    const arm = mixLimbs(HAND_OUT, { pitch: 0.75, roll: 0.05, bend: 1.15 }, pull);
    p.armR = mixLimbs(p.armR, arm, hold);
    p.lean += (0.06 - 0.12 * pulse(t, LIFT[0], LIFT[0] + 0.3, LIFT[1] - 0.2, LIFT[1] + 0.3)) * hold;
  }
  // 2) распахивает плащ: руки в стороны → «руки в боки»
  const burst = pulse(t, CLOAK - 0.12, CLOAK + 0.1, CLOAK + 0.9, CLOAK + 1.5, out);
  const akimbo = ramp(t, CLOAK + 0.9, CLOAK + 1.5) * (1 - ramp(t, PHONE - 0.2, PHONE + 0.2));
  const akimbo2 = ramp(t, S03_END + 0.4, S03_END + 1.0) * (1 - ramp(t, CLOSE - 0.3, CLOSE));
  const ak = Math.max(akimbo, akimbo2);
  const ARMS_OUT_L: Limb = { pitch: 0.35, roll: 1.25, bend: 0.25 };
  const AKIMBO: Limb = { pitch: -0.25, roll: 0.42, bend: 1.75 };
  p.armL = mixLimbs(mixLimbs(p.armL, ARMS_OUT_L, burst), AKIMBO, ak);
  if (t > LIFT[1] + 0.9) p.armR = mixLimbs(mixLimbs(p.armR, ARMS_OUT_L, burst), AKIMBO, ak);
  p.lean -= 0.1 * burst;
  p.headPitch -= 0.12 * burst;
  // 3) «До… Еду»: чуть наклоняет голову в паузе
  const tilt = pulse(t, S01_DO2 + 0.08, S01_DO2 + 0.45, S01_EDU + 0.15, S01_EDU + 0.6);
  p.headRoll += 0.3 * tilt;
  p.headYaw += 0.12 * tilt;
  p.headPitch += 0.08 * tilt;
  // 4) достаёт смартфон из кармана плаща и разворачивает к герою
  if (t > PHONE - 0.2 && t < CLOSE + 0.4) {
    const reach = ramp(t, PHONE, PHONE + 0.55, inOut);
    const extend = ramp(t, PHONE + 0.85, PHONE + 1.6, inOut);
    const away = ramp(t, S03_END + 0.25, S03_END + 0.9, inOut);
    const POCKET: Limb = { pitch: 0.55, roll: -0.35, bend: 2.05 };
    const SHOW: Limb = { pitch: 1.05, roll: -0.12, bend: 0.62 };
    let arm = mixLimbs(p.armR, POCKET, reach * (1 - extend));
    arm = mixLimbs(arm, SHOW, extend);
    p.armR = mixLimbs(arm, p.armR, away);
    p.headPitch += 0.08 * extend * (1 - away);
  }
  // 5) запахивает плащ: руки к груди
  const wrap = pulse(t, CLOSE - 0.1, CLOSE + 0.25, CLOSE + 0.6, CLOSE + 1.1);
  p.armL = mixLimbs(p.armL, { pitch: 0.7, roll: -0.25, bend: 1.7 }, wrap);
  p.armR = mixLimbs(p.armR, { pitch: 0.7, roll: -0.25, bend: 1.7 }, wrap);
  return p;
}

function saviorAt(t: number): SaviorState {
  const visible = !isFlashback(t) && t < VANISH + 0.3;
  const open = t < CLOAK - 0.1 ? 0 : t < CLOSE ? 0.9 + 0.25 * pulse(t, CLOAK - 0.1, CLOAK + 0.12, CLOAK + 0.3, CLOAK + 1.0, out) : 0.9 * (1 - ramp(t, CLOSE, CLOSE + 0.55, inOut));
  const flare = pulse(t, CLOAK + 0.05, CLOAK + 0.2, CLOAK + 0.5, CLOAK + 1.8);
  const glow =
    2.4 +
    4.5 * flare +
    1.6 * ramp(t, CLOAK, CLOAK + 1) +
    4 * pulse(t, S04 + word("savior_04", "Дэ", 0, 3) - 0.1, S04 + word("savior_04", "Дэ", 0, 3) + 0.1, VANISH - 0.4, VANISH) +
    6 * pulse(t, VANISH - 0.15, VANISH, VANISH + 0.1, VANISH + 0.3);
  const wind =
    0.8 +
    1.1 * pulse(t, CLOAK - 0.15, CLOAK + 0.05, CLOAK + 0.7, CLOAK + 2.2) +
    0.5 * pulse(t, CLOSE - 0.1, CLOSE + 0.2, CLOSE + 0.6, CLOSE + 1.2) +
    1.4 * ramp(t, VANISH - 0.35, VANISH);
  return {
    pose: saviorPose(t),
    glow,
    wind,
    visible,
    open,
    emblem: ramp(t, CLOAK + 0.35, CLOAK + 1.1),
    vanish: ramp(t, VANISH, VANISH + 0.22, inn),
  };
}

// ---------------------------------------------------------------------
// ГЕРОЙ
// ---------------------------------------------------------------------
/** конец пути героя по алой дорожке */
const heroWalkX = (t: number) => track(t, [[WALK, 11.05], [CARD + 0.5, 6.9, linear]]);

function heroXZ(t: number): [number, number] {
  if (t < PICK - 0.6) {
    const k = ramp(t, LIFT[0] + 0.15, LIFT[1] + 0.25, inOut);
    return [lerp(HERO_WALL[0], HERO_STAND[0], k), lerp(HERO_WALL[1], HERO_STAND[1], k)];
  }
  if (t < WALK) {
    // два шага к чемодану
    const k = ramp(t, PICK - 0.6, PICK, inOut);
    return [lerp(HERO_STAND[0], 11.05, k), lerp(HERO_STAND[1], 0.12, k)];
  }
  return [heroWalkX(t), lerp(0.12, 0.25, ramp(t, WALK, WALK + 1.5))];
}

/** сколько трясёт героя */
const trembleAmt = (t: number) =>
  ramp(t, 1.9, 2.6) *
  lerp(1, 0.55, ramp(t, CLOAK + 1, S01_END)) *
  lerp(1, 0.6, ramp(t, FB_OUT, FB_OUT + 1)) *
  (1 - ramp(t, PATH + 0.8, JOY));

const CROUCH = (p: Pose): Pose =>
  withPose(p, {
    lean: 0.32,
    legL: { pitch: 1.25, roll: 0.22, bend: 2.25 },
    legR: { pitch: 1.12, roll: 0.18, bend: 2.15 },
    armL: { pitch: 0.85, roll: 0.3, bend: 1.4 },
    armR: { pitch: 0.95, roll: 0.3, bend: 1.5 },
    headPitch: 0.22,
  });

const TOW_ARM: Limb = { pitch: -0.42, roll: 0.14, bend: 0.06 };

function heroPresent(t: number): Pose {
  const [x, z] = heroXZ(t);
  const sv = saviorXZ(t);
  let yaw = angleLerp(-Math.PI / 2, yawTo([x, z], sv), ramp(t, 3.0, 6.0));
  if (t >= WALK - 0.6) yaw = angleLerp(yawTo([x, z], sv), -Math.PI / 2 - 0.05, ramp(t, WALK - 0.6, WALK + 0.1));
  let p: Pose = withPose(STAND, { x, z, yaw, lean: 0.03 });
  p.lean += Math.sin(t * 2.2) * 0.012;
  // --- 1. сидит на корточках у стены → хватается за руку → поднят одним движением
  const up = ramp(t, LIFT[0], LIFT[1], inOut);
  p = mixPose(CROUCH(p), p, up);
  p.lift += Math.sin(up * Math.PI) * 0.09;
  p.lean += 0.12 * Math.sin(up * Math.PI);
  const grab = ramp(t, 0.45, 0.95, out) * (1 - ramp(t, LIFT[1] + 0.25, LIFT[1] + 0.85));
  p.armL = mixLimbs(p.armL, { pitch: lerp(1.55, 1.15, up), roll: -0.05, bend: 0.12 }, grab);
  // --- 2. нервно оглядывается
  const look = pulse(t, 4.5, 4.8, 6.0, 6.3);
  p.headYaw += (Math.sin((t - 4.5) * 4.2) * 0.75 + 0.15) * look;
  p.twist += Math.sin((t - 4.5) * 4.2) * 0.2 * look;
  // POV: смотрит на пустую платформу (вправо)
  const pov = pulse(t, 6.2, 6.45, 8.5, 8.8);
  p.headYaw -= 0.9 * pov;
  p.twist -= 0.2 * pov;
  // обёртка между ними — смотрит вниз
  p.headPitch += 0.32 * pulse(t, 8.7, 9.0, 9.6, 10.0);
  // руки прижаты к груди от страха
  const fear = ramp(t, 2.6, 3.2) * (1 - ramp(t, CLOAK + 1.4, CLOAK + 2.4)) + 0.6 * pulse(t, H02, H02 + 0.4, FB_IN, FB_IN + 0.2);
  p.armL = mixLimbs(p.armL, { pitch: 0.75, roll: 0.25, bend: 1.55 }, clamp(fear) * 0.85);
  p.armR = mixLimbs(p.armR, { pitch: 0.7, roll: 0.25, bend: 1.6 }, clamp(fear) * 0.85);
  // на распахнутый плащ — отшатнулся, смотрит вверх
  const recoil = pulse(t, CLOAK, CLOAK + 0.15, CLOAK + 0.8, CLOAK + 1.6);
  p.lean -= 0.18 * recoil;
  p.headPitch -= 0.3 * ramp(t, CLOAK, CLOAK + 0.3) * (1 - ramp(t, S01_END, S01_END + 0.6));
  // --- 5. стряхивает обёртку с ноги, не глядя
  const kick = pulse(t, SHAKE, SHAKE + 0.08, SHAKE + 0.45, SHAKE + 0.6);
  p.legL = mixLimbs(p.legL, { pitch: 0.15 + 0.45 * Math.sin((t - SHAKE) * 26), roll: 0.12, bend: 0.5 }, kick);
  // --- 8–9. смотрит на телефон, недоверчиво, потом тянется
  const phoneLook = ramp(t, PHONE + 1.2, PHONE + 1.8) * (1 - ramp(t, S03_END, S03_END + 0.6));
  p.headPitch += 0.18 * phoneLook;
  p.lean += 0.06 * phoneLook * ramp(t, MERGE, MERGE + 1);
  // смотрит на дорожку, уходящую в туман
  const down = ramp(t, PATH, PATH + 0.6) * (1 - ramp(t, JOY + 1.0, JOY + 1.6));
  p.headYaw += 0.6 * down * ramp(t, PATH + 0.8, PATH + 2.2);
  p.headPitch += 0.25 * down;
  // радость: кулачки вверх
  const joy = pulse(t, JOY, JOY + 0.35, H04 - 0.2, H04 + 0.3, out);
  p.armL = mixLimbs(p.armL, { pitch: 0.55, roll: 0.45, bend: 1.9 }, joy);
  p.armR = mixLimbs(p.armR, { pitch: 0.55, roll: 0.45, bend: 1.9 }, joy);
  p.lift += 0.06 * pulse(t, JOY + 0.05, JOY + 0.2, JOY + 0.25, JOY + 0.45);
  p.lean -= 0.05 * joy;
  // «А если я… опоздаю?» — руки сцеплены
  const worry = ramp(t, H04 + 0.1, H04 + 0.5) * (1 - ramp(t, S04 + 1.5, S04 + 2.4));
  p.armL = mixLimbs(p.armL, { pitch: 0.8, roll: -0.2, bend: 1.45 }, worry);
  p.armR = mixLimbs(p.armR, { pitch: 0.8, roll: -0.2, bend: 1.45 }, worry);
  p.headPitch -= 0.12 * worry;
  // смотрит вслед Спасителю
  const follow = ramp(t, S04 + 0.6, S04 + 1.4) * (1 - ramp(t, PICK - 0.7, PICK - 0.3));
  p.headPitch -= 0.08 * follow;
  // --- 11. берёт чемодан и уверенно шагает
  const bend = pulse(t, PICK - 0.15, PICK + 0.1, PICK + 0.35, PICK + 0.75);
  p.lean += 0.55 * bend;
  p.armR = mixLimbs(p.armR, { pitch: 0.2, roll: 0.1, bend: 0.05 }, bend);
  if (t >= PICK + 0.35) {
    const w = walker(t, heroXZ, PICK + 0.35);
    p = walk(p, w.phase, clamp(w.v / 0.9), 0.15);
    p.armR = TOW_ARM;
    p.lean += 0.04 * ramp(t, WALK, WALK + 1);
    p.headPitch -= 0.06;
  }
  return tremble(p, t, trembleAmt(t));
}

// ---------------------------------------------------------------------
// ФЛЕШБЭК: перетягивание каната
// ---------------------------------------------------------------------
const FB_C: [number, number] = [0.0, 0.25];
const norm = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z);
  return [x / l, z / l];
};
const DIRS: [number, number][] = [norm(-0.8, -0.6), norm(0.8, -0.6), [0, 1]];
const GROUPS: { name: string; icon: SignIcon }[] = [
  { name: "ТолькоАвиа", icon: "plane" },
  { name: "ТолькоЖД", icon: "train" },
  { name: "ТолькоПопутка", icon: "car" },
];
const LEAD = 1.45;
const GAP = 0.5;
const sc = (g: number, k: number): [number, number] => [DIRS[g][0] * k, DIRS[g][1] * k];

/** куда в данный момент утянули чемодан (смещение от центра) */
const PULL_KEYS: [number, [number, number]][] = (() => {
  const k: [number, [number, number]][] = [
    [FB_IN, [0, 0]],
    [AVIA - 0.05, [0.04, -0.03]],
    [AVIA + 0.3, sc(0, 0.85)],
    [ZHD - 0.1, sc(0, 0.7)],
    [ZHD + 0.3, sc(1, 0.85)],
    [POP - 0.1, sc(1, 0.7)],
    [POP + 0.3, sc(2, 0.8)],
    [CHAOS - 0.1, sc(2, 0.62)],
  ];
  // хаос: дёргают по очереди и вразнобой
  const r = rng(77);
  let s = CHAOS + 0.25;
  let last = 2;
  while (s < SNAP - 0.9) {
    let g = Math.floor(r() * 3);
    if (g === last) g = (g + 1) % 3;
    last = g;
    k.push([s, sc(g, 0.55 + r() * 0.45)]);
    s += 0.42 + r() * 0.3;
  }
  k.push([SNAP - 0.45, [0, 0.05]]); // все тянут изо всех сил — чемодан замер посередине
  k.push([SNAP, [0, 0.0]]);
  return k;
})();
const pullAt = (t: number): [number, number] => [
  track(t, PULL_KEYS.map(([s, v]) => [s, v[0], out] as [number, number, typeof out])),
  track(t, PULL_KEYS.map(([s, v]) => [s, v[1], out] as [number, number, typeof out])),
];
const suitcaseFB = (t: number): [number, number] => {
  const p = pullAt(t);
  // после обрыва чемодан по инерции катится назад и останавливается
  const after = ramp(t, SNAP, SNAP + 0.4, out);
  return [FB_C[0] + p[0] - 0.15 * after, FB_C[1] + p[1] - 0.2 * after];
};
/** насколько резко дёрнули (для болтанки героя) */
const jerk = (t: number) => {
  const a = pullAt(t);
  const b = pullAt(t - 0.08);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) / 0.08;
};
const strain = (t: number) => ramp(t, FB_IN + 0.2, FB_IN + 1.2) * lerp(0.6, 1, ramp(t, CHAOS, SNAP - 0.5));

function heroFlashback(t: number): Pose {
  const s = suitcaseFB(t);
  const p = pullAt(t);
  const mag = Math.hypot(p[0], p[1]);
  const pd: [number, number] = mag > 0.001 ? [p[0] / mag, p[1] / mag] : [0, 1];
  // герой держится за ручку с противоположной стороны от тяги (по умолчанию — ближе к камере)
  const k = clamp(mag / 0.35);
  const od = norm(lerp(0, -pd[0], k) + 0.0001, lerp(-1, -pd[1], k));
  const hx = s[0] + od[0] * 0.42;
  const hz = s[1] + od[1] * 0.42;
  const j = clamp(jerk(t) / 4);
  let pose: Pose = withPose(STAND, { x: hx, z: hz, yaw: yawTo([hx, hz], s), lean: 0.12 + 0.35 * j });
  // вцепился в ручку обеими руками
  pose.armL = { pitch: 1.0, roll: -0.05, bend: 0.5 };
  pose.armR = { pitch: 1.0, roll: -0.05, bend: 0.5 };
  // ноги волочатся / болтаются при рывках
  pose.legL = { pitch: -0.2 - 0.6 * j + Math.sin(t * 19) * 0.25 * j, roll: 0.1, bend: 0.35 + 0.6 * j };
  pose.legR = { pitch: 0.3 + 0.3 * j + Math.sin(t * 17 + 1) * 0.3 * j, roll: 0.1, bend: 0.2 + 0.7 * j };
  pose.lift = 0.12 * j;
  pose.headYaw = Math.sin(t * 7.3) * 0.35 * strain(t);
  pose.headRoll = Math.sin(t * 9.1) * 0.15 * j;
  pose.twist = Math.sin(t * 6.1) * 0.25 * j;
  // после обрыва: падает на пятую точку
  const fall = ramp(t, SNAP + 0.05, SNAP + 0.35, inOut);
  if (fall > 0) {
    const SIT = withPose(pose, {
      seated: true,
      lift: -0.335,
      lean: -0.25,
      legL: { pitch: 1.2, roll: 0.25, bend: 0.6 },
      legR: { pitch: 1.35, roll: 0.2, bend: 0.4 },
      armL: { pitch: -0.6, roll: 0.35, bend: 0.2 },
      armR: { pitch: -0.6, roll: 0.35, bend: 0.2 },
      headYaw: 0,
      twist: 0,
    });
    pose = mixPose(pose, SIT, fall);
  }
  return pose;
}

/** фигуры из серии 1: 3 группы по 4 */
const R = rng(42);
const FIG = Array.from({ length: 12 }, (_, i) => ({
  g: Math.floor(i / 4),
  k: i % 4,
  scale: 1.07 + R() * 0.1,
  side: (i % 2 ? 1 : -1) * (0.1 + R() * 0.06),
  ph: R() * 6.28,
}));

function crowdPose(t: number, i: number): Pose {
  const f = FIG[i];
  const d = DIRS[f.g];
  const pl = pullAt(t);
  const proj = pl[0] * d[0] + pl[1] * d[1]; // тянет в свою сторону → отходит
  const st = strain(t);
  const dist = LEAD + f.k * GAP + proj * 0.95 - 0.05 * st;
  const perp: [number, number] = [-d[1], d[0]];
  const x = FB_C[0] + d[0] * dist + perp[0] * f.side;
  const z = FB_C[1] + d[1] * dist + perp[1] * f.side;
  const s = suitcaseFB(t);
  let p: Pose = withPose(STAND, { x, z, yaw: yawTo([x, z], s) });
  // упираются: корпус назад, руки вперёд (держат верёвку), ноги в распор
  const effort = st * (0.8 + 0.2 * Math.sin(t * 5 + f.ph));
  p.lean = -0.28 - 0.18 * effort;
  p.armL = { pitch: 1.2, roll: -0.08, bend: 0.4 };
  p.armR = { pitch: 1.2, roll: -0.08, bend: 0.4 };
  const fwd = f.k % 2 === 0 ? 1 : -1;
  p.legL = { pitch: 0.42 * fwd, roll: 0.06, bend: 0.25 };
  p.legR = { pitch: -0.3 * fwd, roll: 0.06, bend: 0.12 };
  p.headPitch = -0.12;
  // после обрыва — падают на спину
  const fall = ramp(t, SNAP + 0.02, SNAP + 0.4 + f.k * 0.04, inn);
  p.lean -= 1.0 * fall;
  p.lift -= 0.45 * fall;
  p.armL = mixLimbs(p.armL, { pitch: 2.4, roll: 0.5, bend: 0.2 }, fall);
  p.armR = mixLimbs(p.armR, { pitch: 2.4, roll: 0.5, bend: 0.2 }, fall);
  p.legL = mixLimbs(p.legL, { pitch: 0.9, roll: 0.1, bend: 0.3 }, fall);
  return p;
}

function crowdAt(t: number, i: number): CrowdState {
  return { pose: crowdPose(t, i), scale: FIG[i].scale, visible: isFlashback(t) && t < CRUMBLE + 0.05 };
}

/** руки фигуры (середина между кистями) — через них проходит верёвка */
const handsOf = (p: Pose, scale: number): V3 => {
  const m = rigMatrices(p, scale);
  const a = pointOf(m.handL);
  const b = pointOf(m.handR);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

// ---------------------------------------------------------------------
// ОБЁРТКА ОТ ШАУРМЫ
// ---------------------------------------------------------------------
type WrapState = { pos: V3; rot: V3; visible: boolean };
/** кувыркается по полу: позиция по траектории, вращение — от пройденного пути */
const tumble = (t: number, path: (s: number) => [number, number], t0: number, bounce = 0.1, seed = 1): WrapState => {
  let dist = 0;
  const step = 1 / 60;
  for (let s = t0; s < t; s += step) {
    const a = path(s);
    const b = path(Math.min(t, s + step));
    dist += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const p = path(t);
  const a = path(t - 0.05);
  const heading = Math.atan2(p[0] - a[0], p[1] - a[1]);
  const hop = Math.abs(Math.sin(dist * 3.1 + seed)) * bounce;
  return { pos: [p[0], 0.09 + hop, p[1]], rot: [dist * 6.5, heading, Math.sin(dist * 2.3 + seed) * 0.6], visible: true };
};

function wrapperAt(t: number): WrapState {
  const hidden: WrapState = { pos: [0, -5, 0], rot: [0, 0, 0], visible: false };
  // A: из тумана по платформе → между героем и Спасителем → падает с края на пути
  if (t > 5.9 && t < 10.6) {
    const path = (s: number): [number, number] => [
      track(s, [[5.9, -7.0], [8.3, 8.6, linear], [9.25, 10.95, linear], [10.3, 11.5, out]]),
      track(s, [[5.9, 1.9], [8.3, 1.55, linear], [9.25, -0.45, inOut], [10.3, -3.1, inn]]),
    ];
    const w = tumble(t, path, 5.9, 0.12, 1);
    const off = path(t)[1] < -2.8 ? (path(t)[1] + 2.8) * 2.5 : 0; // свалилась с платформы
    return { ...w, pos: [w.pos[0], w.pos[1] + off, w.pos[2]] };
  }
  // B: прилетает с порывом ветра и прилипает к ноге героя; он её стряхивает
  if (t > WRAP_STICK - 0.75 && t < SHAKE + 1.6) {
    const pose = heroPresent(Math.min(t, SHAKE + 0.3));
    const m = rigMatrices(pose);
    const knee = pointOf(m.kneeL);
    const foot = pointOf(m.footL);
    const shin: V3 = [lerp(knee[0], foot[0], 0.45), lerp(knee[1], foot[1], 0.45), lerp(knee[2], foot[2], 0.45)];
    const fwd: V3 = [Math.sin(pose.yaw), 0, Math.cos(pose.yaw)];
    const stuck: V3 = [shin[0] + fwd[0] * 0.07, shin[1], shin[2] + fwd[2] * 0.07];
    if (t < WRAP_STICK) {
      const k = ramp(t, WRAP_STICK - 0.75, WRAP_STICK, linear);
      const from: V3 = [stuck[0] - 2.6, 0.9, stuck[2] + 1.2];
      const p = lerp3(from, stuck, k);
      p[1] += Math.sin(k * Math.PI) * 0.35;
      return { pos: p, rot: [k * 9, k * 4, k * 2], visible: true };
    }
    if (t < SHAKE + 0.32) {
      const flap = Math.sin(t * 31) * 0.15 * ramp(t, SHAKE, SHAKE + 0.1);
      return { pos: stuck, rot: [0.4 + flap, pose.yaw + 0.3, 0.2], visible: true };
    }
    // сброшена: дугой в сторону, потом катится и пропадает из кадра
    const k = t - (SHAKE + 0.32);
    const p: V3 = [stuck[0] - 0.4 * k - 0.9 * k * k, Math.max(0.05, stuck[1] + 1.6 * k - 4.9 * k * k), stuck[2] + 1.7 * k];
    return { pos: p, rot: [k * 14, k * 6, k * 3], visible: true };
  }
  // C: кувыркается следом за героем по алой дорожке
  if (t > WALK + 0.9 && t < CARD + 0.1) {
    const path = (s: number): [number, number] => [lerp(12.6, heroWalkX(s) + 1.25, ramp(s, WALK + 0.9, WALK + 2.4)), lerp(1.4, 0.75, ramp(s, WALK + 0.9, WALK + 2.4))];
    return tumble(t, path, WALK + 0.9, 0.14, 3);
  }
  return hidden;
}

// ---------------------------------------------------------------------
// СМАРТФОН И ЛИНИЯ МАРШРУТА
// ---------------------------------------------------------------------
type PhoneState = { pos: V3; rot: V3; visible: boolean; ui: RouteUIState };

const uiAt = (t: number): RouteUIState => {
  const seg: [number, number, number] = [0, 1, 2].map((i) => {
    const end = i < 2 ? SEG[i + 1] : ALL;
    return ramp(t, SEG[i], SEG[i] + 0.25) * (1 - ramp(t, end, end + 0.25));
  }) as [number, number, number];
  return {
    t: t - UI_ON,
    appear: ramp(t, UI_ON, UI_ON + 0.4),
    gather: ramp(t, GATHER, MERGE + 0.1, linear),
    merge: ramp(t, MERGE, MERGE + 1.1, inOut),
    seg,
    all: ramp(t, ALL, ALL + 0.4),
    noTransfers: ramp(t, NOTR, NOTR + 0.4),
    exit: ramp(t, EXIT, EXIT + 0.7, linear),
  };
};

function phoneAt(t: number): PhoneState {
  const ui = uiAt(t);
  const vis = t > PHONE + 0.4 && t < S03_END + 0.85;
  if (!vis) return { pos: [0, -5, 0], rot: [0, 0, 0], visible: false, ui };
  const sp = saviorPose(t);
  const m = rigMatrices(sp, SAVIOR_SCALE);
  const hand = pointOf(m.handR);
  const hero = headOf(heroPresent(t));
  // экран к герою, слегка запрокинут
  const face = Math.atan2(hero[0] - hand[0], hero[2] - hand[2]);
  const turn = ramp(t, PHONE + 0.9, PHONE + 1.6, inOut);
  const yaw = lerp(face + Math.PI * 0.85, face, turn);
  const float = Math.sin(t * 1.3) * 0.006;
  return {
    // телефон перед кистью (кисть — за нижним краем корпуса)
    pos: [hand[0] + Math.sin(face) * 0.085, hand[1] + 0.16 + float, hand[2] + Math.cos(face) * 0.085],
    rot: [-0.18 * turn, yaw, 0.04 * Math.sin(t * 0.9)],
    visible: true,
    ui,
  };
}

/** Точки линии: от экрана — на пол к ногам героя — по платформе в туман */
const PATH_PTS: V3[] = (() => {
  const ph = phoneAt(EXIT);
  const s = ph.pos;
  const yaw = ph.rot[1];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return [
    [s[0] + fx * 0.02, s[1] - 0.02, s[2] + fz * 0.02],
    [s[0] + fx * 0.22, s[1] - 0.3, s[2] + fz * 0.22],
    [s[0] + fx * 0.32, 0.35, s[2] + fz * 0.32],
    [11.0, FLOOR_Y, -0.05],
    [10.2, FLOOR_Y, 0.2],
    [8.4, FLOOR_Y, 0.32],
    [5.5, FLOOR_Y, 0.15],
    [2.0, FLOOR_Y, 0.45],
    [-2.5, FLOOR_Y, 0.25],
    [-8.0, FLOOR_Y, 0.55],
    [-14.0, FLOOR_Y, 0.35],
    [-19.5, FLOOR_Y, 0.5],
  ];
})();
const PATH_CURVE = new THREE.CatmullRomCurve3(PATH_PTS.map((p) => new THREE.Vector3(...p)), false, "centripetal");
const PATH_LEN = PATH_CURVE.getLength();
const FLOOR_FROM = (() => {
  // где линия касается пола
  for (let i = 0; i <= 200; i++) if (PATH_CURVE.getPointAt(i / 200).y < 0.06) return (PATH_LEN * i) / 200;
  return 1.5;
})();
const pathGrow = (t: number) => (t < EXIT ? 0 : PATH_LEN * (0.06 * ramp(t, EXIT + 0.2, PATH, linear) + 0.94 * ramp(t, PATH, PATH + PATH_DUR, (k) => 1 - Math.pow(1 - k, 2.2))));
const PIN_POS = PATH_CURVE.getPointAt(1);

// ---------------------------------------------------------------------
// КАМЕРА
// ---------------------------------------------------------------------
const fwdOf = (p: Pose): [number, number] => [Math.sin(p.yaw), Math.cos(p.yaw)];

/** крупный план лица: dist — от лица вперёд, side — вбок (+ влево от персонажа), up — вверх */
const faceCam = (p: Pose, scale: number, dist: number, side: number, up: number, fov: number, lookDown = 0): CameraState => {
  const h = headOf(p, scale);
  const [fx, fz] = fwdOf(p);
  return {
    pos: [h[0] + fx * dist + fz * side, h[1] + up, h[2] + fz * dist - fx * side],
    target: [h[0], h[1] - lookDown, h[2]],
    fov,
  };
};

function shots(V: boolean): Shot[] {
  const hero = (t: number) => heroPresent(t);
  const sav = (t: number) => saviorPose(t);
  const chest = (t: number): V3 => {
    const m = rigMatrices(sav(t), SAVIOR_SCALE);
    return pointOf(m.chest, [0, DIMS.shoulderY - 0.2, DIMS.torsoR]) as V3;
  };
  const savFwd = (t: number) => fwdOf(sav(t));
  const fb = (t: number) => heroFlashback(t);
  const signPos = (g: number): V3 => [FB_C[0] + DIRS[g][0] * 2.2, g === 2 ? 2.95 : 2.75, FB_C[1] + DIRS[g][1] * 2.2 + (g === 2 ? 0.2 : 0)];
  const ep1End = EP1.camera(EP1.storyTime(EP1.duration) - 0.001, V);
  return [
    // 1. финальный кадр серии 1: рука Спасителя; герой хватается, его поднимают
    { from: 0, to: 1.25, cam: () => ep1End },
    {
      from: 1.25,
      to: 4.5,
      blend: 0.9,
      cam: (t) => ({
        pos: track3(t, [[1.25, [11.3, 0.75, V ? 3.6 : 3.1]], [4.5, [11.25, 1.1, V ? 3.9 : 3.3], inOut]]),
        target: track3(t, [[1.25, [11.35, 0.75, 0.05]], [3.0, [11.15, 1.15, 0.0], inOut]]),
        fov: V ? 52 : 40,
      }),
    },
    // 2. дрожит, нервно оглядывается
    { from: 4.5, to: 6.25, cam: (t) => ({ ...faceCam(hero(t), 1, V ? 1.5 : 1.15, -0.45, 0.02, V ? 44 : 34, 0.12), shake: [shake(t, 4.5, 2, 0.004, 1), 0, 0] }) },
    // POV: пустая платформа, ветер, обёртка кувыркается из тумана
    {
      from: 6.25,
      to: 8.6,
      cam: (t) => {
        const h = headOf(hero(t));
        const tr = trembleAmt(t);
        return {
          pos: [h[0] - 0.05, h[1] + 0.02 + Math.sin(t * 37) * 0.004 * tr, h[2] + 0.05],
          target: track3(t, [[6.25, [-4, 1.2, 2.6]], [7.6, [1.0, 0.8, 2.4], inOut], [8.6, [6.5, 0.35, 1.9], inOut]]),
          fov: V ? 50 : 36,
          roll: Math.sin(t * 29) * 0.006 * tr,
        };
      },
    },
    // низкий ракурс: обёртка пролетает между ними. Пауза.
    {
      from: 8.6,
      to: 10.05,
      cam: (t) => ({
        pos: [lerp(10.85, 10.95, ramp(t, 8.6, 10.05)), 0.22, V ? 2.3 : 1.9],
        target: [10.95, 0.55, -0.45],
        fov: V ? 62 : 46,
      }),
    },
    // 3. «Кто… кто вы?»
    { from: 10.05, to: CLOAK - 0.25, cam: (t) => faceCam(hero(t), 1, V ? 1.3 : 1.05, 0.3, 0.05, V ? 42 : 32, 0.08) },
    // 4. плащ распахивается: нижний ракурс, наезд на грудь — читается «Все пути по России»
    {
      from: CLOAK - 0.25,
      to: S01_ASSIST - 0.3,
      cam: (t) => {
        const c = chest(t);
        const [fx, fz] = savFwd(t);
        const push = ramp(t, CLOAK + 0.45, S01_ASSIST - 0.6, inOut);
        // камера сбоку от линии «Спаситель — герой» (со стороны задней стены), чтобы не упираться в героя и стену
        const d = lerp(V ? 2.1 : 1.9, V ? 1.3 : 1.1, push);
        const y = lerp(-1.2, 0.0, push);
        const side = lerp(V ? -1.7 : -1.5, -0.6, push);
        return {
          pos: [c[0] + fx * d + fz * side, c[1] + y, c[2] + fz * d - fx * side],
          target: [c[0], c[1] + lerp(0.2, -0.04, push), c[2]],
          fov: lerp(V ? 62 : 48, V ? 34 : 26, push),
          shake: [shake(t, CLOAK, 0.6, 0.03, 1), shake(t, CLOAK, 0.6, 0.02, 2), 0],
        };
      },
    },
    // реакция героя: прищур недоверия на «голосовой помощник»
    { from: S01_ASSIST - 0.3, to: S01_DO2 - 1.6, cam: (t) => faceCam(hero(t), 1, V ? 1.15 : 0.95, -0.25, 0.0, V ? 40 : 30, 0.04) },
    // «Меня зовут До. До… Еду.» — наклон головы
    {
      from: S01_DO2 - 1.6,
      to: S01_END + 0.3,
      cam: (t) => {
        const s = sav(t);
        const c = faceCam(s, SAVIOR_SCALE, V ? 2.4 : 2.0, V ? -1.8 : -1.5, -0.45, V ? 44 : 34, 0.42);
        const push = ramp(t, S01_DO2 - 1.6, S01_EDU, inOut);
        return { ...c, pos: lerp3(c.pos, faceCam(s, SAVIOR_SCALE, V ? 1.8 : 1.5, V ? -1.3 : -1.1, -0.3, 0, 0.42).pos, push) };
      },
    },
    // 5. крупно: двойное моргание
    { from: S01_END + 0.3, to: WRAP_STICK - 0.85, cam: (t) => faceCam(hero(t), 1, V ? 1.0 : 0.8, 0.05, 0.02, V ? 40 : 30) },
    // обёртка прилипает к ноге; он стряхивает её, не глядя
    {
      from: WRAP_STICK - 0.85,
      to: H02 - 0.05,
      cam: (t) => {
        const p = hero(t);
        const [fx, fz] = fwdOf(p);
        return {
          // сбоку (перпендикулярно линии героя и Спасителя), чтобы плащ не загораживал
          pos: [p.x + fx * 0.55 - fz * (V ? 2.4 : 2.1), V ? 0.8 : 0.72, p.z + fz * 0.55 + fx * (V ? 2.4 : 2.1)],
          target: [p.x + fx * 0.15, V ? 0.7 : 0.68, p.z + fz * 0.15],
          fov: V ? 52 : 38,
        };
      },
    },
    // 6. «А те люди? Они хотели меня… съесть?»
    {
      from: H02 - 0.05,
      to: FB_IN + 0.15,
      cam: (t) => {
        const c = faceCam(hero(t), 1, V ? 1.7 : 1.3, 0.5, 0.0, V ? 42 : 32, 0.12);
        const push = ramp(t, H02, H02_EAT + 0.3, inOut);
        const c2 = faceCam(hero(t), 1, V ? 1.05 : 0.85, 0.15, 0.0, V ? 40 : 30);
        return { pos: lerp3(c.pos, c2.pos, push), target: c.target, fov: lerp(c.fov, c2.fov, push) };
      },
    },
    // 7. ФЛЕШБЭК — общий план сверху
    {
      from: FB_IN + 0.15,
      to: AVIA - 0.15,
      cam: (t) => ({
        pos: track3(t, [[FB_IN, V ? [0, 4.9, -10.2] : [0, 3.9, -6.8]], [AVIA, V ? [0.2, 4.6, -9.6] : [0.2, 3.6, -6.3]]]),
        target: [0, 1.1, 0.8],
        fov: V ? 58 : 44,
      }),
    },
    // «ТолькоАвиа», «ТолькоЖД», «ТолькоПопутка» — каждая группа со своей табличкой
    ...[AVIA, ZHD, POP].map((at, g) => ({
      from: at - 0.15,
      to: g < 2 ? [ZHD, POP][g] - 0.15 : CHAOS + 0.3,
      blend: 0.3,
      cam: (t: number): CameraState => {
        const sp = signPos(g);
        const d = V ? 4.9 : 3.6;
        const k = ramp(t, at - 0.15, at + 1.2);
        return { pos: [sp[0] * 0.75, sp[1] - 0.9 + 0.15 * k, sp[2] - d + 0.25 * k], target: [sp[0] * 0.9, sp[1] - 0.95, sp[2]], fov: V ? 52 : 40 };
      },
    })),
    // хаос: перетягивание каната
    {
      from: CHAOS + 0.3,
      to: CHAOS + 3.6,
      blend: 0.4,
      cam: (t) => ({
        pos: [Math.sin((t - CHAOS) * 0.5) * 1.2, V ? 4.4 : 3.3, V ? -9.2 : -5.6],
        target: [0, 1.0, 0.8],
        fov: V ? 58 : 44,
        shake: [shake(t, CHAOS + 0.3, 3.3, 0.02, 4), 0, 0],
      }),
    },
    // героя мотает
    {
      from: CHAOS + 3.6,
      to: SNAP - 1.3,
      cam: (t) => {
        const p = fb(t);
        const h = headOf(p);
        return { pos: [h[0] + 0.25, h[1] + 0.25, h[2] - (V ? 1.75 : 1.55)], target: [h[0], h[1] - 0.15, h[2]], fov: V ? 50 : 38, shake: [shake(t, CHAOS + 3.6, 3, 0.03, 2), shake(t, CHAOS + 3.6, 3, 0.02, 5), 0] };
      },
    },
    // натяжение — верёвки лопаются — флешбэк рассыпается
    {
      from: SNAP - 1.3,
      to: FB_OUT,
      blend: 0.25,
      cam: (t) => ({
        pos: track3(t, [[SNAP - 1.3, V ? [0, 4.4, -9.2] : [0, 3.3, -5.4]], [SNAP, V ? [0, 3.9, -8.2] : [0, 2.9, -4.8], inOut], [FB_OUT, V ? [0, 4.6, -9.6] : [0, 3.5, -5.8], out]]),
        target: [0, 0.9, 0.8],
        fov: V ? 58 : 44,
        shake: [shake(t, SNAP, 0.7, 0.08, 1), shake(t, SNAP, 0.7, 0.06, 2), 0],
      }),
    },
    // 8. снова платформа: «И что теперь?»
    {
      from: FB_OUT,
      to: PHONE + 0.2,
      cam: (t) => {
        const p = hero(t);
        const s = sav(t);
        const mid: V3 = [(p.x + s.x) / 2, 1.25, (p.z + s.z) / 2];
        return { pos: [mid[0] + 0.6, 1.35, mid[2] + (V ? 3.4 : 2.9)], target: [mid[0] + 0.15, 1.2, mid[2]], fov: V ? 48 : 38 };
      },
    },
    // 9. достаёт смартфон из кармана плаща
    { from: PHONE + 0.2, to: PHONE + 1.45, cam: (t) => faceCam(sav(t), SAVIOR_SCALE, V ? 2.0 : 1.7, V ? -1.6 : -1.4, -0.55, V ? 46 : 36, 0.55) },
    // прищур: что это?
    { from: PHONE + 1.45, to: S03 + 0.5, cam: (t) => faceCam(hero(t), 1, V ? 1.15 : 0.95, -0.3, 0.0, V ? 40 : 30) },
    // через плечо героя
    {
      from: S03 + 0.5,
      to: GATHER - 0.25,
      cam: (t) => {
        const p = hero(t);
        const h = headOf(p);
        const [fx, fz] = fwdOf(p);
        const ph = phoneAt(t).pos;
        return { pos: [h[0] - fx * 0.95 - fz * 0.5, h[1] + 0.3, h[2] - fz * 0.95 + fx * 0.5], target: [ph[0], ph[1] + 0.02, ph[2]], fov: V ? 46 : 36 };
      },
    },
    // крупно экран: иконки сливаются в алую линию, сегменты — синхронно со словами
    {
      from: GATHER - 0.25,
      to: EXIT - 0.25,
      blend: 0.5,
      cam: (t) => {
        const ph = phoneAt(t);
        const [px, py, pz] = ph.pos;
        const yaw = ph.rot[1];
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const d = (V ? 0.47 : 0.5) * (1 - 0.05 * ramp(t, GATHER, EXIT));
        const drift = Math.sin(t * 0.6) * 0.012;
        return { pos: [px + fx * d + fz * drift, py + 0.05 + d * 0.18, pz + fz * d - fx * drift], target: [px, py, pz], fov: V ? 42 : 34 };
      },
    },
    // линия выходит из экрана и ложится на пол
    {
      from: EXIT - 0.25,
      to: PATH + 0.6,
      cam: (t) => {
        const ph = phoneAt(Math.min(t, EXIT));
        const [px, py, pz] = ph.pos;
        const yaw = ph.rot[1];
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const k = ramp(t, EXIT - 0.25, PATH + 0.6, inOut);
        return {
          pos: [px + fx * lerp(0.7, 1.6, k) + fz * lerp(0.6, 1.4, k), lerp(py + 0.1, 1.0, k), pz + fz * lerp(0.7, 1.6, k) - fx * lerp(0.6, 1.4, k)],
          target: [lerp(px, 10.4, k), lerp(py - 0.2, 0.15, k), lerp(pz, 0.1, k)],
          fov: V ? 52 : 40,
        };
      },
    },
    // светящаяся дорожка уходит в туман (низко, из-за ног героя)
    {
      from: PATH + 0.6,
      to: JOY - 0.2,
      cam: (t) => {
        // из-за плеча героя, низко: дорожка убегает в туман
        const k = ramp(t, PATH + 0.6, JOY);
        return { pos: [lerp(12.25, 12.1, k), lerp(0.85, 1.0, k), V ? -0.45 : -0.4], target: [lerp(6.5, 3.5, k), 0.35, 0.35], fov: V ? 52 : 40 };
      },
    },
    // глаза радостно расширяются
    { from: JOY - 0.2, to: H04 - 0.1, cam: (t) => faceCam(hero(t), 1, V ? 1.1 : 0.9, -0.1, -0.02, V ? 42 : 32) },
    // 10. «А если я опоздаю?»
    { from: H04 - 0.1, to: CLOSE - 0.15, cam: (t) => faceCam(hero(t), 1, V ? 1.5 : 1.25, 0.5, 0.02, V ? 42 : 32, 0.1) },
    // 11. запахивает плащ, отступает в туман: силуэт и светящаяся «Д»
    {
      from: CLOSE - 0.15,
      to: PICK - 0.3,
      cam: (t) => {
        const p = hero(t);
        const h = headOf(p);
        return { pos: [h[0] + 0.85, h[1] + 0.05, h[2] + (V ? 1.15 : 0.95)], target: lerp3([10.0, 1.4, -0.5], [7.4, 1.5, -1.0], ramp(t, S04, VANISH)), fov: V ? 46 : 36 };
      },
    },
    // герой берёт чемодан и уверенно шагает по алой дорожке; обёртка — следом
    {
      from: PICK - 0.3,
      to: END,
      cam: (t) => {
        const hx = heroXZ(t)[0];
        const k = ramp(t, PICK - 0.3, CARD);
        return { pos: [hx - lerp(V ? 2.4 : 2.9, V ? 3.0 : 3.5, k), lerp(0.45, 0.6, k), V ? 1.45 : 1.25], target: [hx + 0.4, V ? 0.75 : 0.85, 0.15], fov: V ? 52 : 40 };
      },
    },
  ];
}

// ---------------------------------------------------------------------
// ЭФФЕКТЫ
// ---------------------------------------------------------------------
function fx(t: number, V: boolean): FxState {
  const fbAmt = isFlashback(t) ? 1 : 0;
  const unfreeze = 1 - ramp(t, 0.15, 1.0, inOut); // серия 1 закончилась стоп-кадром ч/б
  const sv = saviorPose(Math.min(t, VANISH));
  let dof: FxState["post"]["dof"];
  const closeHero = (t > 10.05 && t < CLOAK - 0.25) || (t > S01_ASSIST - 0.3 && t < S01_DO2 - 1.6) || (t > S01_END + 0.3 && t < WRAP_STICK - 0.85) || (t > JOY - 0.2 && t < H04 - 0.1) || (t > PHONE + 1.45 && t < S03 + 0.5);
  if (t < 1.25) dof = EP1.fx(EP1.storyTime(EP1.duration) - 0.001, V).post.dof;
  if (closeHero) dof = { target: headOf(heroPresent(t)), bokeh: 2.0, focalLength: 0.02 };
  const ph = phoneAt(t);
  if (t > GATHER - 0.25 && t < EXIT - 0.25 && ph.visible) dof = { target: ph.pos, bokeh: 1.8, focalLength: 0.015 };
  if (t > CLOAK + 0.6 && t < S01_ASSIST - 0.3) {
    const m = rigMatrices(sv, SAVIOR_SCALE);
    dof = { target: pointOf(m.chest, [0, DIMS.shoulderY - 0.2, DIMS.torsoR]) as V3, bokeh: 1.6, focalLength: 0.02 };
  }
  const r = rng(Math.floor(t * 30) * 13 + 5);
  return {
    post: {
      bloom: 0.95 + 0.5 * pulse(t, CLOAK, CLOAK + 0.15, CLOAK + 0.6, CLOAK + 1.8) + 0.5 * ramp(t, PATH, PATH + 1) * (1 - ramp(t, CARD - 0.5, CARD)) + 0.8 * pulse(t, VANISH - 0.1, VANISH, VANISH + 0.1, VANISH + 0.6),
      dof,
      vignette: 0.55 + 0.3 * fbAmt,
      desat: Math.max(unfreeze, fbAmt),
    },
    eyelids: { open: 1, tilt: 0, glow: 0 },
    black: ramp(t, CARD - 0.45, CARD, inOut),
    grain: 0.07 + 0.08 * fbAmt,
    card: t >= CARD,
    sparks: t > VANISH - 0.05 ? 1 - ramp(t, VANISH + 3.5, VANISH + 4.5) : 0,
    sparksT: t - VANISH + 0.25,
    sparksCenter: [SAV_FOG[0] + 0.5, 0, SAV_FOG[1] + 0.3],
    shadowLamp: isFlashback(t) ? { x: 4, target: [0, 0, 0.5] } : { x: 9.6, target: [11.2, 0.5, -0.2] },
    lampWarmth: 1,
    rimLight: isFlashback(t)
      ? { pos: [0, 4.2, 4.0], target: [0, 1, 0.3], intensity: 70 }
      : t > CLOSE - 0.2
        ? { pos: [sv.x - 2.6, 3.0, sv.z - 1.0], target: [sv.x + 0.4, 2.2, sv.z], intensity: 75 }
        : { pos: [12.3, 3.1, 1.6], target: [10.9, 1.3, -0.4], intensity: 42 }, // контровой из-за спины героя
    fog: isFlashback(t) ? 0.045 : 0.06 + 0.025 * ramp(t, S04, VANISH),
    offset: fbAmt ? [(r() - 0.5) * 4, (r() - 0.5) * 3 + Math.sin(t * 9) * 1.5] : undefined,
    hideTrain: fbAmt > 0,
  };
}

// ---------------------------------------------------------------------
// РЕКВИЗИТ В СЦЕНЕ
// ---------------------------------------------------------------------
function scene(st: number, t: number): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const w = wrapperAt(t);
  if (w.visible) nodes.push(<Wrapper key="wrap" pos={w.pos} rot={w.rot} scale={1.6} />);
  // смартфон
  const ph = phoneAt(t);
  if (ph.visible) nodes.push(<Phone key="phone" pos={ph.pos} rot={ph.rot} ui={ph.ui} scale={PHONE_SCALE} />);
  // алая дорожка
  const grow = pathGrow(t);
  if (grow > 0 && !isFlashback(t)) {
    const glow = 3.4 + 0.6 * Math.sin(t * 2.1);
    // часть линии в воздухе «отцепляется» от телефона и стекает на пол
    const tail = FLOOR_FROM * ramp(t, PATH + 1.1, PATH + 1.7, inOut);
    nodes.push(<RoutePath key="path" points={PATH_PTS} grow={grow} glow={glow} stops={[PATH_LEN * 0.32, PATH_LEN * 0.64]} floorFrom={FLOOR_FROM} tail={tail} t={t} />);
    const pin = outBack(clamp((grow - PATH_LEN + 0.05) / 0.4)) * (grow >= PATH_LEN - 0.06 ? 1 : 0);
    nodes.push(<Pin3D key="pin" pos={[PIN_POS.x, 0.02 + Math.sin(t * 2) * 0.05, PIN_POS.z]} scale={pin * 1.3} glow={4} yaw={Math.PI / 2} />);
  }
  // флешбэк: таблички, двери, верёвки, чемодан, пыль
  if (isFlashback(t)) {
    const crumble = ramp(t, CRUMBLE, CRUMBLE + 0.9, linear);
    const s = suitcaseFB(t);
    const sYaw = yawTo(s, [heroFlashback(t).x, heroFlashback(t).z]) + Math.PI;
    const tip = ramp(t, SNAP + 0.1, SNAP + 0.45, inn);
    if (crumble < 0.5)
      nodes.push(
        <group key="fbcase" position={[s[0], 0, s[1]]} rotation={[0, sYaw, tip * 1.45]}>
          <SuitcaseBody handle={0.32} />
        </group>,
      );
    const body: V3 = [s[0], 0.3, s[1]];
    GROUPS.forEach((g, gi) => {
      const d = DIRS[gi];
      const sway = Math.sin(t * 1.7 + gi) * 0.04 + Math.sin(t * 6 + gi) * 0.05 * strain(t) * (t > CHAOS ? 1 : 0.3);
      const fall = ramp(t, CRUMBLE, CRUMBLE + 0.7, inn);
      const sp: V3 = [FB_C[0] + d[0] * 2.2, (gi === 2 ? 2.95 : 2.75) + Math.sin(t * 1.3 + gi * 2) * 0.05 - 3 * fall * fall, FB_C[1] + d[1] * 2.2 + (gi === 2 ? 0.2 : 0)];
      if (fall < 0.9) nodes.push(<Sign key={`sign${gi}`} text={g.name} icon={g.icon} pos={sp} yaw={Math.PI + sway * 0.5} tilt={0.32 + sway} scale={1 - 0.6 * fall} />);
      nodes.push(<GlowDoor key={`door${gi}`} pos={[FB_C[0] + d[0] * 3.75, 0, FB_C[1] + d[1] * 3.75]} yaw={Math.atan2(-d[0], -d[1])} glow={2.2 * (1 - crumble)} />);
      // верёвка: от чемодана через руки всей группы
      if (crumble < 0.6) {
        const hands = [0, 1, 2, 3].map((k) => {
          const i = gi * 4 + k;
          return handsOf(crowdPose(t, i), FIG[i].scale);
        });
        const lastF = hands[3];
        const tail: V3 = [lastF[0] + d[0] * 0.45, 0.04, lastF[2] + d[1] * 0.45];
        if (t < SNAP) {
          const taut = 0.012 + 0.02 * (1 - strain(t));
          nodes.push(<Rope key={`rope${gi}`} points={[...sagRope(body, hands[0], taut, 6), ...hands.slice(1), tail]} />);
        } else {
          // лопнула посередине: концы отскакивают и падают
          const k = ramp(t, SNAP, SNAP + 0.5, out);
          const mid: V3 = [lerp(body[0], hands[0][0], 0.5), lerp(body[1], hands[0][1], 0.5), lerp(body[2], hands[0][2], 0.5)];
          const endA: V3 = [lerp(mid[0], body[0], 0.6 * k), Math.max(0.03, mid[1] - 0.9 * k), lerp(mid[2], body[2], 0.6 * k)];
          const endB: V3 = [lerp(mid[0], hands[0][0], 0.7 * k), Math.max(0.03, mid[1] - 0.6 * k + 0.25 * Math.sin(k * Math.PI)), lerp(mid[2], hands[0][2], 0.7 * k)];
          nodes.push(<Rope key={`ropeA${gi}`} points={sagRope(body, endA, 0.1 * k, 5)} />);
          nodes.push(<Rope key={`ropeB${gi}`} points={[endB, ...hands, tail]} />);
        }
      }
    });
    // фигуры рассыпаются в пыль
    if (crumble > 0) {
      const centers: V3[] = FIG.map((f, i) => {
        const p = crowdPose(CRUMBLE, i);
        return [p.x, 0.0, p.z];
      });
      nodes.push(<Dust key="dust" centers={centers} k={crumble} />);
      const hp = heroFlashback(CRUMBLE);
      nodes.push(<Dust key="dust2" centers={[[hp.x, 0, hp.z], [s[0], 0, s[1]]]} k={crumble} seed={31} perCenter={34} color="#9a9a9a" />);
    }
  }
  return <>{nodes}</>;
}

// ---------------------------------------------------------------------
// 2D поверх кадра
// ---------------------------------------------------------------------
function overlay(t: number, frame: number): React.ReactNode {
  const fb = isFlashback(t) ? 1 : 0;
  const burn = ramp(t, CRUMBLE + 0.15, FB_OUT - 0.05, inn);
  const flashIn = pulse(t, FB_IN - 0.05, FB_IN + 0.12, FB_IN + 0.2, FB_IN + 0.6);
  const flashOut = pulse(t, FB_OUT - 0.1, FB_OUT, FB_OUT + 0.05, FB_OUT + 0.55);
  return (
    <>
      <Film frame={frame} amount={fb} burn={fb ? burn : 0} />
      <Flash amount={Math.max(flashIn, flashOut)} />
    </>
  );
}

// ---------------------------------------------------------------------
// ГЕРОЙ: состояние
// ---------------------------------------------------------------------
function heroEyes(t: number): Eyes {
  const e: Eyes = { ...EYES_DEFAULT, brow: 0.5, browAsym: 0, smile: 0, squint: 0, sparkle: 0 };
  e.blink = blinkAt(t, [3.4, 5.2, 9.7, 12.4, 16.0, BLINK2, BLINK2 + 0.24, 27.4, H03 - 0.4, PHONE + 0.6, 57.0, 60.2, H04 + 1.9, PICK + 0.5, WALK + 1.4]);
  // страх: брови домиком, глаза бегают
  const fear = ramp(t, 1.8, 2.4) * (1 - ramp(t, PATH + 0.5, JOY));
  e.brow = 0.25 + 0.6 * fear;
  e.wide = 0.35 * fear + 0.5 * pulse(t, CLOAK, CLOAK + 0.15, CLOAK + 1.2, CLOAK + 2.0) + 0.45 * pulse(t, H02_EAT - 0.2, H02_EAT, H02_EAT + 0.6, H02_EAT + 1.0);
  e.lookX = Math.sin((t - 4.5) * 4.2) * 0.8 * pulse(t, 4.5, 4.8, 6.0, 6.3) + Math.sin(t * 3.3) * 0.25 * fear * (t < CLOAK ? 1 : 0);
  e.lookY = 0.45 * ramp(t, CLOAK, CLOAK + 0.3) * (1 - ramp(t, S01_END, S01_END + 0.6)) - 0.5 * pulse(t, 8.7, 9.0, 9.6, 10.0);
  // прищур недоверия: «голосовой помощник» и при виде телефона
  const sq = pulse(t, S01_ASSIST - 0.1, S01_ASSIST + 0.25, S01_DO2 - 1.7, S01_DO2 - 1.3) + pulse(t, PHONE + 1.5, PHONE + 1.8, S03 + 0.3, S03 + 0.7);
  e.squint = sq;
  e.browAsym = 0.55 * sq;
  e.brow -= 1.0 * sq;
  // 5: тупо моргает — глаза чуть шире, брови ровные
  const dumb = pulse(t, S01_END + 0.3, S01_END + 0.4, WRAP_STICK, WRAP_STICK + 0.3);
  e.brow = lerp(e.brow, 0.2, dumb);
  e.wide += 0.25 * dumb;
  // флешбэк: перепуган
  if (isFlashback(t)) {
    e.wide = 0.9;
    e.brow = 1;
    e.lookX = Math.sin(t * 5.3) * 0.5;
    if (t > SNAP) e.squeeze = ramp(t, SNAP, SNAP + 0.1);
  }
  // смотрит на экран, интерес растёт
  const curious = ramp(t, MERGE, MERGE + 0.8) * (1 - ramp(t, EXIT, EXIT + 0.5));
  e.lookY -= 0.25 * ramp(t, PHONE + 1.5, PHONE + 2) * (1 - ramp(t, S03_END, S03_END + 0.5));
  e.wide += 0.3 * curious;
  e.brow += 0.3 * curious;
  // радость: глаза расширяются, блики, улыбка
  const joy = ramp(t, JOY, JOY + 0.3, outBack) * (1 - ramp(t, H04 + 0.6, H04 + 1.2));
  e.wide = lerp(e.wide, 1.05, joy);
  e.sparkle = Math.max(joy, 0.6 * ramp(t, PICK, PICK + 0.6));
  e.smile = 0.9 * joy + 0.55 * ramp(t, WALK - 0.3, WALK + 0.4);
  e.brow = lerp(e.brow, 0.7, joy);
  // надежда с тревогой
  const worry = ramp(t, H04, H04 + 0.3) * (1 - ramp(t, S04 + 1.6, S04 + 2.4));
  e.brow = lerp(e.brow, 1.0, worry);
  e.wide = lerp(e.wide, 0.45, worry);
  e.lookY += 0.2 * worry;
  // уверенность в финале
  const sure = ramp(t, PICK, PICK + 0.6);
  e.brow = lerp(e.brow, 0.0, sure);
  e.wide = lerp(e.wide, 0.15, sure);
  return e;
}

function heroAt(t: number): HeroState {
  if (isFlashback(t)) {
    return { pose: heroFlashback(t), eyes: heroEyes(t), sweat: 0, suitcase: { mode: "hidden" }, visible: t < CRUMBLE + 0.05 };
  }
  const pose = heroPresent(t);
  let suitcase: HeroState["suitcase"] = { ...SUITCASE };
  if (t >= PICK + 0.1) suitcase = { mode: "towed" };
  else if (t > PICK - 0.25) suitcase = { ...SUITCASE, fall: 1 - 0.35 * ramp(t, PICK - 0.25, PICK + 0.1) };
  return { pose, eyes: heroEyes(t), sweat: 0, suitcase, visible: true };
}

// ---------------------------------------------------------------------
// ЗВУК (голос всегда громче эффектов)
// ---------------------------------------------------------------------
const A = (f: string) => `audio/ep2/${f}`;
const audio: AudioCue[] = [
  { file: A("sfx/wind.mp3"), at: 0, dur: FB_IN + 0.2, loop: true, volume: 0.32, fadeIn: 1.2, fadeOut: 0.4 },
  { file: A("sfx/wind.mp3"), at: FB_OUT - 0.1, dur: CARD - FB_OUT + 0.4, loop: true, volume: 0.26, fadeIn: 0.8, fadeOut: 0.6 },
  { file: "audio/sfx/station_ambience.mp3", at: 0, dur: FB_IN, loop: true, volume: 0.1, fadeIn: 1, fadeOut: 0.3 },
  { file: "audio/sfx/heartbeat.mp3", at: 2.3, dur: 7.5, volume: 0.28, fadeIn: 0.6, fadeOut: 1.5 },
  { file: "audio/sfx/cloak_flap.mp3", at: LIFT[0] + 0.1, volume: 0.3 },
  { file: A("sfx/foil.mp3"), at: 6.7, volume: 0.32 },
  { file: A("sfx/foil.mp3"), at: 8.75, volume: 0.45 },
  { file: A("sfx/cloak_burst.mp3"), at: CLOAK - 0.08, volume: 0.7 },
  { file: A("sfx/letter_glow.mp3"), at: CLOAK + 0.12, volume: 0.45 },
  { file: A("sfx/foil.mp3"), at: WRAP_STICK - 0.6, volume: 0.45 },
  { file: A("sfx/foil.mp3"), at: SHAKE + 0.05, volume: 0.4 },
  { file: A("sfx/projector.mp3"), at: FB_IN, dur: FB_OUT - FB_IN, loop: true, volume: 0.3, fadeIn: 0.3, fadeOut: 0.3 },
  { file: A("sfx/rope_creak.mp3"), at: FB_IN + 0.4, dur: SNAP - FB_IN - 0.4, loop: true, volume: 0.38, fadeIn: 0.6, fadeOut: 0.1 },
  { file: A("sfx/rope_snap.mp3"), at: SNAP - 0.04, volume: 0.75 },
  { file: "audio/sfx/wall_hit.mp3", at: SNAP + 0.38, volume: 0.35 },
  { file: "audio/sfx/air_whoosh.mp3", at: CRUMBLE, volume: 0.35 },
  { file: "audio/sfx/cloak_flap.mp3", at: PHONE + 0.1, volume: 0.25 },
  { file: A("sfx/phone_chime.mp3"), at: UI_ON, volume: 0.5 },
  { file: A("sfx/route_whoosh.mp3"), at: MERGE - 0.05, volume: 0.5 },
  { file: A("sfx/route_whoosh.mp3"), at: EXIT, volume: 0.55 },
  { file: "audio/sfx/mystic_glow.mp3", at: PATH + 0.2, volume: 0.35 },
  { file: A("sfx/path_hum.mp3"), at: PATH, dur: CARD - PATH, loop: true, volume: 0.24, fadeIn: 0.8, fadeOut: 0.5 },
  { file: "audio/sfx/cloak_flap.mp3", at: CLOSE, volume: 0.45 },
  { file: A("sfx/vanish.mp3"), at: VANISH - 0.2, volume: 0.65 },
  { file: "audio/sfx/suitcase_wheels.mp3", at: WALK, dur: CARD - WALK, loop: true, volume: 0.3, fadeIn: 0.3, fadeOut: 0.4 },
  { file: A("sfx/foil.mp3"), at: WALK + 1.4, volume: 0.3 },
  // голоса
  { file: A("hero_01.mp3"), at: H01, volume: 1 },
  { file: A("savior_01.mp3"), at: S01, volume: 1 },
  { file: A("hero_02.mp3"), at: H02, volume: 1 },
  { file: A("savior_02.mp3"), at: S02, volume: 1 },
  { file: A("hero_03.mp3"), at: H03, volume: 1 },
  { file: A("savior_03.mp3"), at: S03, volume: 1 },
  { file: A("hero_04.mp3"), at: H04, volume: 1 },
  { file: A("savior_04.mp3"), at: S04, volume: 1 },
  { file: A("narrator_01.mp3"), at: NARR, volume: 1 },
];

export const EP2: Episode = {
  id: "ep2",
  title: "Серия 2",
  subtitle: "Все пути по России",
  slogan: "Все пути по России",
  duration: END,
  storyTime: (t) => t,
  hero: heroAt,
  crowd: { count: FIG.length, at: crowdAt },
  savior: saviorAt,
  camera: (t, V) => shotCamera(shots(V), t),
  fx,
  fogCards: [
    { x: -15, y: 3.5, z: 2.0, s: 7, o: 0.45 },
    { x: -9, y: 1.4, z: 1.0, s: 5, o: 0.3 },
    { x: -3, y: 1.2, z: 1.4, s: 5, o: 0.22 },
    { x: 3.0, y: 1.0, z: -0.6, s: 4.5, o: 0.3 },
    { x: 6.2, y: 1.2, z: -1.4, s: 3.6, o: 0.32 },
    { x: 7.6, y: 0.8, z: -0.4, s: 3.0, o: 0.26 },
    { x: 5.0, y: 0.6, z: 1.8, s: 3.5, o: 0.2 },
  ],
  cardBeats: { logo: CARD + 0.3, subtitle: NARR + word("narrator_01", "Все", 0, 0.9) - 0.1, title: NARR + dur("narrator_01") + 0.15 },
  audio,
  scene: (st, t) => scene(st, t),
  overlay: (t, frame) => overlay(t, frame),
};
