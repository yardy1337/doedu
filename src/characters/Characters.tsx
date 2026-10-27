import React from "react";
import { RoundedBox } from "@react-three/drei";
import { BRAND } from "../brand";
import { FONT } from "../fonts";
import { useCanvasTexture } from "../lib/canvasTexture";
import { Cloak, Collar, LetterD } from "./Cloak";
import { DIMS, Pose, withPose } from "./rig";
import { Eyes, Stickman3D } from "./Stickman3D";

/** Герой: белый человечек из логотипа */
export const HERO_LOOK = { color: BRAND.white, roughness: 0.62 };
export const Hero: React.FC<{ pose: Pose; eyes: Eyes; sweat?: number; children?: React.ReactNode; handR?: React.ReactNode; handL?: React.ReactNode }> = (p) => (
  <Stickman3D pose={p.pose} eyes={p.eyes} sweat={p.sweat} look={HERO_LOOK} handR={p.handR} handL={p.handL}>
    {p.children}
  </Stickman3D>
);

/** Человек из толпы: тёмно-серый, выше героя, без лица */
export const CrowdPerson: React.FC<{ pose: Pose; scale: number; shade?: string; handR?: React.ReactNode; handL?: React.ReactNode }> = ({
  pose,
  scale,
  shade,
  handR,
  handL,
}) => <Stickman3D pose={pose} handR={handR} handL={handL} look={{ color: shade ?? BRAND.grey.g30, roughness: 0.85, faceless: true, scale, limbR: 0.05 }} />;

export const SLOGAN = "Все пути по России";

/**
 * Эмблема под плащом: тёмная нагрудная пластина, крупная алая «Д» и под ней
 * мелкая надпись «Все пути по России» (Montserrat, белая). reveal 0..1 — проявление надписи.
 */
const ChestEmblem: React.FC<{ glow: number; reveal: number }> = ({ glow, reveal }) => {
  const W = 0.34;
  const textTex = useCanvasTexture(1024, 128, (g, w, h) => {
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `700 76px ${FONT}`;
    g.fillText(SLOGAN, w / 2, h / 2 + 4, w - 20);
  });
  return (
    <group>
      <RoundedBox args={[W, 0.42, 0.045]} radius={0.02} smoothness={3} position={[0, -0.08, -0.012]}>
        <meshStandardMaterial color="#151515" roughness={0.55} metalness={0.15} />
      </RoundedBox>
      <group position={[0, 0.0, 0.012]}>
        <LetterD glow={glow} size={0.2} />
      </group>
      <mesh position={[0, -0.2, 0.012]}>
        <planeGeometry args={[W * 0.92, (W * 0.92) / 8]} />
        <meshBasicMaterial map={textTex} transparent opacity={reveal} toneMapped={false} color="#e8e8e8" depthWrite={false} />
      </mesh>
    </group>
  );
};

/** Спаситель: высокий, в длинном чёрном плаще с высоким воротом, на груди светится «Д» */
export const SAVIOR_SCALE = 1.32;
export const Savior: React.FC<{
  pose: Pose;
  t: number;
  wind: number;
  glow: number;
  /** распахнутость плаща 0..1 (серия 2) */
  open?: number;
  /** нагрудная эмблема с надписью (серия 2): reveal 0..1 */
  emblem?: number;
  handR?: React.ReactNode;
  /** исчезновение в порыве ветра 0..1 */
  vanish?: number;
}> = ({ pose, t, wind, glow, open = 0, emblem, handR, vanish = 0 }) => {
  const v = Math.max(0, Math.min(1, vanish));
  if (v >= 0.999) return null;
  return (
    <group position={[pose.x, 0, pose.z]} scale={[1 - v * 0.92, 1 + v * 0.35, 1 - v * 0.92]}>
      <Stickman3D
        pose={withPose(pose, { x: 0, z: 0 })}
        look={{ color: "#1b1b1b", roughness: 0.8, faceless: true, scale: SAVIOR_SCALE, limbR: 0.058 }}
        handR={handR}
        chest={
          <>
            <Cloak t={t} wind={wind} top={DIMS.shoulderY + 0.06} length={1.32} open={open} />
            <Collar y={DIMS.torso + 0.04} />
            {emblem === undefined ? (
              <group position={[0, DIMS.shoulderY - 0.13, DIMS.torsoR + 0.015]}>
                <LetterD glow={glow} size={0.17} />
              </group>
            ) : (
              <group position={[0, DIMS.shoulderY - 0.12, DIMS.torsoR + 0.02]}>
                <ChestEmblem glow={glow} reveal={emblem} />
              </group>
            )}
          </>
        }
      />
    </group>
  );
};
