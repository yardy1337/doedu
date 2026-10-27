import * as THREE from "three";
import { clamp, lerp } from "../lib/anim";

/**
 * Риг человечка «Доеду». Локальная система: смотрит вдоль +Z, левая рука — +X.
 * Углы в радианах:
 *  - pitch конечности: + вперёд; roll: + наружу; bend (локоть/колено): + сгиб.
 *  - lean: наклон корпуса вперёд; twist: поворот груди относительно таза;
 *  - headYaw: + влево; headPitch: + вниз.
 */
export type Limb = { pitch: number; roll: number; bend: number };
export type Pose = {
  x: number;
  z: number;
  yaw: number; // поворот всего тела (rotation.y): π/2 — смотрит вдоль +X мира
  lift: number; // смещение таза по вертикали (прыжок/сидение); 0 = стоит на полу
  lean: number;
  side: number;
  twist: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** не «приземлять» по ногам (для сидения у стены — таз задаётся lift от пола) */
  seated?: boolean;
};

export const DIMS = {
  torso: 0.52,
  neck: 0.05,
  headR: 0.2,
  shoulderX: 0.12,
  shoulderY: 0.46,
  hipX: 0.085,
  upperArm: 0.3,
  foreArm: 0.28,
  thigh: 0.42,
  shin: 0.4,
  limbR: 0.055,
  torsoR: 0.075,
};

const L = (pitch = 0, roll = 0.05, bend = 0.1): Limb => ({ pitch, roll, bend });

export const STAND: Pose = {
  x: 0,
  z: 0,
  yaw: 0,
  lift: 0,
  lean: 0.02,
  side: 0,
  twist: 0,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  armL: L(0.05, 0.12, 0.15),
  armR: L(0.05, 0.12, 0.15),
  legL: L(0, 0.04, 0.02),
  legR: L(0, 0.04, 0.02),
};

const mixLimb = (a: Limb, b: Limb, t: number): Limb => ({
  pitch: lerp(a.pitch, b.pitch, t),
  roll: lerp(a.roll, b.roll, t),
  bend: lerp(a.bend, b.bend, t),
});

export const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  z: lerp(a.z, b.z, t),
  yaw: lerp(a.yaw, b.yaw, t),
  lift: lerp(a.lift, b.lift, t),
  lean: lerp(a.lean, b.lean, t),
  side: lerp(a.side, b.side, t),
  twist: lerp(a.twist, b.twist, t),
  headYaw: lerp(a.headYaw, b.headYaw, t),
  headPitch: lerp(a.headPitch, b.headPitch, t),
  headRoll: lerp(a.headRoll, b.headRoll, t),
  armL: mixLimb(a.armL, b.armL, t),
  armR: mixLimb(a.armR, b.armR, t),
  legL: mixLimb(a.legL, b.legL, t),
  legR: mixLimb(a.legR, b.legR, t),
  seated: t < 0.5 ? a.seated : b.seated,
});

export const withPose = (p: Pose, d: Partial<Pose>): Pose => ({ ...p, ...d });

/**
 * Процедурная походка. phase — фаза шага (рад), amount — 0..1 (стоит → идёт),
 * run — 0..1 (шаг → бег). Возвращает конечности/наклон поверх базовой позы.
 */
export const walk = (base: Pose, phase: number, amount: number, run = 0): Pose => {
  const a = clamp(amount);
  const legAmp = lerp(0.42, 0.6, run) * a;
  const armAmp = lerp(0.4, 0.9, run) * a;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const leg = (sgn: number): Limb => ({
    pitch: sgn * s * legAmp,
    roll: 0.03,
    bend: (0.08 + Math.max(0, sgn * c) * lerp(0.75, 1.4, run)) * a + 0.02,
  });
  const arm = (sgn: number): Limb => ({
    pitch: -sgn * s * armAmp + 0.05,
    roll: 0.12,
    bend: (0.25 + lerp(0, 1.1, run) + Math.max(0, -sgn * s) * 0.25) * a + 0.15 * (1 - a),
  });
  return {
    ...base,
    lean: base.lean + lerp(0.05, 0.28, run) * a,
    side: base.side + Math.sin(phase) * 0.03 * a,
    headPitch: base.headPitch - lerp(0.02, 0.15, run) * a,
    legL: mixLimb(base.legL, leg(1), a),
    legR: mixLimb(base.legR, leg(-1), a),
    armL: mixLimb(base.armL, arm(1), a),
    armR: mixLimb(base.armR, arm(-1), a),
  };
};

/** Высота таза над полом, чтобы нижняя точка ног касалась пола */
export const pelvisHeight = (p: Pose) => {
  if (p.seated) return DIMS.limbR + 0.06 + p.lift;
  const ext = (l: Limb) =>
    DIMS.thigh * Math.cos(l.pitch) * Math.cos(l.roll) + DIMS.shin * Math.cos(l.pitch - l.bend) * Math.cos(l.roll);
  return Math.max(ext(p.legL), ext(p.legR)) + DIMS.limbR + p.lift;
};

// ---------------------------------------------------------------------
// Прямая кинематика (повторяет иерархию в Stickman3D) — для камеры и реквизита
// ---------------------------------------------------------------------
const m4 = () => new THREE.Matrix4();
const rot = (x: number, y: number, z: number) => m4().makeRotationFromEuler(new THREE.Euler(x, y, z, "XYZ"));
const tr = (x: number, y: number, z: number) => m4().makeTranslation(x, y, z);

export const rigMatrices = (p: Pose, scale = 1) => {
  const root = tr(p.x, 0, p.z).multiply(rot(0, p.yaw, 0)).multiply(m4().makeScale(scale, scale, scale));
  const pelvis = root.clone().multiply(tr(0, pelvisHeight(p), 0)).multiply(rot(p.lean, 0, p.side));
  const chest = pelvis.clone().multiply(rot(0, p.twist, 0));
  const head = chest
    .clone()
    .multiply(tr(0, DIMS.torso + DIMS.neck, 0))
    .multiply(rot(p.headPitch, p.headYaw, p.headRoll))
    .multiply(tr(0, DIMS.headR, 0));
  const hand = (sideSign: 1 | -1, l: Limb) =>
    chest
      .clone()
      .multiply(tr(sideSign * DIMS.shoulderX, DIMS.shoulderY, 0))
      .multiply(rot(-l.pitch, 0, sideSign * l.roll))
      .multiply(tr(0, -DIMS.upperArm, 0))
      .multiply(rot(-l.bend, 0, 0))
      .multiply(tr(0, -DIMS.foreArm, 0));
  return { root, pelvis, chest, head, handL: hand(1, p.armL), handR: hand(-1, p.armR) };
};

export const pointOf = (m: THREE.Matrix4, local: [number, number, number] = [0, 0, 0]): [number, number, number] => {
  const v = new THREE.Vector3(...local).applyMatrix4(m);
  return [v.x, v.y, v.z];
};
