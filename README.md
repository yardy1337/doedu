# «Доеду» — 3D-сериал (Remotion + React Three Fiber)

```bash
npm install
cp .env.example .env     # ELEVENLABS_API_KEY и ID голосов
npm run audio            # озвучка и звуки → public/audio, тайминги → src/episodes/audio-timing.json
npm run dev              # Remotion Studio
npm run render           # out/doedu-ep1-vertical.mp4 (композиция Ep1Horizontal тоже есть — `npx remotion render Ep1Horizontal …`)
npm run stills -- 13 29.5 47   # контрольные стоп-кадры (секунды) → out/stills/
```

## Как устроено
```
src/
  characters/  rig.ts (поза, походка, прямая кинематика), Stickman3D (капсулы, глаза, пот),
               Characters (Герой / Толпа / Спаситель), Cloak (плащ, ворот, буква «Д»), Suitcase
  sets/        Station (платформа, мокрый пол, фонари с конусами, поезд, стена, туман), Sparks
  camera/      CameraRig — ставит камеру из состояния кадра
  audio/       Soundtrack — проигрывает список реплик и эффектов
  effects/     Post (bloom, DoF, виньетка) + SelectiveDesat (обесцвечивание кроме алого)
  overlays/    Eyelids (POV-веки), Black, Grain (зерно), EpisodeCard + Logo (финальная карточка)
  episodes/    ep1.ts — сценарий серии, ep1.lines.ts — реплики и звуки, types.ts — интерфейс серии
  EpisodeView.tsx — собирает любую серию из общих компонентов
```
Анимация — только функции от времени: `useCurrentFrame()` → секунды → состояние.
Нет `useFrame`, нет `Math.random` (случайность — сидированный `rng`), поэтому каждый кадр детерминирован.

## Реплики и голоса
- Текст и интонация: `src/episodes/ep1.lines.ts` (теги `[whispers]`, `[nervous]`, `[calm]` понимает модель `eleven_v3`).
- Голоса: `VOICE_HERO`, `VOICE_SAVIOR`, `VOICE_NARRATOR` в `.env`. Модель — `MODEL_ID`.
- Перегенерировать: `npm run audio -- --force` или один файл `npm run audio -- --only=hero_01`.
  Тайминг сцен сам подстроится под новую длину реплик (см. `BEATS` в `ep1.ts`).

## Тайминги
Все ключевые моменты — объект `BEATS` в начале `src/episodes/ep1.ts` (в секундах).
Там же камера по планам (`shots`), движения героя, толпы и Спасителя, эффекты (`fx`) и звук (`audio`, громкость каждого эффекта).

## Следующая серия
1. Скопируйте `episodes/ep1.lines.ts` → `ep2.lines.ts` (новые реплики и звуки), поправьте импорт в `scripts/generate-audio.ts`.
2. Скопируйте `episodes/ep1.ts` → `ep2.ts`: меняйте `BEATS`, траектории, камеру, эффекты, `title: "Серия 2"`.
3. Добавьте композиции в `src/Root.tsx`: `<EpisodeView ep={EP2} />`.
Персонажи, станция, камера, свет, звук и финальная карточка переиспользуются без изменений;
для новой локации добавьте компонент в `sets/`.

## Рендер 3D
Remotion рекомендует GL-бэкенд `angle` (нужен GPU). Без GPU он не создаёт WebGL-контекст,
поэтому `remotion.config.ts` выбирает автоматически: `angle`, если есть GPU, иначе `swangle`
(SwiftShader). Явно: `REMOTION_GL=angle npm run render`. Без GPU рендер медленный (~3 с/кадр).
