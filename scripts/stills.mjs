// Стоп-кадры по секундам: node scripts/stills.mjs 2 8.5 13 …   (COMPS=Ep1Vertical,Ep1Horizontal)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const shell = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browserExecutable = fs.existsSync(shell) ? shell : null;
const gl = process.env.REMOTION_GL ?? (fs.existsSync("/dev/dri") ? "angle" : "swangle");
const secs = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
fs.mkdirSync("out/stills", { recursive: true });
for (const id of (process.env.COMPS ?? "Ep1Vertical").split(",")) {
  const composition = await selectComposition({ serveUrl, id, browserExecutable, chromiumOptions: { gl } });
  for (const s of secs) {
    const frame = Math.min(composition.durationInFrames - 1, Math.round(s * 30));
    const output = `out/stills/${id}-${s}.png`;
    await renderStill({ serveUrl, composition, frame, output, browserExecutable, chromiumOptions: { gl }, timeoutInMilliseconds: 120000 });
    console.log(output);
  }
}
