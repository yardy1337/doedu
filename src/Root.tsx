import React from "react";
import { Composition } from "remotion";
import { EpisodeView } from "./EpisodeView";
import { EP1 } from "./episodes/ep1";
import { EP2 } from "./episodes/ep2";
import { CharacterTest } from "./test/CharacterTest";
import { UITest } from "./test/UITest";

const FPS = 30;
const Ep1 = () => <EpisodeView ep={EP1} />;
const Ep2 = () => <EpisodeView ep={EP2} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Ep1Vertical" component={Ep1} durationInFrames={Math.round(EP1.duration * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="Ep1Horizontal" component={Ep1} durationInFrames={Math.round(EP1.duration * FPS)} fps={FPS} width={1920} height={1080} />
    <Composition id="Ep2Vertical" component={Ep2} durationInFrames={Math.round(EP2.duration * FPS)} fps={FPS} width={1080} height={1920} />
    <Composition id="Ep2Horizontal" component={Ep2} durationInFrames={Math.round(EP2.duration * FPS)} fps={FPS} width={1920} height={1080} />
    <Composition id="UITest" component={UITest} durationInFrames={360} fps={FPS} width={760} height={1520} />
    <Composition id="CharacterTest" component={CharacterTest} durationInFrames={180} fps={FPS} width={1920} height={1080} />
  </>
);
