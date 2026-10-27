import React, { useMemo } from "react";
import * as THREE from "three";
import { BRAND } from "../brand";
import { clamp, outBack, V3 } from "../lib/anim";

const SEGS = 600;
const RAD = 8;

/** Мягкая поперечная прозрачность для свечения дорожки на полу */
let haloTex: THREE.CanvasTexture | null = null;
const useHaloTex = () =>
  useMemo(() => {
    if (haloTex) return haloTex;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 4;
    const g = c.getContext("2d")!;
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, "rgb(0,0,0)");
    grd.addColorStop(0.5, "rgb(255,255,255)");
    grd.addColorStop(1, "rgb(0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 4);
    haloTex = new THREE.CanvasTexture(c);
    return haloTex;
  }, []);

/** Пин из логотипа в 3D: алая капля с тёмным «глазком» */
export const Pin3D: React.FC<{ pos: V3; scale: number; glow: number; yaw?: number }> = ({ pos, scale, glow, yaw = 0 }) => {
  if (scale <= 0.001) return null;
  return (
    <group position={pos} scale={scale} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.62, 0]}>
        <sphereGeometry args={[0.3, 32, 24]} />
        <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={glow} toneMapped={false} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.255, 0.5, 32, 1, true]} />
        <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={glow} toneMapped={false} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.62, 0.22]} scale={[1, 1, 0.5]}>
        <sphereGeometry args={[0.12, 20, 16]} />
        <meshStandardMaterial color={BRAND.black} roughness={0.5} />
      </mesh>
    </group>
  );
};

/**
 * Алая линия маршрута в 3D: начинается у экрана телефона, ложится на пол и уходит в туман.
 * grow — сколько метров уже прорисовано; stops — расстояния вдоль пути до точек остановок.
 */
export const RoutePath: React.FC<{
  points: V3[];
  grow: number;
  glow: number;
  stops?: number[];
  /** с какого расстояния путь лежит на полу (для свечения пола) */
  floorFrom?: number;
  /** сколько метров от начала уже «отцепилось» и исчезло (линия ложится на пол) */
  tail?: number;
  t: number;
}> = ({ points, grow, glow, stops = [], floorFrom = 0, tail = 0, t }) => {
  const halo = useHaloTex();
  const data = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    const tube = new THREE.TubeGeometry(curve, SEGS, 0.024, RAD, false);
    const len = curve.getLength();
    const pts = curve.getSpacedPoints(SEGS);
    // широкая полоса свечения по полу (индексы упорядочены вдоль пути — для drawRange)
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEGS; i++) {
      const p = pts[i];
      const q = pts[Math.min(SEGS, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize();
      const n = new THREE.Vector3(-q.z, 0, q.x).multiplyScalar(0.34);
      pos.push(p.x + n.x, 0.008, p.z + n.z, p.x - n.x, 0.008, p.z - n.z);
      uv.push(0, i / SEGS, 1, i / SEGS);
      if (i < SEGS) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    ribbon.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    ribbon.setIndex(idx);
    return { curve, tube, ribbon, len, pts };
  }, [points]);
  const k = clamp(grow / data.len);
  if (k <= 0) return null;
  const n = Math.max(1, Math.floor(k * SEGS));
  const n0 = Math.min(n - 1, Math.floor(clamp(tail / data.len) * SEGS));
  data.tube.setDrawRange(n0 * RAD * 6, (n - n0) * RAD * 6);
  const f0 = Math.floor(clamp(floorFrom / data.len) * SEGS);
  data.ribbon.setDrawRange(f0 * 6, Math.max(0, n - f0) * 6);
  const tip = data.curve.getPointAt(k);
  const flicker = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
  return (
    <group>
      <mesh geometry={data.tube}>
        <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={glow * flicker} toneMapped={false} roughness={0.3} />
      </mesh>
      {n > f0 && (
        <mesh geometry={data.ribbon}>
          <meshBasicMaterial
            color={BRAND.red}
            alphaMap={halo}
            transparent
            opacity={0.55 * Math.min(1, glow / 3)}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {/* «голова» линии */}
      {k < 0.999 && (
        <mesh position={tip}>
          <sphereGeometry args={[0.05, 16, 12]} />
          <meshBasicMaterial color="#ffd9d9" toneMapped={false} />
        </mesh>
      )}
      <pointLight position={[tip.x, Math.max(0.25, tip.y), tip.z]} color={BRAND.red} intensity={2.2 * Math.min(1, glow / 3)} distance={4} decay={2} />
      {/* точки остановок */}
      {stops.map((d, i) => {
        const s = outBack(clamp((grow - d) / 0.5));
        if (s <= 0) return null;
        const p = data.curve.getPointAt(clamp(d / data.len));
        return (
          <group key={i} position={[p.x, 0.012, p.z]} scale={s}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.07, 0.11, 32]} />
              <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={glow} toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
              <circleGeometry args={[0.07, 32]} />
              <meshBasicMaterial color={BRAND.white} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
