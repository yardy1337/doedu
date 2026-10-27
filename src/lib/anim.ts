// Детерминированные хелперы анимации: всё — функции от времени t (секунды).
export type V3 = [number, number, number];
export type Ease = (t: number) => number;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const linear: Ease = (t) => t;
export const smooth: Ease = (t) => t * t * (3 - 2 * t);
export const inOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const out: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const inn: Ease = (t) => t * t * t;
export const outBack: Ease = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

/** 0→1 между секундами a и b */
export const ramp = (t: number, a: number, b: number, e: Ease = inOut) => e(clamp((t - a) / (b - a)));
/** 0→1→0: вход a..b, выход c..d */
export const pulse = (t: number, a: number, b: number, c: number, d: number, e: Ease = inOut) =>
  ramp(t, a, b, e) * (1 - ramp(t, c, d, e));

/** Ключи [секунда, значение, easing-до-этого-ключа] */
export function track(t: number, keys: [number, number, Ease?][]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t < t1) return lerp(v0, v1, (e ?? inOut)((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
export function track3(t: number, keys: [number, V3, Ease?][]): V3 {
  return [0, 1, 2].map((k) => track(t, keys.map(([s, v, e]) => [s, v[k], e] as [number, number, Ease?]))) as V3;
}

/** Затухающая тряска (детерминированная) */
export const shake = (t: number, at: number, dur: number, amp: number, seed = 1) => {
  if (t < at || t > at + dur) return 0;
  const k = (t - at) / dur;
  return Math.sin((t - at) * 55 + seed * 1.7) * Math.sin((t - at) * 31 + seed) * amp * (1 - k) * (1 - k);
};

/** Сидированный PRNG (mulberry32) — вместо Math.random */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
};

/** Угол кратчайшим путём */
export const angleLerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
