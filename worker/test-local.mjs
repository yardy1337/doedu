// Локальная проверка Worker в Node: запросы идут через прокси песочницы.
import { ProxyAgent, setGlobalDispatcher } from 'undici';
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
const worker = (await import('./dist/worker.js')).default;
const env = { YANDEX_KEY: process.env.YANDEX_KEY, TP_TOKEN: '', TP_MARKER: '795764' };
const [from, to, date] = process.argv.slice(2);
const res = await worker.fetch(new Request(`https://x/api/search?from=${from}&to=${to}&date=${date}`, { headers: { Origin: 'https://yardyproject.ru' } }), env);
const body = await res.json();
console.log(res.status, res.headers.get('access-control-allow-origin'), body.error ?? '', 'routes', body.routes?.length);
for (const r of (body.routes ?? []).slice(0, 8)) {
  console.log(' ', r.departure.slice(11, 16), '→', r.arrival.slice(11, 16), r.duration + 'мин', r.price, r.priceStatus, r.modes.join('+'),
    r.legs.map((l) => l.kind === 'trip' ? `${l.from.city}/${l.from.title}>${l.to.city}/${l.to.title} ${l.service} ${l.price ?? '-'}${l.priceApprox ? '~' : ''}` : `[переезд ${l.from.title}→${l.to.title}]`).join(' | '));
}
if (body.routes?.[0]) console.log(body.routes[0].legs[0].buyUrl);
