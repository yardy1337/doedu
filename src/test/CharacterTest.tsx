import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { getInputProps, useCurrentFrame, useVideoConfig } from "remotion";
const OFF = ((getInputProps() as { off?: string }).off ?? "").split(",");
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { BRAND } from "../brand";
import { CameraRig } from "../camera/CameraRig";
import { CrowdPerson, Hero, Savior } from "../characters/Characters";
import { STAND, walk, withPose } from "../characters/rig";
import { EYES_DEFAULT } from "../characters/Stickman3D";
import { TowedSuitcase } from "../characters/Suitcase";

/** Стенд персонажей: проверка поз, походки и глаз */
export const CharacterTest: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 30;
  const { width, height } = useVideoConfig();
  const face = withPose(STAND, { yaw: 0 });
  const walking = walk(withPose(STAND, { x: -1.2, yaw: 0.5 }), t * 7, 1);
  const running = walk(withPose(STAND, { x: 2.6, yaw: 0.6 }), t * 9, 1, 1);
  const sit = withPose(STAND, {
    x: 1.25, yaw: -0.3, seated: true, lean: -0.15,
    legL: { pitch: 1.35, roll: 0.15, bend: 1.9 }, legR: { pitch: 1.2, roll: 0.1, bend: 1.5 },
    armL: { pitch: 0.4, roll: 0.3, bend: 0.6 }, armR: { pitch: 0.5, roll: 0.25, bend: 0.8 }, headPitch: 0.15,
  });
  return (
    <ThreeCanvas width={width} height={height} shadows={!OFF.includes("shadows")}>
      {!OFF.includes("cam") && <CameraRig cam={{ pos: [0.3, 1.5, 5.2], target: [0.3, 1.0, 0], fov: 42 }} />}
      <color attach="background" args={[BRAND.black]} />
      <ambientLight intensity={0.25} />
      <hemisphereLight args={["#ffffff", "#111111", 0.5]} />
      <spotLight position={[2, 6, 4]} angle={0.7} penumbra={0.6} intensity={80} castShadow color={BRAND.lamp} />
      <directionalLight position={[-3, 3, -4]} intensity={2.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#2b2b2b" roughness={0.5} />
      </mesh>
      {!OFF.includes("chars") && <>
      {/* герой: глаза в разных состояниях по очереди */}
      <Hero pose={face} eyes={[EYES_DEFAULT, { ...EYES_DEFAULT, wide: 1 }, { ...EYES_DEFAULT, lookX: 1 }, { ...EYES_DEFAULT, squeeze: 1 }, { ...EYES_DEFAULT, openL: 0.05 }, { ...EYES_DEFAULT, blink: 0.9 }][Math.floor(t) % 6]} sweat={OFF.includes("sweat") ? 0 : (t % 2) / 2}>
        <TowedSuitcase wheel={[-0.2, 0, -0.75]} hand={[-0.17, 0.8, -0.26]} />
      </Hero>
      <Hero pose={walking} eyes={EYES_DEFAULT} />
      <Hero pose={sit} eyes={{ ...EYES_DEFAULT, squeeze: 1 }} />
      <CrowdPerson pose={withPose(STAND, { x: -2.3, z: -1.2, yaw: 0.4 })} scale={1.12} />
      <CrowdPerson pose={running} scale={1.08} />
      {!OFF.includes("savior") && <Savior pose={withPose(STAND, { x: 0.3, z: -2.6, yaw: 0, armR: { pitch: 1.4, roll: 0.05, bend: 0.15 } })} t={t} wind={1} glow={4} />}
      </>}
      {!OFF.includes("post") && <EffectComposer multisampling={0}>
        <Bloom intensity={1.1} luminanceThreshold={0.85} mipmapBlur />
        <Vignette darkness={0.55} offset={0.3} />
      </EffectComposer>}
    </ThreeCanvas>
  );
};
