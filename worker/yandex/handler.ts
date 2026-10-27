// Запуск API «Доеду» в Yandex Cloud Functions (Node.js 18+).
// Тот же код, что в Cloudflare Worker (src/index.ts): переводим событие функции
// в стандартный Request, ответ Response — обратно в формат функции.
// Зачем: Cloudflare в России замедляют, а Yandex Cloud доступен и из России, и из-за рубежа (в том числе через VPN).

import worker from '../src/index';
import { handleAccount, HttpError, setIamToken } from './auth';

type YcEvent = {
  httpMethod: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  path?: string;
  url?: string;
  params?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext?: { identity?: { sourceIp?: string } };
};

const ACCOUNT_ORIGINS = ['https://doedu-russia.ru', 'https://www.doedu-russia.ru', 'http://localhost:5173', 'http://localhost:4173'];

function accountCors(origin: string | undefined): Record<string, string> {
  if (!origin || !ACCOUNT_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const env = {
  YANDEX_KEY: process.env.YANDEX_KEY ?? '',
  TP_TOKEN: process.env.TP_TOKEN,
  TP_MARKER: process.env.TP_MARKER ?? '795764',
};

export async function handler(event: YcEvent, context?: { token?: { access_token?: string; expires_in?: number } }) {
  setIamToken(context?.token);
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers ?? {})) headers.set(k, v);
  // Путь: из API Gateway (/api/search) или из параметра ?path= при прямом вызове функции
  // (https://functions.yandexcloud.net/<id>?path=/api/search&from=…).
  const query = { ...(event.queryStringParameters ?? {}) };
  const path = query.path ?? (event.path && event.path !== '/' ? event.path : '/api/search');
  delete query.path;
  const qs = new URLSearchParams(query).toString();

  // Личный кабинет (регистрация, вход, избранное) — только здесь, в Yandex Cloud: данные хранятся в России.
  if (/^\/api\/(auth\/|me$|favorites$)/.test(path)) {
    const h = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const cors = accountCors(h.origin);
    const reply = (status: number, body: unknown) => ({
      statusCode: status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
      body: JSON.stringify(body),
      isBase64Encoded: false,
    });
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '', isBase64Encoded: false };
    const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
    try {
      const ip = event.requestContext?.identity?.sourceIp ?? h['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';
      const res = await handleAccount(event.httpMethod, path, query, h, raw, ip);
      return res ? reply(res.status, res.body) : reply(404, { error: 'Not found' });
    } catch (e) {
      if (e instanceof HttpError) return reply(e.status, { error: e.message });
      console.error('account error', e);
      // Только тип ошибки (например, SchemeError) — без текста и данных: помогает чинить, ничего не раскрывает
      const code = e instanceof Error ? (e.constructor?.name || e.name || 'Error') : typeof e;
      // DEBUG_ERRORS=1 в переменных функции — показать текст ошибки (без ключей/токенов). По умолчанию выключено.
      const detail =
        process.env.DEBUG_ERRORS === '1'
          ? String(e instanceof Error ? e.message : e)
              .replace(/[A-Za-z0-9+/_=-]{24,}/g, '<скрыто>')
              .slice(0, 300)
          : undefined;
      return reply(500, { error: 'Ошибка сервера. Попробуйте позже.', code, detail });
    }
  }
  const request = new Request(`https://api.doedu-russia.ru${path}${qs ? `?${qs}` : ''}`, { method: event.httpMethod, headers });
  const res = await worker.fetch(request, env);
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k] = v));
  return { statusCode: res.status, headers: out, body: await res.text(), isBase64Encoded: false };
}
