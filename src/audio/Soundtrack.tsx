import React from "react";
import { Html5Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";

/**
 * Звуковая дорожка из списка реплик и эффектов (cues) сценария серии.
 * at / dur / fadeIn / fadeOut — в секундах.
 */
export type AudioCue = {
  file: string; // путь внутри public/
  at: number;
  volume: number;
  dur?: number; // обрезать (для лупов и длинных подложек)
  loop?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** доп. огибающая громкости от времени ролика (сек) — для приглушений */
  env?: (t: number) => number;
};

export const Soundtrack: React.FC<{ cues: AudioCue[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => {
        const from = Math.round(c.at * fps);
        const durF = c.dur ? Math.round(c.dur * fps) : undefined;
        return (
          <Sequence key={`${c.file}-${i}`} from={from} durationInFrames={durF} layout="none">
            <Html5Audio
              src={staticFile(c.file)}
              loop={c.loop}
              volume={(f) => {
                const s = f / fps;
                let v = c.volume;
                if (c.fadeIn) v *= interpolate(s, [0, c.fadeIn], [0, 1], { extrapolateRight: "clamp" });
                if (c.fadeOut && c.dur)
                  v *= interpolate(s, [c.dur - c.fadeOut, c.dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
                if (c.env) v *= c.env(c.at + s);
                return Math.max(0, v);
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
};
