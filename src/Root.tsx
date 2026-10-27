import React from "react";
import { Composition } from "remotion";
import { EpisodeView } from "./EpisodeView";
import { EP1 } from "./episodes/ep1";
import { CharacterTest } from "./test/CharacterTest";

const FPS = 30;
const Ep1 = () => <EpisodeView ep={EP1} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Ep1Vertical" component={Ep1} durationInFrames={Math.round(EP1.duration * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="Ep1Horizontal" component={Ep1} durationInFrames={Math.round(EP1.duration * FPS)} fps={FPS} width={1920} height={1080} />
    <Composition id="CharacterTest" component={CharacterTest} durationInFrames={180} fps={FPS} width={1920} height={1080} />
  </>
);
