import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { BRAND } from "./brand";
import { Soundtrack } from "./audio/Soundtrack";
import { CameraRig } from "./camera/CameraRig";
import { CrowdPerson, Hero, Savior } from "./characters/Characters";
import { FallingSuitcase, TowedSuitcase } from "./characters/Suitcase";
import { Post } from "./effects/Post";
import { Episode } from "./episodes/types";
import { heroHandLocal } from "./episodes/ep1";
import { EpisodeCard } from "./overlays/EpisodeCard";
import { Black, Eyelids, Grain } from "./overlays/Overlays";
import { Sparks } from "./sets/Sparks";
import { RimLight, Station } from "./sets/Station";

/** Собирает любую серию из общих компонентов по её сценарию */
export const EpisodeView: React.FC<{ ep: Episode }> = ({ ep }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const vertical = height > width;
  const t = frame / fps;
  const st = ep.storyTime(t);
  const fx = ep.fx(t, vertical);
  const cam = ep.camera(t, vertical);
  const hero = ep.hero(st);
  const savior = ep.savior(st);
  const show3D = !fx.card && fx.black < 0.999;
  return (
    <AbsoluteFill style={{ background: BRAND.black }}>
      {show3D && (
        <ThreeCanvas width={width} height={height} shadows dpr={1} gl={{ antialias: true, powerPreference: "high-performance" }}>
          <CameraRig cam={cam} />
          <color attach="background" args={["#0b0b0b"]} />
          <fogExp2 attach="fog" args={["#121212", 0.06]} />
          <ambientLight intensity={0.07} />
          <hemisphereLight args={["#d9d9d9", "#0b0b0b", 0.16]} />
          {/* контровой свет вдоль платформы — светлый ободок на персонажах */}
          <directionalLight position={[-12, 5, -7]} intensity={0.9} color="#e8e8e8" />
          <directionalLight position={[16, 5, -3]} intensity={0.6} color="#e8e8e8" />
          {fx.rimLight && <RimLight pos={fx.rimLight.pos} target={fx.rimLight.target} intensity={fx.rimLight.intensity} />}
          <Station t={st} shadowLampX={fx.shadowLamp?.x} shadowTarget={fx.shadowLamp?.target} fogCards={ep.fogCards} cam={cam.pos} />
          {hero.visible && (
            <Hero pose={hero.pose} eyes={hero.eyes} sweat={hero.sweat}>
              {hero.suitcase.mode === "towed" && <TowedSuitcase wheel={[-0.2, 0, -0.62]} hand={heroHandLocal(hero.pose)} />}
            </Hero>
          )}
          {hero.suitcase.mode === "fallen" && (
            <FallingSuitcase pos={hero.suitcase.pos} yaw={hero.suitcase.yaw} fall={hero.suitcase.fall} tilt0={hero.suitcase.tilt0} />
          )}
          {Array.from({ length: ep.crowd.count }).map((_, i) => {
            const c = ep.crowd.at(st, i);
            return c.visible ? <CrowdPerson key={i} pose={c.pose} scale={c.scale} shade={i % 3 === 0 ? "#3b3b3b" : i % 3 === 1 ? "#454545" : "#4f4f4f"} /> : null;
          })}
          {savior.visible && <Savior pose={savior.pose} t={st} wind={savior.wind} glow={savior.glow} />}
          <Sparks t={fx.sparksT} amount={fx.sparks} center={[9.5, 0, 0.2]} />
          <Post s={fx.post} />
        </ThreeCanvas>
      )}
      <Eyelids open={fx.eyelids.open} tilt={fx.eyelids.tilt} glow={fx.eyelids.glow} />
      <Black opacity={fx.black} />
      {fx.card && (
        <EpisodeCard
          frame={frame}
          title={ep.title}
          subtitle={ep.subtitle}
          beats={{ logo: Math.round(ep.cardBeats.logo * fps), title: Math.round(ep.cardBeats.title * fps), subtitle: Math.round(ep.cardBeats.subtitle * fps) }}
        />
      )}
      <Grain frame={frame} amount={fx.grain} />
      <Soundtrack cues={ep.audio} />
    </AbsoluteFill>
  );
};
