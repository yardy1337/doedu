// Реплики и звуки серии 1. Меняете текст → `npm run audio -- --force` (или --only=id).
export type Voice = "hero" | "savior" | "narrator";

export const LINES: { id: string; voice: Voice; text: string; settings?: Record<string, number> }[] = [
  { id: "hero_01", voice: "hero", text: "[whispers] Чего они все на меня смотрят?..", settings: { stability: 0.4 } },
  { id: "hero_02", voice: "hero", text: "[nervous] Ну всё. Приехал.", settings: { stability: 0.4 } },
  { id: "savior_01", voice: "savior", text: "[calm] Тебе куда?", settings: { stability: 0.7, style: 0.2 } },
  { id: "narrator_01", voice: "narrator", text: "Доеду. Продолжение следует.", settings: { stability: 0.6 } },
];

export const SFX: { id: string; prompt: string; seconds: number; loop?: boolean }[] = [
  { id: "station_ambience", prompt: "empty night train station ambience, low electrical hum, distant echo, quiet, cinematic", seconds: 22, loop: true },
  { id: "announcement", prompt: "distant unintelligible train station PA announcement, muffled reverberant voice, far away", seconds: 5 },
  { id: "suitcase_wheels", prompt: "small plastic suitcase wheels rolling over tiled floor, rhythmic clicking on tile joints", seconds: 6, loop: true },
  { id: "crowd_steps", prompt: "slow synchronized footsteps of a group of people on concrete, ominous, echoing", seconds: 6, loop: true },
  { id: "drone", prompt: "low ominous horror drone, deep sub bass, slowly descending pitch, tension building", seconds: 22 },
  { id: "heartbeat", prompt: "human heartbeat accelerating from slow to very fast, deep thumps, tense", seconds: 8 },
  { id: "suitcase_fall", prompt: "hard plastic suitcase falling on its side onto a concrete floor", seconds: 1 },
  { id: "wall_hit", prompt: "back hitting a concrete wall, dull body thump", seconds: 1 },
  { id: "air_whoosh", prompt: "powerful whoosh of air being cut by something falling fast from above, cinematic", seconds: 1.6 },
  { id: "heavy_landing", prompt: "heavy superhero landing on concrete, deep boom impact with debris", seconds: 1.5 },
  { id: "cloak_flap", prompt: "heavy cloth cloak flapping once in the wind, strong snap", seconds: 1.2 },
  { id: "running_away", prompt: "group of people running away quickly on concrete, footsteps fading into distance", seconds: 3 },
  { id: "mystic_glow", prompt: "soft mystical magical glow shimmer, warm, rising, gentle", seconds: 3 },
];
