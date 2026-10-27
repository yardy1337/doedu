import { getInfo } from "@remotion/google-fonts/Montserrat";
import { getInfo as getHandInfo } from "@remotion/google-fonts/Caveat";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// Montserrat из @remotion/google-fonts. Файлы woff2 (с fonts.gstatic.com) лежат в public/fonts,
// чтобы рендер не зависел от сети. Шрифт вариативный: один файл покрывает 500 и 900.
// Caveat — рукописный (слоган на финальной карточке), тоже вариативный.
const info = getInfo();
const hand = getHandInfo();
export const FONT = info.fontFamily;
export const FONT_HAND = hand.fontFamily;

/** Резолвится, когда оба шрифта загружены (для текстур, которые рисуются на canvas) */
export let fontsReady: Promise<void> = Promise.resolve();

if (typeof document !== "undefined") {
  const handle = delayRender("Loading fonts");
  const load = (family: string, file: string, ranges: Record<string, string>) =>
    (["cyrillic", "latin"] as const).map((subset) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}-${subset}.woff2`)}) format("woff2")`, {
        weight: "100 900",
        unicodeRange: ranges[subset],
      });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    });
  fontsReady = Promise.all([...load(FONT, "montserrat", info.unicodeRanges), ...load(FONT_HAND, "caveat", hand.unicodeRanges)]).then(() => undefined);
  fontsReady.then(() => continueRender(handle)).catch((e) => cancelRender(e));
}
