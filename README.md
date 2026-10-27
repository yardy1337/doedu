# «Доеду» — 3D-сериал (Remotion + React Three Fiber)

```bash
npm install
cp .env.example .env     # ELEVENLABS_API_KEY и ID голосов
npm run audio            # серия 1: озвучка и звуки → public/audio, тайминги → src/episodes/audio-timing.json
npm run audio:ep2        # серия 2: → public/audio/ep2, тайминги → src/episodes/ep2.audio-timing.json
npm run dev              # Remotion Studio
npm run render           # out/doedu-ep1-vertical.mp4 (композиция Ep1Horizontal тоже есть — `npx remotion render Ep1Horizontal …`)
npm run render:ep2       # out/doedu-ep2-vertical.mp4 и out/doedu-ep2-horizontal.mp4
COMPS=Ep2Vertical npm run stills -- 13 29.5 47   # контрольные стоп-кадры (секунды) → out/stills/
python3 scripts/sheet.py Ep2Vertical out/sheet.png 13 29.5 47   # контактный лист из стоп-кадров
```

## Как устроено
```
src/
  characters/  rig.ts (поза, походка, прямая кинематика, дрожь), Stickman3D (капсулы, глаза, мимика, пот),
               Characters (Герой / Толпа / Спаситель с эмблемой), Cloak (плащ, ворот, буква «Д»), Suitcase
  sets/        Station (платформа, мокрый пол, фонари с конусами, поезд, стена, туман), Sparks
  props/       реквизит: Wrapper (обёртка от шаурмы), Phone + RouteUI (смартфон с приложением «Доеду»),
               RoutePath (алая линия маршрута в 3D, пин), Flashback (таблички, двери, верёвки, пыль)
  camera/      CameraRig — ставит камеру из состояния кадра
  audio/       Soundtrack — проигрывает список реплик и эффектов
  effects/     Post (bloom, DoF, виньетка) + SelectiveDesat (обесцвечивание кроме алого)
  overlays/    Eyelids (POV-веки), Black, Grain (зерно), Film (старая плёнка), EpisodeCard + Logo
  lib/         anim (easing, треки, rng), canvasTexture (текстуры с текстом — ждут загрузки шрифтов)
  episodes/    ep1.ts / ep2.tsx — сценарии, *.lines.ts — реплики и звуки, helpers.ts — общие хелперы сценариев,
               types.ts — интерфейс серии
  EpisodeView.tsx — собирает любую серию из общих компонентов
```
Анимация — только функции от времени: `useCurrentFrame()` → секунды → состояние.
Нет `useFrame`, нет `Math.random` (случайность — сидированный `rng`), поэтому каждый кадр детерминирован.

## Реплики и голоса
- Текст и интонация: `src/episodes/ep1.lines.ts`, `ep2.lines.ts` (теги `[whispers]`, `[nervous]`, `[calm]` понимает модель `eleven_v3`).
- Голоса: `VOICE_HERO`, `VOICE_SAVIOR`, `VOICE_NARRATOR` в `.env`. Модель — `MODEL_ID`. Настройки голоса
  (стабильность, выразительность) — `settings` у каждой реплики.
- Перегенерировать: `npm run audio -- --force` или один файл `npm run audio -- --only=hero_01` (`--ep=ep2` — серия 2).
- Подчистка дубля (серия 2): `maxPause` сжимает затянутые паузы модели, `holdBefore` выдерживает сценарную паузу
  («До… Еду»), `loudnorm` выравнивает громкость. `--retidy` применяет это к уже готовым файлам без нового запроса к API.
- Тайминг сцен сам подстраивается под длину реплик и время слов (см. `BEATS` / `BEATS2`).
- **Gemini TTS (Google AI Studio)** — нативные русские голоса: `GEMINI_API_KEY` в окружении и
  `npm run audio:ep2 -- --provider=gemini --force` (или `TTS_PROVIDER=gemini`). Пробники голосов для выбора:
  `npm run audio -- --ep=ep2 --provider=gemini --samples` → `public/audio/samples/`. Голоса — `GEMINI_VOICE_*`,
  интонация — `direction` у реплики. Gemini не отдаёт время слов: `scripts/tts-gemini.ts` оценивает его по паузам
  (ffmpeg silencedetect) и слогам — точность около 0.1 с. Звуковые эффекты по-прежнему через ElevenLabs.

## Серия 2: что добавлено в общие компоненты (серия 1 не меняется)
- `Stickman3D` / `Eyes`: необязательные `squint` (прищур), `sparkle` (блики радости), `brow`/`browAsym` (брови),
  `smile`. Не заданы — лицо как в серии 1.
- `rig.ts`: `tremble()` — дрожь всем телом; `rigMatrices` отдаёт ещё колени и стопы; `handLocal()` (кисть для реквизита).
- `Cloak`: параметр `open` — плащ распахивается (0 — как раньше). Исправлен NaN в вершинах у самого ворота.
- `Savior`: `open`, `emblem` (нагрудная пластина: крупная «Д» + «Все пути по России»), `vanish` (исчезновение), `handR`.
- `Station`: `train={false}` — без поезда (флешбэк).
- `EpisodeCard`: `slogan` — рукописный слоган (Caveat) алым и «Серия N» под ним.
- `Episode`: необязательные `scene` (реквизит серии в 3D), `overlay` (2D-слои), `slogan`;
  `FxState`: `sparksCenter`, `fog`, `offset` (плёнка «гуляет»), `hideTrain`; `SaviorState`: `open`, `emblem`, `vanish`.
- `fonts.ts`: добавлен Caveat и промис `fontsReady`; `scripts/generate-audio.ts`: `--ep`, подчистка дублей.
- Хелперы сценария (ходьба, моргания, склейка планов) вынесены из `ep1.ts` в `episodes/helpers.ts` —
  состояние серии 1 покадрово совпадает с прежним.

## Рендер 3D
Remotion рекомендует GL-бэкенд `angle` (нужен GPU). Без GPU он не создаёт WebGL-контекст,
поэтому `remotion.config.ts` выбирает автоматически: `angle`, если есть GPU, иначе `swangle`
(SwiftShader). Явно: `REMOTION_GL=angle npm run render`. Без GPU рендер медленный (~3 с/кадр).
