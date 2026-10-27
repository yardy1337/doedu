/**
 * Озвучка и звуки серии через ElevenLabs.
 *   npm run audio                    — сгенерировать недостающее
 *   npm run audio -- --force         — перегенерировать всё
 *   npm run audio -- --only=hero_01  — перегенерировать один файл
 * Пишет public/audio/*.mp3, public/audio/sfx/*.mp3 и src/episodes/audio-timing.json.
 * Реплики и звуки берутся из сценария серии (src/episodes/ep1.lines.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { LINES, SFX } from "../src/episodes/ep1.lines";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*([^#]*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} else {
  console.warn("⚠ Нет файла .env. Скопируйте .env.example в .env и впишите ELEVENLABS_API_KEY и ID голосов.");
}
const API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const MODEL_ID = process.env.MODEL_ID || "eleven_v3";
const VOICES: Record<string, string> = {
  hero: process.env.VOICE_HERO || "TX3LPaxmHKxFdv7VOQHJ",
  savior: process.env.VOICE_SAVIOR || "IKne3meq5aSn9XLyUdCD",
  narrator: process.env.VOICE_NARRATOR || "onwK4e9ZLuTAKqWW03F9",
};
const FORCE = process.argv.includes("--force");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const API = "https://api.elevenlabs.io/v1";
const headers = (): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(API_KEY ? { "xi-api-key": API_KEY } : {}),
});

type Timing = { duration: number; words: { word: string; start: number; end: number }[] };

async function tts(voice: string, text: string, out: string, settings: Record<string, number>): Promise<Timing> {
  const res = await fetch(`${API}/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      language_code: "ru",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, ...settings },
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  fs.writeFileSync(out, Buffer.from(data.audio_base64, "base64"));
  const a = data.alignment;
  const words: Timing["words"] = [];
  if (a) {
    let cur = "", start = 0, end = 0, inTag = false;
    a.characters.forEach((ch, i) => {
      if (ch === "[") inTag = true;
      if (inTag) {
        if (ch === "]") inTag = false;
        return;
      }
      if (/[\p{L}\p{N}]/u.test(ch)) {
        if (!cur) start = a.character_start_times_seconds[i];
        cur += ch;
        end = a.character_end_times_seconds[i];
      } else if (cur) {
        words.push({ word: cur, start, end });
        cur = "";
      }
    });
    if (cur) words.push({ word: cur, start, end });
  }
  return { duration: words.length ? words[words.length - 1].end : 1, words };
}

async function sfx(text: string, dur: number, out: string, loop = false) {
  const res = await fetch(`${API}/sound-generation?output_format=mp3_44100_128`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text, duration_seconds: dur, prompt_influence: 0.55, ...(loop ? { loop: true } : {}) }),
  });
  if (!res.ok) throw new Error(`SFX ${res.status}: ${await res.text()}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}

const need = (id: string, out: string) => (ONLY ? ONLY === id : FORCE || !fs.existsSync(out));

async function main() {
  const audioDir = path.join(ROOT, "public/audio");
  fs.mkdirSync(path.join(audioDir, "sfx"), { recursive: true });
  const timingPath = path.join(ROOT, "src/episodes/audio-timing.json");
  const timing: Record<string, Timing> = fs.existsSync(timingPath) ? JSON.parse(fs.readFileSync(timingPath, "utf8")) : {};
  for (const l of LINES) {
    const out = path.join(audioDir, `${l.id}.mp3`);
    if (!need(l.id, out) && timing[l.id]) continue;
    timing[l.id] = await tts(VOICES[l.voice], l.text, out, l.settings ?? {});
    fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2));
    console.log(`♪ ${l.id} [${l.voice}] «${l.text}» — ${timing[l.id].duration.toFixed(2)} с`);
  }
  for (const s of SFX) {
    const out = path.join(audioDir, "sfx", `${s.id}.mp3`);
    if (!need(s.id, out)) continue;
    await sfx(s.prompt, s.seconds, out, s.loop);
    console.log(`♪ sfx/${s.id}`);
  }
  fs.writeFileSync(timingPath, JSON.stringify(timing, null, 2));
  console.log("Готово.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
