import { getInfo } from "@remotion/google-fonts/Montserrat";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

// Montserrat из @remotion/google-fonts. Файлы woff2 (с fonts.gstatic.com) лежат в public/fonts,
// чтобы рендер не зависел от сети. Шрифт вариативный: один файл покрывает 500 и 900.
const info = getInfo();
export const FONT = info.fontFamily;

if (typeof document !== "undefined") {
  const handle = delayRender("Loading Montserrat");
  Promise.all(
    (["cyrillic", "latin"] as const).map((subset) => {
      const face = new FontFace(FONT, `url(${staticFile(`fonts/montserrat-${subset}.woff2`)}) format("woff2")`, {
        weight: "100 900",
        unicodeRange: info.unicodeRanges[subset],
      });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => cancelRender(e));
}
