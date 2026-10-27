import React, { useMemo } from "react";
import * as THREE from "three";
import { rng, V3 } from "../lib/anim";

/**
 * Обёртка от шаурмы: смятый комок фольги с прилипшей бумажкой.
 * Геометрия — сидированная (детерминированная); плоские грани фольги ловят блики фонарей.
 */
const useCrumpled = () =>
  useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 3);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const r = rng(2077);
    // сдвиги по «складкам»: несколько случайных плоскостей, вершины по одну сторону вдавлены
    const folds = Array.from({ length: 9 }, () => ({
      n: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      d: (r() - 0.5) * 0.9,
      k: 0.12 + r() * 0.22,
    }));
    const v = new THREE.Vector3();
    // IcosahedronGeometry не индексирована: одинаковые вершины должны сместиться одинаково
    const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    const cache = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = key(v.x, v.y, v.z);
      let out = cache.get(k);
      if (!out) {
        let s = 1;
        for (const f of folds) {
          const side = v.dot(f.n) - f.d;
          s -= Math.max(0, Math.tanh(side * 3)) * f.k * 0.5;
        }
        s += (r() - 0.5) * 0.16; // мелкие заломы
        out = [v.x * s, v.y * s * 0.62, v.z * s];
        cache.set(k, out);
      }
      pos.setXYZ(i, out[0], out[1], out[2]);
    }
    g.computeVertexNormals();
    return g;
  }, []);

const usePaper = () =>
  useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 0.7, 10, 7);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const r = rng(404);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // бумажка обнимает комок: загибается по цилиндру + мятые волны
      const ang = x * 2.2;
      const R = 0.62;
      pos.setXYZ(i, Math.sin(ang) * R, y * 0.85 + Math.sin(x * 9) * 0.02, Math.cos(ang) * R - R * 0.35 + (r() - 0.5) * 0.06);
    }
    g.computeVertexNormals();
    return g;
  }, []);

export const WRAPPER_SIZE = 0.11;

export const Wrapper: React.FC<{ pos: V3; rot: V3; scale?: number; visible?: boolean }> = ({ pos, rot, scale = 1, visible = true }) => {
  const foil = useCrumpled();
  const paper = usePaper();
  if (!visible) return null;
  const s = WRAPPER_SIZE * scale;
  return (
    <group position={pos} rotation={rot} scale={s}>
      <mesh geometry={foil} castShadow>
        <meshStandardMaterial color="#d6d6d6" metalness={0.85} roughness={0.22} flatShading />
      </mesh>
      <mesh geometry={paper} position={[0.05, 0.02, 0.18]} rotation={[0.25, 0.4, 0.15]} castShadow>
        <meshStandardMaterial color="#e2e2e2" roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};
