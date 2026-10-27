// Ключи внешних API и уведомления в Telegram — управляются из кабинета основателя.
//
// Ключ из кабинета хранится в таблице settings (k = "key:<ИМЯ>") зашифрованным AES-256-GCM тем же
// AUTH_SECRET, что и почты. Если в кабинете ключ не задан — берётся переменная окружения функции.
// Cloudflare Worker забирает ключи отсюда (GET /api/internal/keys) по общему секрету INTERNAL_SECRET.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decrypt, encrypt, HttpError, q, U } from './auth';

export const KEY_SPECS = {
  YANDEX_KEY: { secret: true, re: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, hint: 'вида xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  TP_TOKEN: { secret: true, re: /^[A-Za-z0-9]{16,64}$/, hint: '32 символа из кабинета Travelpayouts' },
  TP_MARKER: { secret: false, re: /^\d{3,10}$/, hint: 'только цифры' },
  TG_BOT_TOKEN: { secret: true, re: /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/, hint: 'вида 123456789:AA… от @BotFather' },
  TG_CHAT_ID: { secret: false, re: /^-?\d{3,20}$/, hint: 'число; нажмите «Найти» после /start боту' },
  INTERNAL_SECRET: { secret: true, re: /^[A-Za-z0-9_-]{32,128}$/, hint: 'создаётся кнопкой «Сгенерировать»' },
} as const;
export type KeyName = keyof typeof KEY_SPECS;
const NAMES = Object.keys(KEY_SPECS) as KeyName[];

type Stored = { value: string; updated: string };
let cache: { exp: number; db: Partial<Record<KeyName, Stored>> } | null = null;

async function loadDb(): Promise<Partial<Record<KeyName, Stored>>> {
  if (cache && cache.exp > Date.now()) return cache.db;
  const db: Partial<Record<KeyName, Stored>> = {};
  try {
    const rows = await q<{ k: string; v: string }>(`SELECT k, v FROM settings WHERE StartsWith(k, "key:");`);
    for (const r of rows) {
      const name = r.k.slice(4) as KeyName;
      if (!NAMES.includes(name)) continue;
      try {
        const { v, updated } = JSON.parse(r.v) as { v: string; updated: string };
        db[name] = { value: decrypt(v), updated };
      } catch {
        /* запись, зашифрованная другим AUTH_SECRET, — пропускаем */
      }
    }
  } catch {
    // нет связи с базой — работаем на ключах из переменных окружения
    cache = { exp: Date.now() + 10_000, db: cache?.db ?? {} };
    return cache.db;
  }
  cache = { exp: Date.now() + 60_000, db };
  return db;
}

/** Действующее значение ключа: из кабинета, иначе из переменной окружения. */
export async function getKey(name: KeyName): Promise<string | undefined> {
  return (await loadDb())[name]?.value || process.env[name] || undefined;
}

export async function searchEnv() {
  return {
    YANDEX_KEY: (await getKey('YANDEX_KEY')) ?? '',
    TP_TOKEN: await getKey('TP_TOKEN'),
    TP_MARKER: (await getKey('TP_MARKER')) ?? '795764',
  };
}

const tail = (v: string) => (v.length > 8 ? `••••${v.slice(-4)}` : '••••');

export async function listKeys() {
  const db = await loadDb();
  return NAMES.map((name) => {
    const fromDb = db[name];
    const env = process.env[name];
    const value = fromDb?.value || env;
    return {
      name,
      source: fromDb ? 'cabinet' : env ? 'env' : 'none',
      preview: value ? (KEY_SPECS[name].secret ? tail(value) : value) : null,
      updated: fromDb?.updated ?? null,
      hint: KEY_SPECS[name].hint,
    };
  });
}

export async function setKey(name: string, value: string) {
  if (!NAMES.includes(name as KeyName)) throw new HttpError(400, 'Неизвестный ключ.');
  const n = name as KeyName;
  const v = value.trim();
  if (!v) {
    await q(`DECLARE $k AS Utf8; DELETE FROM settings WHERE k = $k;`, { $k: U(`key:${n}`) });
  } else {
    if (!KEY_SPECS[n].re.test(v)) throw new HttpError(400, `Неверный формат: ${KEY_SPECS[n].hint}.`);
    const payload = JSON.stringify({ v: encrypt(v), updated: new Date().toISOString() });
    await q(`DECLARE $k AS Utf8; DECLARE $v AS Utf8; UPSERT INTO settings (k, v) VALUES ($k, $v);`, { $k: U(`key:${n}`), $v: U(payload) });
  }
  cache = null;
}

/** Новый секрет связи с Cloudflare: сохраняется в кабинете и возвращается один раз — вставить в Cloudflare. */
export async function generateInternalSecret(): Promise<string> {
  const value = randomBytes(32).toString('base64url');
  await setKey('INTERNAL_SECRET', value);
  await q(`DELETE FROM settings WHERE k = "cf:sync";`).catch(() => undefined);
  return value;
}

// ─── Настройки (флаги, отметки времени) ─────────────────────────────────────
export async function getSetting(k: string): Promise<string | null> {
  const rows = await q<{ v: string }>(`DECLARE $k AS Utf8; SELECT v FROM settings WHERE k = $k;`, { $k: U(k) }).catch(() => []);
  return rows[0]?.v ?? null;
}
export async function putSetting(k: string, v: string) {
  await q(`DECLARE $k AS Utf8; DECLARE $v AS Utf8; UPSERT INTO settings (k, v) VALUES ($k, $v);`, { $k: U(k), $v: U(v) });
}

// ─── Telegram ───────────────────────────────────────────────────────────────
// Из Yandex Cloud api.telegram.org часто недоступен — тогда шлём через Cloudflare Worker (тот же общий секрет).
const RELAY_URL = 'https://doedu-api.doedu.workers.dev/api/relay/telegram';
let directBroken = false;

async function tg(method: string, body: Record<string, unknown>, token?: string) {
  const t = token ?? (await getKey('TG_BOT_TOKEN'));
  if (!t) throw new HttpError(400, 'Сначала сохраните токен бота.');
  let res: Response | null = null;
  let why = '';
  if (!directBroken) {
    try {
      res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
    } catch (e) {
      directBroken = true;
      const err = e as Error & { cause?: { code?: string } };
      why = err.name === 'TimeoutError' ? 'нет ответа' : err.cause?.code || err.message;
    }
  }
  if (!res) {
    const secret = await getKey('INTERNAL_SECRET');
    if (!secret) {
      throw new HttpError(502, 'Из Yandex Cloud нет связи с Telegram — сообщения идут через Cloudflare. Сначала подключите «Связь с Cloudflare» ниже.');
    }
    try {
      res = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': secret },
        body: JSON.stringify({ token: t, method, payload: body }),
        signal: AbortSignal.timeout(6000),
      });
    } catch (e) {
      const err = e as Error;
      throw new HttpError(502, `Нет связи с Telegram ни напрямую (${why || 'отключено'}), ни через Cloudflare (${err.name === 'TimeoutError' ? 'нет ответа' : err.message}).`);
    }
    if (res.status === 404) throw new HttpError(502, 'Cloudflare не принял секрет связи: проверьте, что INTERNAL_SECRET в Cloudflare совпадает с созданным в кабинете.');
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new HttpError(400, `Telegram: ${String(data.description ?? res.status).replace(t, '<токен>')}`);
  return data.result;
}

export async function sendTelegram(text: string) {
  const chat = await getKey('TG_CHAT_ID');
  if (!chat) throw new HttpError(400, 'Сначала сохраните chat id.');
  await tg('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
}

/** Чаты, которые недавно писали боту, — чтобы не искать chat id вручную. */
export async function findChats() {
  const updates = (await tg('getUpdates', { limit: 50 })) as {
    message?: { chat: { id: number; first_name?: string; last_name?: string; username?: string; title?: string } };
  }[];
  const chats = new Map<number, string>();
  for (const u of updates) {
    const c = u.message?.chat;
    if (c) chats.set(c.id, c.title ?? ([c.first_name, c.last_name].filter(Boolean).join(' ') || (c.username ? `@${c.username}` : String(c.id))));
  }
  return [...chats].map(([id, name]) => ({ id: String(id), name }));
}

export type NotifyKind = 'register' | 'rasp';
const NOTIFY_DEFAULT: Record<NotifyKind, boolean> = { register: true, rasp: true };

export async function notifyFlags(): Promise<Record<NotifyKind, boolean>> {
  const raw = await getSetting('notify');
  return { ...NOTIFY_DEFAULT, ...(raw ? (JSON.parse(raw) as Partial<Record<NotifyKind, boolean>>) : {}) };
}

/**
 * Уведомление основателю. Никогда не бросает: сбой Telegram не должен ломать регистрацию или поиск.
 * throttleHours — не чаще раза в N часов для этого вида.
 */
export async function notify(kind: NotifyKind, text: string, throttleHours = 0) {
  try {
    if (!(await getKey('TG_BOT_TOKEN')) || !(await getKey('TG_CHAT_ID'))) return;
    if (!(await notifyFlags())[kind]) return;
    if (throttleHours) {
      const last = await getSetting(`alert:${kind}`);
      if (last && Date.now() - Date.parse(last) < throttleHours * 3_600_000) return;
      await putSetting(`alert:${kind}`, new Date().toISOString());
    }
    await sendTelegram(text);
  } catch (e) {
    console.error('notify failed', e instanceof Error ? e.message : e);
  }
}

// ─── Проверка ключей ────────────────────────────────────────────────────────
const hideKeys = (s: string, ...keys: (string | undefined)[]) =>
  keys.reduce<string>((acc, k) => (k ? acc.replaceAll(k, '<ключ>') : acc), s).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '<ключ>');

export async function testKey(name: string): Promise<{ ok: boolean; message: string }> {
  if (name === 'YANDEX_KEY') {
    const key = await getKey('YANDEX_KEY');
    if (!key) return { ok: false, message: 'Ключ не задан.' };
    const url = new URL('https://api.rasp.yandex.net/v3.0/search/');
    url.search = new URLSearchParams({ apikey: key, format: 'json', lang: 'ru_RU', from: 'c213', to: 'c2', date: new Date().toISOString().slice(0, 10), limit: '1' }).toString();
    try {
      const data = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as { error?: { text?: string } };
      if (data.error) return { ok: false, message: hideKeys(String(data.error.text ?? 'ошибка'), key) };
      return { ok: true, message: 'Ключ работает.' };
    } catch {
      return { ok: false, message: 'Нет связи с API Яндекс Расписаний.' };
    }
  }
  if (name === 'TP_TOKEN') {
    const token = await getKey('TP_TOKEN');
    if (!token) return { ok: false, message: 'Токен не задан.' };
    const url = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=MOW&destination=LED&currency=rub&limit=1&one_way=true';
    try {
      const res = await fetch(url, { headers: { 'X-Access-Token': token }, signal: AbortSignal.timeout(8000) });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (res.ok && data.success) return { ok: true, message: 'Токен работает.' };
      return { ok: false, message: hideKeys(`Travelpayouts: ${data.error ?? res.status}`, token) };
    } catch {
      return { ok: false, message: 'Нет связи с Travelpayouts.' };
    }
  }
  if (name === 'TG_BOT_TOKEN' || name === 'TG_CHAT_ID') {
    try {
      await sendTelegram('✅ Доеду: уведомления подключены. Сюда будут приходить новости о сайте.');
      return { ok: true, message: 'Тестовое сообщение отправлено — проверьте Telegram.' };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Ошибка Telegram.' };
    }
  }
  if (name === 'INTERNAL_SECRET') {
    const last = await getSetting('cf:sync');
    return last
      ? { ok: true, message: `Cloudflare забирал ключи ${new Date(last).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК).` }
      : { ok: false, message: 'Cloudflare ещё ни разу не забирал ключи. Сделайте поиск на сайте через VPN и проверьте снова.' };
  }
  return { ok: false, message: 'Для этого ключа проверки нет.' };
}

// ─── Внутренний канал для Cloudflare Worker ─────────────────────────────────
async function checkInternal(header: string | undefined) {
  const secret = await getKey('INTERNAL_SECRET');
  if (!secret || !header) throw new HttpError(404, 'Not found');
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(secret).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(404, 'Not found');
}

export async function handleInternal(method: string, path: string, headers: Record<string, string>, body: Record<string, unknown>) {
  await checkInternal(headers['x-internal-key']);
  if (method === 'GET' && path === '/api/internal/keys') {
    // отметка «Cloudflare на связи» — не чаще раза в 10 минут, чтобы не писать в базу на каждый запрос
    const last = await getSetting('cf:sync');
    if (!last || Date.now() - Date.parse(last) > 600_000) await putSetting('cf:sync', new Date().toISOString()).catch(() => undefined);
    return { status: 200, body: await searchEnv() };
  }
  if (method === 'POST' && path === '/api/internal/alert') {
    await raspAlert(String(body.text ?? ''));
    return { status: 200, body: { ok: true } };
  }
  throw new HttpError(404, 'Not found');
}

/** Ключ Расписаний перестал работать — сообщить основателю (не чаще раза в 6 часов). */
export async function raspAlert(text: string) {
  const key = await getKey('YANDEX_KEY');
  const reason = hideKeys(text, key).slice(0, 200) || 'ошибка API';
  await notify('rasp', `⚠️ Доеду: поиск не работает — Яндекс Расписания отвечают ошибкой:\n«${reason}»\n\nЗаменить ключ: https://doedu-russia.ru/admin/`, 6);
}
