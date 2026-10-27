// Общие хелперы сценариев серий: ходьба по траектории, моргания, точки скелета, склейка планов.
import { CameraState } from "../camera/CameraRig";
import { Limb, pointOf, Pose, rigMatrices } from "../characters/rig";
import { clamp, inOut, lerp, lerp3, pulse, V3 } from "../lib/anim";

/** Ходьба по траектории: фаза шага интегрируется по пройденному пути */
const stride = (v: number) => 0.95 + 0.45 * clamp(v / 3.2);
const STEP = 1 / 30;
export function walker(t: number, pos: (t: number) => [number, number], from: number) {
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

/** Моргания в заданные моменты */
export const blinkAt = (t: number, times: number[]) => Math.max(0, ...times.map((b) => pulse(t, b, b + 0.06, b + 0.1, b + 0.2)));

export const mixLimbs = (a: Limb, b: Limb, k: number): Limb => ({
  pitch: lerp(a.pitch, b.pitch, k),
  roll: lerp(a.roll, b.roll, k),
  bend: lerp(a.bend, b.bend, k),
});

export const headOf = (p: Pose, scale = 1): V3 => pointOf(rigMatrices(p, scale).head) as V3;
export const handOf = (p: Pose, scale = 1): V3 => pointOf(rigMatrices(p, scale).handR) as V3;

export type Shot = { from: number; to: number; cam: (t: number) => CameraState; blend?: number };

/** Камера из списка планов; blend — мягкая склейка с предыдущим планом (сек) */
export function shotCamera(list: Shot[], t: number): CameraState {
  const i = Math.max(0, list.findIndex((s) => t >= s.from && t < s.to));
  const cur = list[i];
  const c = cur.cam(t);
  if (cur.blend && i > 0 && t < cur.from + cur.blend) {
    const prev = list[i - 1].cam(t);
    const k = inOut(clamp((t - cur.from) / cur.blend));
    return { pos: lerp3(prev.pos, c.pos, k), target: lerp3(prev.target, c.target, k), fov: lerp(prev.fov, c.fov, k), roll: lerp(prev.roll ?? 0, c.roll ?? 0, k) };
  }
  return c;
}
