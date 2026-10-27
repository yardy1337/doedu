import React from "react";
import { BRAND } from "../brand";
import { Cloak, Collar, LetterD } from "./Cloak";
import { DIMS, Pose } from "./rig";
import { Eyes, Stickman3D } from "./Stickman3D";

/** Герой: белый человечек из логотипа */
export const HERO_LOOK = { color: BRAND.white, roughness: 0.62 };
export const Hero: React.FC<{ pose: Pose; eyes: Eyes; sweat?: number; children?: React.ReactNode; handR?: React.ReactNode }> = (p) => (
  <Stickman3D pose={p.pose} eyes={p.eyes} sweat={p.sweat} look={HERO_LOOK} handR={p.handR}>
    {p.children}
  </Stickman3D>
);

/** Человек из толпы: тёмно-серый, выше героя, без лица */
export const CrowdPerson: React.FC<{ pose: Pose; scale: number; shade?: string }> = ({ pose, scale, shade }) => (
  <Stickman3D pose={pose} look={{ color: shade ?? BRAND.grey.g30, roughness: 0.85, faceless: true, scale, limbR: 0.05 }} />
);

/** Спаситель: высокий, в длинном чёрном плаще с высоким воротом, на груди светится «Д» */
export const SAVIOR_SCALE = 1.32;
export const Savior: React.FC<{ pose: Pose; t: number; wind: number; glow: number }> = ({ pose, t, wind, glow }) => (
  <Stickman3D
    pose={pose}
    look={{ color: "#1b1b1b", roughness: 0.8, faceless: true, scale: SAVIOR_SCALE, limbR: 0.058 }}
    chest={
      <>
        <Cloak t={t} wind={wind} top={DIMS.shoulderY + 0.06} length={1.32} />
        <Collar y={DIMS.torso + 0.04} />
        <group position={[0, DIMS.shoulderY - 0.13, DIMS.torsoR + 0.015]}>
          <LetterD glow={glow} size={0.17} />
        </group>
      </>
    }
  />
);
