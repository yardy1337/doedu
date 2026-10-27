// Реплики и звуки серии 2. Меняете текст → `npm run audio -- --ep=ep2 --force` (или --only=id).
// Файлы: public/audio/ep2/*.mp3, public/audio/ep2/sfx/*.mp3; тайминги — src/episodes/ep2.audio-timing.json.
// Названия «ТолькоЖД» и т.п. записаны так, как их надо произнести.
import type { LineDef, SfxDef } from "./ep1.lines";

const HERO_SCARED = { stability: 0.3, style: 0.55 };
const SAVIOR_CALM = { stability: 0.7, style: 0.2 };

// Все реплики серии выравниваются по громкости; длинные «мхатовские» паузы модели сжимаются.
const TIDY = { loudnorm: true, maxPause: 1.4 };

export const LINES: LineDef[] = ([
  { id: "hero_01", voice: "hero", text: "[scared] Кто… [stammers] кто вы?", direction: "A frightened young man, trembling voice, stammering", settings: HERO_SCARED },
  {
    id: "savior_01",
    voice: "savior",
    text: "[calm] Я — Доеду. Точнее, его голосовой помощник. Меня зовут До. [pause] До… [pause] Еду.",
    direction: "A calm, deep, confident superhero voice with a little playful wit. Make a short pause after the first \"До.\" and a long dramatic pause before the final word \"Еду\"", settings: SAVIOR_CALM,
    // игра слов: «До.» — короткая пауза — «До…» — выдержанная пауза — «Еду.»
    maxPause: 0.75,
    holdBefore: { Еду: 1.15 },
  },
  { id: "hero_02", voice: "hero", text: "[nervous] А те люди? Они хотели меня… [whispers] съесть?", direction: "A scared young man asks nervously; the last word is a fearful whisper", settings: HERO_SCARED },
  {
    id: "savior_02",
    voice: "savior",
    text:
      "[serious] Хуже. Они — «Только Авиа», «Только Жэ-Дэ» и «Только Попутка». Каждый тянул тебя в свою экосистему. " +
      "Ты шёл с чемоданом, а они видели в тебе… пассажира без единого приложения.",
    direction: "A calm, deep, serious superhero voice, slightly ironic, like telling a dark secret", settings: SAVIOR_CALM,
  },
  { id: "hero_03", voice: "hero", text: "[hesitant] И что теперь?", direction: "A shaken young man asks hesitantly", settings: { stability: 0.4, style: 0.45 } },
  {
    id: "savior_03",
    voice: "savior",
    text:
      "[warmly] Теперь ты поедешь. Гибридный маршрут: поезд до Твери, там — автобус до причала, и пешком до санатория. " +
      "Всё в одном приложении. Без пересадок в других сервисах.",
    direction: "A calm, deep, warm and reassuring superhero voice, confident and clear, like presenting a great plan", settings: SAVIOR_CALM,
  },
  { id: "hero_04", voice: "hero", text: "[hopeful] А если я… опоздаю?", direction: "A young man, now hopeful but still a bit anxious", settings: { stability: 0.4, style: 0.45 } },
  { id: "savior_04", voice: "savior", text: "[calm] Тогда я приду снова. С алой буквой «Дэ».", direction: "A calm, deep, heroic voice, a solemn promise", settings: SAVIOR_CALM },
  { id: "narrator_01", voice: "narrator", text: "Доеду. Все пути по России.", direction: "A movie trailer narrator, clear, warm and steady", settings: { stability: 0.6 } },
] as LineDef[]).map((l) => ({ ...TIDY, ...l }));

export const SFX: SfxDef[] = [
  { id: "wind", prompt: "cold night wind blowing over an empty concrete train platform, hollow gusts, low distant hum, eerie, quiet", seconds: 22, loop: true },
  { id: "foil", prompt: "crumpled aluminium foil food wrapper tumbling and scraping over concrete in the wind, crinkly rustle with tiny metallic clinks", seconds: 2.5 },
  { id: "cloak_burst", prompt: "powerful heavy cloth cloak thrown open in strong wind, one big snapping whoosh, cinematic superhero reveal", seconds: 1.6 },
  { id: "letter_glow", prompt: "mystical glowing emblem lighting up, warm magical shimmer rising into a soft bright hum, cinematic", seconds: 3 },
  { id: "rope_creak", prompt: "thick ropes stretched under heavy tension, creaking and straining, tug of war, fibres groaning", seconds: 5, loop: true },
  { id: "rope_snap", prompt: "several taut ropes snapping at once, sharp whip crack with recoil", seconds: 1.2 },
  { id: "projector", prompt: "old 16mm film projector running, rhythmic mechanical clatter and whir, vintage", seconds: 12, loop: true },
  { id: "phone_chime", prompt: "soft gentle smartphone notification chime, warm and modern, two notes", seconds: 1 },
  { id: "route_whoosh", prompt: "smooth digital whoosh with a magical sparkle as lines merge into one, modern UI transition", seconds: 1.5 },
  { id: "path_hum", prompt: "warm low electric hum of a glowing neon light strip, soft steady drone with gentle shimmer", seconds: 8, loop: true },
  { id: "vanish", prompt: "sudden strong gust of wind with a soft magical swoosh as someone vanishes, sparkles fading", seconds: 2.5 },
];
