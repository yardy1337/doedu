import { Config } from "@remotion/cli/config";
import fs from "node:fs";

// 3D (WebGL): Remotion рекомендует бэкенд "angle" для @remotion/three (нужен GPU).
// На машине без GPU (облако, CI) "angle" не создаёт WebGL-контекст — тогда берём
// "swangle" (ANGLE поверх программного SwiftShader). Можно задать явно: REMOTION_GL=angle.
const gl = (process.env.REMOTION_GL ?? (fs.existsSync("/dev/dri") ? "angle" : "swangle")) as "angle" | "swangle";
Config.setChromiumOpenGlRenderer(gl);
Config.setOverwriteOutput(true);
Config.setConcurrency(2);
Config.setDelayRenderTimeoutInMilliseconds(120000);

const shell = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
if (fs.existsSync(shell)) Config.setBrowserExecutable(shell);
