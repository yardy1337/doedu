/**
 * Озвучка и звуки серии через ElevenLabs.
 *   npm run audio                    — сгенерировать недостающее
 *   npm run audio -- --force         — перегенерировать всё
 *   npm run audio -- --only=hero_01  — перегенерировать один файл
 *   npm run audio -- --ep=ep2        — другая серия (по умолчанию ep1)
 *   npm run audio -- --retidy        — заново подчистить паузы/громкость готовых дублей
 * Реплики и звуки берутся из сценария серии (src/episodes/<ep>.lines.ts).
 * Серия 1 пишет public/audio/*.mp3, public/audio/sfx/*.mp3 и src/episodes/audio-timing.json;
 * остальные — public/audio/<ep>/… и src/episodes/<ep>.audio-timing.json.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { LineDef, SfxDef } from "../src/episodes/ep1.lines";

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
const RETIDY = process.argv.includes("--retidy");
const EP = process.argv.find((a) => a.startsWith("--ep="))?.slice(5) ?? "ep1";
const AUDIO_SUBDIR = EP === "ep1" ? "" : EP;
const TIMING_FILE = EP === "ep1" ? "audio-timing.json" : `${EP}.audio-timing.json`;
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

/**
 * Подчистка дубля (только если в реплике заданы maxPause / holdBefore / loudnorm):
 * паузы между словами длиннее maxPause сжимаются до maxPause, перед словами из holdBefore —
 * до заданной длины (сценарная пауза), громкость выравнивается (loudnorm). Тайминги слов сдвигаются.
 */
function tidy(out: string, tm: Timing, l: LineDef): Timing {
  if (!l.maxPause && !l.holdBefore && !l.loudnorm) return tm;
  const keep: [number, number][] = [];
  let from = 0;
  let shift = 0;
  const words = tm.words.map((w) => ({ ...w }));
  for (let i = 1; i < words.length; i++) {
    const a = tm.words[i - 1].end;
    const b = tm.words[i].start;
    const target = l.holdBefore?.[tm.words[i].word] ?? l.maxPause ?? Infinity;
    if (b - a > target) {
      const cutA = a + target / 2;
      const cutB = b - target / 2;
      keep.push([from, cutA]);
      from = cutB;
      shift += cutB - cutA;
    }
    words[i].start -= shift;
    words[i].end -= shift;
  }
  const filters: string[] = [];
  const parts = [...keep, [from, -1] as [number, number]];
  parts.forEach(([a, b], i) => filters.push(`[0:a]atrim=start=${a.toFixed(3)}${b > 0 ? `:end=${b.toFixed(3)}` : ""},asetpts=PTS-STARTPTS[p${i}]`));
  filters.push(`${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=0:a=1${l.loudnorm ? ",loudnorm=I=-16:TP=-1.5:LRA=11" : ""},aresample=44100[o]`);
  const tmp = out.replace(/\.mp3$/, ".raw.mp3");
  fs.renameSync(out, tmp);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-filter_complex", filters.join(";"), "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "160k", out]);
  fs.unlinkSync(tmp);
  return { duration: words.length ? words[words.length - 1].end : tm.duration - shift, words };
}

const need = (id: string, out: string) => (ONLY ? ONLY === id : FORCE || !fs.existsSync(out));

async function main() {
  const { LINES, SFX } = (await import(`../src/episodes/${EP}.lines.ts`)) as { LINES: LineDef[]; SFX: SfxDef[] };
  const audioDir = path.join(ROOT, "public/audio", AUDIO_SUBDIR);
  fs.mkdirSync(path.join(audioDir, "sfx"), { recursive: true });
  const timingPath = path.join(ROOT, "src/episodes", TIMING_FILE);
  const timing: Record<string, Timing> = fs.existsSync(timingPath) ? JSON.parse(fs.readFileSync(timingPath, "utf8")) : {};
  for (const l of LINES) {
    const out = path.join(audioDir, `${l.id}.mp3`);
    if (!need(l.id, out) && timing[l.id]) {
      // --retidy: применить подчистку к уже сгенерированному дублю (без нового запроса к API)
      if (RETIDY && timing[l.id]) timing[l.id] = tidy(out, timing[l.id], l);
      continue;
    }
    timing[l.id] = tidy(out, await tts(VOICES[l.voice], l.text, out, l.settings ?? {}), l);
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
