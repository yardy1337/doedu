import React from "react";
import { Bloom, DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { V3 } from "../lib/anim";
import { SelectiveDesat } from "./SelectiveDesat";

export type PostState = {
  bloom: number;
  /** DoF включается только когда bokeh > 0 (дорогой эффект) */
  dof?: { target: V3; bokeh: number; focalLength?: number };
  vignette: number;
  desat: number;
};

export const Post: React.FC<{ s: PostState }> = ({ s }) => {
  const dofOn = !!s.dof && s.dof.bokeh > 0.05;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {dofOn ? (
        <DepthOfField target={s.dof!.target} focalLength={s.dof!.focalLength ?? 0.03} bokehScale={s.dof!.bokeh} resolutionScale={0.4} />
      ) : (
        <></>
      )}
      <Bloom intensity={s.bloom} luminanceThreshold={0.82} luminanceSmoothing={0.2} mipmapBlur radius={0.7} />
      <SelectiveDesat amount={s.desat} />
      <Vignette darkness={s.vignette} offset={0.28} />
    </EffectComposer>
  );
};
