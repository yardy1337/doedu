/**
 * Озвучка через Gemini API (Google AI Studio): нативные голоса, русский без акцента.
 * Ключ — переменная окружения GEMINI_API_KEY (в коде ключа нет).
 *
 * Gemini TTS отдаёт только звук (PCM 24 кГц), без времени слов. Время слов оцениваем сами:
 * ffmpeg находит паузы, слова раскладываются по отрезкам речи с учётом пунктуации и числа слогов.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

export type Timing = { duration: number; words: { word: string; start: number; end: number }[] };

const API = "https://generativelanguage.googleapis.com/v1beta";
const key = () => {
  const k = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!k) throw new Error("Нет GEMINI_API_KEY: создайте ключ в Google AI Studio и добавьте его в переменные окружения.");
  return k;
};

let modelCache: string | undefined;
/** TTS-модель: GEMINI_TTS_MODEL или первая доступная *tts* (предпочтительно flash) */
export async function ttsModel(): Promise<string> {
  if (process.env.GEMINI_TTS_MODEL) return process.env.GEMINI_TTS_MODEL;
  if (modelCache) return modelCache;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key() } });
  if (!res.ok) throw new Error(`Gemini models ${res.status}: ${await res.text()}`);
  const names = ((await res.json()) as { models: { name: string }[] }).models.map((m) => m.name.replace(/^models\//, ""));
  const tts = names.filter((n) => /tts/i.test(n));
  if (!tts.length) throw new Error(`Нет TTS-моделей среди: ${names.join(", ")}`);
  modelCache = tts.find((n) => /flash/.test(n) && !/preview/.test(n)) ?? tts.find((n) => /flash/.test(n)) ?? tts[0];
  console.log(`  Gemini TTS: ${modelCache}`);
  return modelCache;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Убирает теги интонации ElevenLabs ([whispers] и т.п.) */
export const plain = (text: string) => text.replace(/\[[^\]]*\]\s*/g, "").trim();

/**
 * Синтез одной реплики. direction — режиссёрская ремарка (по-английски), как именно произнести.
 * Пишет mp3 в out и возвращает оценку времени слов.
 */
export async function geminiTts(voice: string, text: string, out: string, direction?: string): Promise<Timing> {
  const model = await ttsModel();
  const line = plain(text);
  const prompt = direction ? `${direction}. Say it in Russian, exactly these words:\n${line}` : line;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const txt = await res.text();
      const m = txt.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
      const wait = Math.min(90, m ? Number(m[1]) + 1 : 20 * attempt);
      if (attempt >= 6) throw new Error(`Gemini TTS ${res.status}: ${txt.slice(0, 400)}`);
      console.log(`  …лимит/ошибка ${res.status}, жду ${wait} с`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 600)}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[] };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) {
      if (attempt >= 3) throw new Error(`Gemini TTS: нет звука в ответе: ${JSON.stringify(data).slice(0, 400)}`);
      continue;
    }
    const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
    const pcm = out.replace(/\.mp3$/, ".pcm");
    fs.writeFileSync(pcm, Buffer.from(part.inlineData.data, "base64"));
    // PCM → mp3 44.1 кГц; тишину по краям обрезаем
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", pcm,
      "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,aresample=44100",
      "-c:a", "libmp3lame", "-b:a", "160k", out,
    ]);
    fs.unlinkSync(pcm);
    return estimateTiming(out, line);
  }
}

// ---------------------------------------------------------------------
// Оценка времени слов по паузам
// ---------------------------------------------------------------------
type Tok = { word: string; weight: number; punct: number };

/** Слова как у ElevenLabs-alignment (буквы/цифры), сила пунктуации после слова и «вес» (слоги) */
export function tokenize(text: string): Tok[] {
  const toks: Tok[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const vowels = (m[0].match(/[аеёиоуыэюяaeiouy]/giu) ?? []).length;
    toks.push({ word: m[0], weight: Math.max(1, vowels) + 0.35, punct: 0 });
    const tail = text.slice(m.index + m[0].length).match(/^[^\p{L}\p{N}]*/u)![0];
    toks[toks.length - 1].punct = /[.!?…]/.test(tail) ? 3 : /[,;:—–]/.test(tail) ? 2 : /[«»"()]/.test(tail) ? 1 : 0;
  }
  return toks;
}

/** Отрезки речи (между паузами) */
export function speechSegments(file: string, minSilence = 0.14, noise = -38): [number, number][] {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", `silencedetect=n=${noise}dB:d=${minSilence}`, "-f", "null", "-"], { encoding: "utf8" });
  const log = r.stderr ?? "";
  const d = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const dur = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const sil: [number, number][] = [];
  let s: number | null = null;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === "start") s = Number(m[2]);
    else if (s !== null) sil.push([s, Number(m[2])]), (s = null);
  }
  if (s !== null) sil.push([s, dur]);
  // отрезки короче 0.12 с — вдохи и щелчки, не речь
  const seg: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of sil) {
    if (a - cur > 0.12) seg.push([cur, a]);
    cur = b;
  }
  if (dur - cur > 0.12) seg.push([cur, dur]);
  return seg.length ? seg : [[0, dur]];
}

export function estimateTiming(file: string, text: string): Timing {
  const toks = tokenize(text);
  let seg = speechSegments(file);
  // отрезков не больше, чем слов: сливаем отрезки через самые короткие паузы
  while (seg.length > toks.length && seg.length > 1) {
    let k = 0;
    for (let i = 1; i < seg.length - 1; i++) if (seg[i + 1][0] - seg[i][1] < seg[k + 1][0] - seg[k][1]) k = i;
    seg = [...seg.slice(0, k), [seg[k][0], seg[k + 1][1]], ...seg.slice(k + 2)];
  }
  const n = toks.length;
  const m = seg.length;
  const W = toks.reduce((a, t) => a + t.weight, 0);
  const T = seg.reduce((a, [x, y]) => a + (y - x), 0);
  const cw = [0];
  toks.forEach((t) => cw.push(cw[cw.length - 1] + t.weight));
  const ct = [0];
  seg.forEach(([x, y]) => ct.push(ct[ct.length - 1] + (y - x)));
  // DP: разбить слова на m подряд идущих групп; паузы — на знаках препинания, темп речи в группах ровный
  const INF = 1e9;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(INF));
  const back = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  dp[0][0] = 0;
  for (let j = 1; j <= m; j++)
    for (let i = j; i <= n - (m - j); i++)
      for (let k = j - 1; k < i; k++) {
        if (dp[j - 1][k] >= INF) continue;
        const rate = Math.log(((ct[j] - ct[j - 1]) / T) / ((cw[i] - cw[k]) / W));
        const p = i < n ? toks[i - 1].punct : 3;
        // длинная пауза не там, где точка, — маловероятна
        const gap = j < m ? seg[j][0] - seg[j - 1][1] : 0;
        const where = (p === 3 ? 0 : p === 2 ? 0.1 : p === 1 ? 0.35 : 1.0) * (0.6 + 1.5 * gap);
        const drift = Math.abs(cw[i] / W - ct[j] / T);
        const cost = dp[j - 1][k] + rate * rate + where + 2 * drift;
        if (cost < dp[j][i]) (dp[j][i] = cost), (back[j][i] = k);
      }
  const cuts: number[] = [];
  for (let j = m, i = n; j > 0; j--) {
    cuts.unshift(i);
    i = back[j][i];
  }
  const words: Timing["words"] = [];
  let from = 0;
  cuts.forEach((to, j) => {
    const [a, b] = seg[j];
    const gw = cw[to] - cw[from];
    let t = a;
    for (let i = from; i < to; i++) {
      const len = ((b - a) * toks[i].weight) / gw;
      words.push({ word: toks[i].word, start: +t.toFixed(3), end: +(t + len).toFixed(3) });
      t += len;
    }
    from = to;
  });
  return { duration: words.length ? words[words.length - 1].end : T, words };
}
