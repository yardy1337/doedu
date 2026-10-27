import React from "react";
import { BRAND } from "../brand";
import { DIMS, Limb, pelvisHeight, Pose } from "./rig";

export type Eyes = {
  blink: number; // 0..1 — закрыты
  lookX: number; // -1..1 — косится влево/вправо (от лица персонажа: + влево)
  lookY: number; // -1..1 — вверх/вниз
  wide: number; // 0..1 — расширены от страха
  squeeze: number; // 0..1 — зажмурился (дуги)
  openL: number; // 1 — открыт; можно открывать по одному
  openR: number;
};
export const EYES_DEFAULT: Eyes = { blink: 0, lookX: 0, lookY: 0, wide: 0, squeeze: 0, openL: 1, openR: 1 };

export type Look = {
  color: string;
  roughness?: number;
  /** безликий (толпа) */
  faceless?: boolean;
  scale?: number;
  limbR?: number;
};

const Capsule: React.FC<{ length: number; radius: number; mat: React.ReactNode; down?: boolean }> = ({
  length,
  radius,
  mat,
  down = true,
}) => (
  <mesh position={[0, (down ? -1 : 1) * length / 2, 0]} castShadow receiveShadow>
    <capsuleGeometry args={[radius, Math.max(0.001, length), 6, 14]} />
    {mat}
  </mesh>
);

const Arm: React.FC<{ side: 1 | -1; l: Limb; mat: React.ReactNode; r: number; hand?: React.ReactNode }> = ({
  side,
  l,
  mat,
  r,
  hand,
}) => (
  <group position={[side * DIMS.shoulderX, DIMS.shoulderY, 0]} rotation={[-l.pitch, 0, side * l.roll]}>
    <Capsule length={DIMS.upperArm} radius={r} mat={mat} />
    <group position={[0, -DIMS.upperArm, 0]} rotation={[-l.bend, 0, 0]}>
      <Capsule length={DIMS.foreArm} radius={r * 0.95} mat={mat} />
      <group position={[0, -DIMS.foreArm, 0]}>{hand}</group>
    </group>
  </group>
);

const Leg: React.FC<{ side: 1 | -1; l: Limb; mat: React.ReactNode; r: number }> = ({ side, l, mat, r }) => (
  <group position={[side * DIMS.hipX, 0, 0]} rotation={[-l.pitch, 0, side * l.roll]}>
    <Capsule length={DIMS.thigh} radius={r * 1.08} mat={mat} />
    <group position={[0, -DIMS.thigh, 0]} rotation={[l.bend, 0, 0]}>
      <Capsule length={DIMS.shin} radius={r} mat={mat} />
    </group>
  </group>
);

/** Один глаз: овал, моргает/расширяется; при зажмуривании — дуга */
const Eye: React.FC<{ side: 1 | -1; e: Eyes; open: number }> = ({ side, e, open }) => {
  const R = DIMS.headR;
  const yaw = side * 0.34 + e.lookX * 0.12;
  const pitch = -0.1 - e.lookY * 0.1;
  const sy = Math.max(0.04, (1 - e.blink) * open * (1 + e.wide * 0.45));
  const sx = 1 + e.wide * 0.3;
  const squeeze = e.squeeze > 0.5;
  return (
    <group rotation={[pitch, yaw, 0]}>
      <group position={[0, 0, R * 0.965]}>
        {squeeze ? (
          <mesh rotation={[0, 0, side * 0.15]} position={[0, -0.01, 0.004]}>
            <torusGeometry args={[0.03, 0.008, 8, 16, Math.PI]} />
            <meshStandardMaterial color={BRAND.black} roughness={0.4} />
          </mesh>
        ) : (
          <mesh scale={[0.034 * sx, 0.054 * sy, 0.018]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshStandardMaterial color={BRAND.black} roughness={0.25} metalness={0.1} />
          </mesh>
        )}
      </group>
    </group>
  );
};

/** Блестящая капля пота: t 0..1 — путь от линии роста вниз по лбу */
const Sweat: React.FC<{ t: number }> = ({ t }) => {
  if (t <= 0 || t >= 1) return null;
  const R = DIMS.headR;
  const pitch = -0.75 + t * 0.85; // сверху вниз по лбу
  const grow = Math.min(1, t * 4);
  return (
    <group rotation={[pitch, -0.12, 0]}>
      <group position={[0, 0, R * 1.0]}>
        <mesh scale={[0.021 * grow, 0.032 * grow, 0.016 * grow]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshPhysicalMaterial color={BRAND.grey.g60} roughness={0.02} metalness={0.55} clearcoat={1} clearcoatRoughness={0} />
        </mesh>
        {/* блик */}
        <mesh position={[0.006 * grow, 0.012 * grow, 0.014 * grow]} scale={0.0055 * grow}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={BRAND.white} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
};

export const Stickman3D: React.FC<{
  pose: Pose;
  look: Look;
  eyes?: Eyes;
  sweat?: number;
  handR?: React.ReactNode;
  handL?: React.ReactNode;
  chest?: React.ReactNode; // крепления на груди (буква «Д»)
  body?: React.ReactNode; // крепления к тазу (плащ)
  children?: React.ReactNode; // в локальных координатах корня
}> = ({ pose: p, look, eyes = EYES_DEFAULT, sweat = 0, handR, handL, chest, body, children }) => {
  const r = look.limbR ?? DIMS.limbR;
  const mat = <meshStandardMaterial color={look.color} roughness={look.roughness ?? 0.7} metalness={0} />;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, p.yaw, 0]} scale={look.scale ?? 1}>
      <group position={[0, pelvisHeight(p), 0]} rotation={[p.lean, 0, p.side]}>
        <Leg side={1} l={p.legL} mat={mat} r={r} />
        <Leg side={-1} l={p.legR} mat={mat} r={r} />
        {body}
        <group rotation={[0, p.twist, 0]}>
          <Capsule length={DIMS.torso} radius={DIMS.torsoR} mat={mat} down={false} />
          <Arm side={1} l={p.armL} mat={mat} r={r} hand={handL} />
          <Arm side={-1} l={p.armR} mat={mat} r={r} hand={handR} />
          {chest}
          <group position={[0, DIMS.torso + DIMS.neck, 0]} rotation={[p.headPitch, p.headYaw, p.headRoll]}>
            <group position={[0, DIMS.headR, 0]}>
              <mesh castShadow receiveShadow>
                <sphereGeometry args={[DIMS.headR, 40, 28]} />
                {mat}
              </mesh>
              {!look.faceless && (
                <>
                  <Eye side={1} e={eyes} open={eyes.openL} />
                  <Eye side={-1} e={eyes} open={eyes.openR} />
                  <Sweat t={sweat} />
                </>
              )}
            </group>
          </group>
        </group>
      </group>
      {children}
    </group>
  );
};
