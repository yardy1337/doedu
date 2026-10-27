// Запуск API «Доеду» в Yandex Cloud Functions (Node.js 18+).
// Тот же код, что в Cloudflare Worker (src/index.ts): переводим событие функции
// в стандартный Request, ответ Response — обратно в формат функции.
// Зачем: Cloudflare в России замедляют, а Yandex Cloud доступен и из России, и из-за рубежа (в том числе через VPN).

import worker from '../src/index';

type YcEvent = {
  httpMethod: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  path?: string;
  url?: string;
  params?: Record<string, string>;
};

const env = {
  YANDEX_KEY: process.env.YANDEX_KEY ?? '',
  TP_TOKEN: process.env.TP_TOKEN,
  TP_MARKER: process.env.TP_MARKER ?? '795764',
};

export async function handler(event: YcEvent) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers ?? {})) headers.set(k, v);
  // Путь: из API Gateway (/api/search) или из параметра ?path= при прямом вызове функции
  // (https://functions.yandexcloud.net/<id>?path=/api/search&from=…).
  const query = { ...(event.queryStringParameters ?? {}) };
  const path = query.path ?? (event.path && event.path !== '/' ? event.path : '/api/search');
  delete query.path;
  const qs = new URLSearchParams(query).toString();
  const request = new Request(`https://api.doedu-russia.ru${path}${qs ? `?${qs}` : ''}`, { method: event.httpMethod, headers });
  const res = await worker.fetch(request, env);
  const out: Record<string, string> = {};
  res.headers.forEach((v, k) => (out[k] = v));
  return { statusCode: res.status, headers: out, body: await res.text(), isBase64Encoded: false };
}
