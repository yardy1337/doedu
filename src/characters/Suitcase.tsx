import React from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { BRAND } from "../brand";

const BODY_H = 0.5;
const WHEEL_R = 0.035;

/** Корпус чемодана: начало координат — ось колёсиков, корпус вверх по +Y */
export const SuitcaseBody: React.FC<{ handle: number }> = ({ handle }) => (
  <group>
    <RoundedBox args={[0.36, BODY_H, 0.2]} radius={0.05} smoothness={4} position={[0, WHEEL_R + BODY_H / 2, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={BRAND.red} roughness={0.45} />
    </RoundedBox>
    {/* рёбра жёсткости */}
    {[-0.09, 0, 0.09].map((x) => (
      <mesh key={x} position={[x, WHEEL_R + BODY_H / 2, 0.101]}>
        <boxGeometry args={[0.012, BODY_H * 0.86, 0.006]} />
        <meshStandardMaterial color="#b3171c" roughness={0.5} />
      </mesh>
    ))}
    {/* колёсики */}
    {[-0.13, 0.13].map((x) => (
      <mesh key={x} position={[x, WHEEL_R, -0.07]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.03, 16]} />
        <meshStandardMaterial color={BRAND.grey.g15} roughness={0.6} />
      </mesh>
    ))}
    {/* выдвижная ручка */}
    {handle > 0.02 &&
      [-0.08, 0.08].map((x) => (
        <mesh key={x} position={[x, WHEEL_R + BODY_H + handle / 2, -0.06]}>
          <cylinderGeometry args={[0.009, 0.009, handle, 8]} />
          <meshStandardMaterial color={BRAND.grey.g50} roughness={0.35} metalness={0.6} />
        </mesh>
      ))}
    {handle > 0.02 && (
      <mesh position={[0, WHEEL_R + BODY_H + handle, -0.06]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.016, 0.16, 4, 8]} />
        <meshStandardMaterial color={BRAND.grey.g20} roughness={0.6} />
      </mesh>
    )}
  </group>
);

/** Чемодан, который тянут за ручку: колёса в точке wheel, верх ручки — в руке (hand) */
export const TowedSuitcase: React.FC<{ wheel: [number, number, number]; hand: [number, number, number] }> = ({ wheel, hand }) => {
  const dir = new THREE.Vector3(hand[0] - wheel[0], hand[1] - wheel[1], hand[2] - wheel[2]);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return (
    <group position={wheel} rotation={e}>
      <SuitcaseBody handle={Math.max(0.05, len - BODY_H - WHEEL_R)} />
    </group>
  );
};

/** Чемодан, упавший набок: fall 0..1 (с отскоком) */
export const FallingSuitcase: React.FC<{ pos: [number, number, number]; yaw: number; fall: number; tilt0: number }> = ({
  pos,
  yaw,
  fall,
  tilt0,
}) => {
  // поворот вокруг нижнего ребра: от tilt0 до 90°
  const ang = tilt0 + (Math.PI / 2 - tilt0) * fall;
  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      <group position={[0.18, 0, 0]} rotation={[0, 0, -ang]}>
        <group position={[-0.18, 0, 0]}>
          <SuitcaseBody handle={0.05} />
        </group>
      </group>
    </group>
  );
};
