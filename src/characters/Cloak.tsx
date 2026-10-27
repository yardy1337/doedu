import React, { useMemo } from "react";
import * as THREE from "three";
import { BRAND } from "../brand";

/**
 * Длинный плащ с высоким воротом. Сетка — разрезанный спереди цилиндр;
 * вершины смещаются волной, рассчитанной только от времени t (детерминированно).
 */
export const Cloak: React.FC<{ t: number; wind: number; top: number; length: number }> = ({ t, wind, top, length }) => {
  const RAD = 30;
  const HSEG = 22;
  const OPEN = 0.95; // ширина разреза спереди (рад)
  const base = useMemo(() => {
    // theta = 0 у CylinderGeometry смотрит в +Z (вперёд) — там и оставляем разрез
    return new THREE.CylinderGeometry(0.16, 0.42, length, RAD, HSEG, true, OPEN / 2, Math.PI * 2 - OPEN);
  }, [length]);
  const geom = useMemo(() => base.clone(), [base]);
  const src = base.attributes.position as THREE.BufferAttribute;
  const dst = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i);
    const y = src.getY(i);
    const z = src.getZ(i);
    const v = (length / 2 - y) / length; // 0 — плечи, 1 — низ
    const a = Math.atan2(x, z);
    const back = Math.max(0, -Math.cos(a)); // задняя часть плаща
    const wave = Math.sin(a * 3 + t * 3.1 - v * 5) * 0.5 + Math.sin(a * 5 - t * 4.3 + v * 3) * 0.25;
    const amp = wind * Math.pow(v, 1.4);
    const r = 1 + wave * 0.2 * amp;
    dst.setXYZ(
      i,
      x * r + Math.sin(t * 2.3 + v * 3) * 0.04 * amp,
      y + Math.sin(t * 3.7 + a * 2) * 0.03 * amp,
      z * r - back * (0.28 + Math.sin(t * 2.7 - v * 4 + a) * 0.12) * amp,
    );
  }
  dst.needsUpdate = true;
  geom.computeVertexNormals();
  // нулевые нормали дают NaN в шейдере (а bloom размазывает NaN на весь кадр)
  const n = geom.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    if (!(nx * nx + ny * ny + nz * nz > 1e-8)) n.setXYZ(i, 0, 0, 1);
  }
  return (
    <group position={[0, top - length / 2, 0]}>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial color={BRAND.black} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

/** Высокий ворот-капюшон вокруг головы */
export const Collar: React.FC<{ y: number }> = ({ y }) => {
  const g = useMemo(() => {
    return new THREE.CylinderGeometry(0.25, 0.17, 0.28, 28, 1, true, 0.6, Math.PI * 2 - 1.2);
  }, []);
  return (
    <mesh geometry={g} position={[0, y, -0.02]} castShadow>
      <meshStandardMaterial color={BRAND.black} roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
  );
};

/** Буква «Д», светящаяся алым (emissive → bloom) */
export const LetterD: React.FC<{ glow: number; size?: number }> = ({ glow, size = 0.2 }) => {
  const geom = useMemo(() => {
    const rect = (x0: number, y0: number, x1: number, y1: number) => {
      const s = new THREE.Shape();
      s.moveTo(x0, y0);
      s.lineTo(x1, y0);
      s.lineTo(x1, y1);
      s.lineTo(x0, y1);
      s.closePath();
      return s;
    };
    const shapes = [
      rect(-0.5, 0, 0.5, 0.17), // основание
      rect(-0.5, -0.24, -0.36, 0), // ножки
      rect(0.36, -0.24, 0.5, 0),
      rect(-0.3, 0.17, -0.15, 1), // левая стойка
      rect(0.2, 0.17, 0.35, 1), // правая стойка
      rect(-0.3, 0.85, 0.35, 1), // верх
    ];
    const g = new THREE.ExtrudeGeometry(shapes, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    g.translate(0, -0.38, 0);
    return g;
  }, []);
  return (
    <mesh geometry={geom} scale={[size, size, size]}>
      <meshStandardMaterial color={BRAND.red} emissive={BRAND.red} emissiveIntensity={glow} toneMapped={false} roughness={0.4} />
    </mesh>
  );
};
