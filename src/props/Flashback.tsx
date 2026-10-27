import React, { useMemo } from "react";
import * as THREE from "three";
import { BRAND } from "../brand";
import { FONT } from "../fonts";
import { roundRect, useCanvasTexture } from "../lib/canvasTexture";
import { clamp, rng, V3 } from "../lib/anim";

export type SignIcon = "plane" | "train" | "car";

const drawSignIcon = (g: CanvasRenderingContext2D, icon: SignIcon, x: number, y: number, s: number) => {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#ffffff";
  g.lineCap = "round";
  g.lineJoin = "round";
  if (icon === "plane") {
    g.rotate(-Math.PI / 4);
    g.beginPath();
    g.ellipse(0, 0, 9, 46, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(-44, 10);
    g.lineTo(-44, 18);
    g.lineTo(-6, 10);
    g.moveTo(6, -8);
    g.lineTo(44, 10);
    g.lineTo(44, 18);
    g.lineTo(6, 10);
    g.moveTo(-4, 30);
    g.lineTo(-18, 42);
    g.lineTo(-18, 46);
    g.lineTo(4, 38);
    g.lineTo(18, 46);
    g.lineTo(18, 42);
    g.lineTo(4, 30);
    g.fill();
  } else if (icon === "train") {
    roundRect(g, -30, -42, 60, 68, 16);
    g.fill();
    g.fillStyle = "#2a2a2a";
    roundRect(g, -21, -33, 42, 24, 6);
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
  } else {
    // легковушка
    g.beginPath();
    g.moveTo(-46, 16);
    g.lineTo(-46, -2);
    g.lineTo(-30, -6);
    g.lineTo(-18, -26);
    g.lineTo(20, -26);
    g.lineTo(32, -6);
    g.lineTo(46, -2);
    g.lineTo(46, 16);
    g.closePath();
    g.fill();
    g.fillStyle = "#2a2a2a";
    g.beginPath();
    g.moveTo(-14, -20);
    g.lineTo(-24, -6);
    g.lineTo(-2, -6);
    g.lineTo(-2, -20);
    g.moveTo(4, -20);
    g.lineTo(4, -6);
    g.lineTo(26, -6);
    g.lineTo(16, -20);
    g.fill();
    g.beginPath();
    g.arc(-26, 18, 12, 0, Math.PI * 2);
    g.arc(26, 18, 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(-26, 18, 6, 0, Math.PI * 2);
    g.arc(26, 18, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
};

/** Парящая табличка с названием «сервиса»: «ТолькоАвиа» и т.п. */
export const Sign: React.FC<{ text: string; icon: SignIcon; pos: V3; yaw: number; tilt?: number; scale?: number; fall?: number }> = ({
  text,
  icon,
  pos,
  yaw,
  tilt = 0,
  scale = 1,
}) => {
  const W = 2.3;
  const H = 0.56;
  const tex = useCanvasTexture(1150, 280, (g, w, h) => {
    g.fillStyle = "#262626";
    roundRect(g, 0, 0, w, h, 60);
    g.fill();
    g.strokeStyle = "#8a8a8a";
    g.lineWidth = 10;
    roundRect(g, 10, 10, w - 20, h - 20, 52);
    g.stroke();
    drawSignIcon(g, icon, 150, h / 2, 150);
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.font = `900 132px ${FONT}`;
    g.fillText(text, 255, h / 2 + 8, w - 290);
  });
  return (
    <group position={pos} rotation={[tilt, yaw, 0]} scale={scale}>
      {/* тросики */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, H / 2 + 0.9, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 1.8, 6]} />
          <meshStandardMaterial color={BRAND.grey.g40} />
        </mesh>
      ))}
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.55} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

/** Светящаяся дверь — вход в «свою экосистему» */
export const GlowDoor: React.FC<{ pos: V3; yaw: number; glow: number; open?: number }> = ({ pos, yaw, glow, open = 1 }) => {
  const W = 1.15;
  const H = 2.3;
  const T = 0.12;
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      <mesh position={[0, H / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={clamp(glow / 2) * open} />
      </mesh>
      {/* наличник */}
      {[
        [-W / 2 - T / 2, H / 2, T, H + T],
        [W / 2 + T / 2, H / 2, T, H + T],
        [0, H + T / 2, W + 2 * T, T],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.02]}>
          <boxGeometry args={[w, h, 0.16]} />
          <meshStandardMaterial color="#3a3a3a" roughness={0.7} />
        </mesh>
      ))}
      {/* свет из проёма на пол */}
      <mesh position={[0, 0.006, 0.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * 1.1, 1.8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12 * clamp(glow / 2) * open} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight position={[0, 1.2, 0.6]} intensity={2.5 * glow * open} distance={5} decay={2} color="#ffffff" />
    </group>
  );
};

/** Верёвка по точкам (провисание задаётся точками) */
export const Rope: React.FC<{ points: V3[]; radius?: number }> = ({ points, radius = 0.02 }) => {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, Math.max(8, points.length * 10), radius, 6, false]} />
      <meshStandardMaterial color="#9c9c9c" roughness={0.95} />
    </mesh>
  );
};

/** Провисающая верёвка между двумя точками: sag — глубина провиса */
export const sagRope = (a: V3, b: V3, sag: number, n = 8): V3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (b[2] - a[2]) * u] as V3;
  });

/**
 * Пыль, в которую рассыпаются фигуры: облака серых частиц вокруг заданных точек.
 * k 0..1 — время рассыпания (частицы разлетаются, падают и тают).
 */
export const Dust: React.FC<{ centers: V3[]; k: number; seed?: number; perCenter?: number; color?: string }> = ({
  centers,
  k,
  seed = 9,
  perCenter = 46,
  color = "#7d7d7d",
}) => {
  const count = centers.length * perCenter;
  const seeds = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, () => ({
      ox: (r() - 0.5) * 0.35,
      oy: r() * 1.9,
      oz: (r() - 0.5) * 0.25,
      vx: (r() - 0.5) * 2.4,
      vy: 0.4 + r() * 1.6,
      vz: (r() - 0.5) * 2.4,
      s: 0.025 + r() * 0.05,
      spin: r() * 6,
      delay: r() * 0.35,
    }));
  }, [count, seed]);
  const mesh = useMemo(() => new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), count), [count, color]);
  if (k <= 0 || k >= 1) return null;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  seeds.forEach((s, i) => {
    const c = centers[Math.floor(i / perCenter)];
    const tt = clamp((k - s.delay) / (1 - s.delay)) * 1.6; // «секунды» разлёта
    const x = c[0] + s.ox + s.vx * tt;
    const y = Math.max(0.02, c[1] + s.oy + s.vy * tt - 2.6 * tt * tt);
    const z = c[2] + s.oz + s.vz * tt;
    const sc = s.s * (1 - clamp((k - 0.55) / 0.45)) * (k > s.delay ? 1 : 0);
    e.set(s.spin * tt, s.spin * 1.3 * tt, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, sc));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

/** Нагрудная подсветка таблички, чтобы читалась в тумане */
export const SignLight: React.FC<{ pos: V3 }> = ({ pos }) => <pointLight position={pos} intensity={1.2} distance={3} decay={2} color="#ffffff" />;
