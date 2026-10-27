// ═════════════════════════════════════════════════════════════════════════════
// doedu-api — серверная прослойка доеду на Cloudflare Workers.
//
// Зачем: браузер не может обращаться к API Яндекс Расписаний и Travelpayouts напрямую
// (нет CORS), а ключи нельзя показывать в коде сайта. Worker хранит ключи в секретах,
// собирает ответ из двух источников и кеширует его.
//
// Источники:
//   • API Яндекс Расписаний — расписание самолётов, поездов, электричек и автобусов
//     по всей России, включая готовые стыковки разными видами транспорта (transfers=true).
//   • Travelpayouts (Aviasales Data API) — цены на авиабилеты из кеша поисков Aviasales.
//     Если цена совпала с конкретным рейсом — она точная, иначе это «от … ₽» по направлению.
//   • Цены на поезда — партнёрский API Туту.ру через Travelpayouts (tutu.ts), любые города России.
//   • Цены автобусов и части поездов приходят прямо от Яндекса (tickets_info).
//   • Свои стыковки через крупные узлы (hubs.ts) — чтобы в выдаче были поезда и автобусы,
//     а не только самолётные стыковки, которые предлагает Яндекс.
//
// Секреты (wrangler secret / панель Cloudflare): YANDEX_KEY, TP_TOKEN. Переменная: TP_MARKER.
// ═════════════════════════════════════════════════════════════════════════════

import stationsData from '../../data/stations.json';
import { minConnection, pickHubs } from './hubs';
import { TUTU_ERID, tutuForTrain, type Fare } from './tutu';

interface Env {
  YANDEX_KEY: string;
  TP_TOKEN?: string;
  TP_MARKER?: string;
}

// Код станции Яндекса → [город, IATA аэропорта, IATA города, широта, долгота]
const STATIONS = stationsData as Record<string, [string, string | null, string | null, number | null, number | null]>;

const ALLOWED_ORIGINS = ['https://yardyproject.ru', 'https://doedu-russia.ru', 'https://www.doedu-russia.ru', 'http://localhost:5173', 'http://localhost:4173'];
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { exp: number; body: string }>();

// ─── Типы ответа (зеркало src/types.ts на фронтенде) ─────────────────────────

type TransportType = 'air' | 'train' | 'bus';

interface Station {
  code: string;
  title: string;
  city: string;
}

interface TripLeg {
  kind: 'trip';
  id: string;
  from: Station;
  to: Station;
  departure: string; // ISO со смещением местного времени
  arrival: string;
  duration: number; // минуты
  transportType: TransportType;
  operator: string;
  service: string;
  vehicle?: string;
  price: number | null;
  priceApprox: boolean;
  /** Цены нет ни у перевозчика, ни у партнёров — это оценка по расстоянию и средним тарифам. */
  priceEstimated?: boolean;
  buyUrl: string;
  /** Цены по классам вагонов (поезда, Туту.ру). */
  fares?: Fare[];
  /** Маркировка рекламы для партнёрской ссылки. */
  adLabel?: string;
  buyLabel?: string;
}

interface TransitLeg {
  kind: 'transit';
  id: string;
  city: string;
  from: Station;
  to: Station;
  /** Ориентировочная стоимость переезда городским транспортом. */
  price?: number;
  priceEstimated?: boolean;
}

type Leg = TripLeg | TransitLeg;

interface Route {
  id: string;
  legs: Leg[];
  departure: string;
  arrival: string;
  duration: number;
  price: number | null;
  priceStatus: 'exact' | 'approx' | 'estimate' | 'partial' | 'none';
  transfers: number;
  modes: TransportType[];
}

// ─── Яндекс Расписания (минимальные типы ответа) ─────────────────────────────

interface YStation {
  code: string;
  title: string;
  type?: string;
}
interface YThread {
  uid: string;
  number: string;
  title: string;
  transport_type: string;
  vehicle?: string | null;
  carrier?: { title: string; codes?: { iata?: string | null } } | null;
  transport_subtype?: { title?: string | null };
}
interface YLeg {
  thread: YThread;
  from: YStation;
  to: YStation;
  departure: string;
  arrival: string;
  duration: number;
  tickets_info?: { places?: { price?: { whole: number; cents: number }; currency?: string }[] } | null;
}
interface YTransfer {
  is_transfer: true;
  transfer_point?: YStation;
  transfer_from: YStation;
  transfer_to: YStation;
}
interface YSegment extends Partial<YLeg> {
  has_transfers?: boolean;
  departure_from?: YStation;
  arrival_to?: YStation;
  details?: (YLeg | YTransfer)[];
}
interface YResponse {
  search?: { from: YStation; to: YStation };
  segments?: YSegment[];
  pagination?: { total: number; limit: number; offset: number };
  error?: { text: string };
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin), ...extra },
  });
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
  }
  return {};
}

const TRANSPORT: Record<string, TransportType | undefined> = { plane: 'air', train: 'train', suburban: 'train', bus: 'bus' };

function station(s: YStation | undefined, fallbackCity: string): Station {
  if (!s) return { code: '', title: fallbackCity, city: fallbackCity };
  const known = STATIONS[s.code];
  return { code: s.code, title: s.title, city: known?.[0] ?? (s.type === 'settlement' ? s.title : fallbackCity) };
}

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

// ─── Цены на авиабилеты (Travelpayouts) ──────────────────────────────────────

interface TpPrice {
  airline: string;
  flight_number: string;
  origin_airport: string;
  destination_airport: string;
  departure_at: string;
  price: number;
  link: string;
  transfers: number;
}

/** Цены по паре городов (IATA) на дату: только прямые рейсы, по возрастанию цены. */
async function tpPrices(env: Env, from: string, to: string, date: string): Promise<TpPrice[]> {
  const key = `tp:${from}:${to}:${date}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return JSON.parse(hit.body);
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  url.search = new URLSearchParams({
    origin: from,
    destination: to,
    departure_at: date,
    one_way: 'true',
    direct: 'true',
    currency: 'rub',
    sorting: 'price',
    limit: date.length === 7 ? '100' : '30', // за месяц — цены по всем дням
  }).toString();
  const headers: Record<string, string> = {};
  if (env.TP_TOKEN) headers['X-Access-Token'] = env.TP_TOKEN;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as { success?: boolean; data?: TpPrice[] };
    const list = (data.data ?? []).filter((p) => p.transfers === 0);
    cache.set(key, { exp: Date.now() + CACHE_TTL_MS, body: JSON.stringify(list) });
    return list;
  } catch {
    return []; // без цены лучше, чем без маршрута
  }
}

const ddmm = (date: string) => date.slice(8, 10) + date.slice(5, 7);

// ─── Сборка маршрутов ────────────────────────────────────────────────────────

function tripLeg(l: YLeg, from: Station, to: Station, searchDate: string, id: string): TripLeg | null {
  const transportType = TRANSPORT[l.thread.transport_type];
  if (!transportType) return null; // водный транспорт и вертолёты пока не показываем
  const places = l.tickets_info?.places ?? [];
  const rub = places.filter((p) => p.price && (!p.currency || p.currency === 'RUB')).map((p) => p.price!.whole + p.price!.cents / 100);
  const subtype = l.thread.transport_subtype?.title?.replace(/[«»]/g, '');
  const date = l.departure.slice(0, 10) || searchDate;
  return {
    kind: 'trip',
    id,
    from,
    to,
    departure: l.departure,
    arrival: l.arrival,
    duration: Math.round(l.duration / 60),
    transportType,
    operator: l.thread.carrier?.title ?? (transportType === 'bus' ? 'Автобус' : 'Перевозчик'),
    service: [l.thread.number, subtype].filter(Boolean).join(' · '),
    vehicle: l.thread.vehicle ?? undefined,
    price: rub.length ? Math.min(...rub) : null,
    priceApprox: false,
    // У автобусов от партнёров Яндекса страницы рейса часто нет (uid «empty_…») — ведём на поиск по участку
    buyUrl:
      transportType === 'bus' || l.thread.uid.startsWith('empty')
        ? `https://rasp.yandex.ru/search/${transportType === 'bus' ? 'bus' : 'train'}/?fromId=${from.code}&toId=${to.code}&when=${date}`
        : `https://rasp.yandex.ru/thread/${encodeURIComponent(l.thread.uid)}/?departure=${date}`,
  };
}

function buildRoutes(y: YResponse, date: string): Route[] {
  const fromCity = y.search?.from.title ?? '';
  const toCity = y.search?.to.title ?? '';
  const routes: Route[] = [];

  for (const seg of y.segments ?? []) {
    const legs: Leg[] = [];
    if (!seg.has_transfers && seg.thread) {
      const leg = tripLeg(seg as YLeg, station(seg.from, fromCity), station(seg.to, toCity), date, seg.thread.uid);
      if (leg) legs.push(leg);
    } else if (seg.details) {
      // В деталях стыковки у сегментов только города; станции берём из соседних пересадок
      let current = station(seg.departure_from, fromCity);
      let ok = true;
      seg.details.forEach((d, i) => {
        if ('is_transfer' in d) {
          const city = d.transfer_point?.title ?? STATIONS[d.transfer_from.code]?.[0] ?? '';
          const a = station(d.transfer_from, city);
          const b = station(d.transfer_to, city);
          if (a.code !== b.code) legs.push({ kind: 'transit', id: `t${i}-${a.code}-${b.code}`, city, from: a, to: b });
          current = b;
          return;
        }
        const next = seg.details!.slice(i + 1).find((x): x is YTransfer => 'is_transfer' in x);
        const to = next ? station(next.transfer_from, next.transfer_point?.title ?? '') : station(seg.arrival_to, toCity);
        const leg = tripLeg(d, current, to, date, `${d.thread.uid}-${i}`);
        if (!leg) ok = false;
        else legs.push(leg);
      });
      if (!ok) continue;
    }
    const trips = legs.filter((l): l is TripLeg => l.kind === 'trip');
    if (!trips.length) continue;
    routes.push({
      id: trips.map((t) => t.id).join('__'),
      legs,
      departure: trips[0].departure,
      arrival: trips[trips.length - 1].arrival,
      duration: minutesBetween(trips[0].departure, trips[trips.length - 1].arrival),
      price: null,
      priceStatus: 'none',
      transfers: trips.length - 1,
      modes: [...new Set(trips.map((t) => t.transportType))],
    });
  }
  return routes;
}

// ─── Оценка цены, когда данных нет ни у перевозчика, ни у партнёров ─────────
// Средние тарифы по России (2025–2026): ориентир, чтобы в выдаче не было пропусков.
// Такая цена помечается на сайте знаком «≈».

function km(a?: Station, b?: Station): number | null {
  const A = a && STATIONS[a.code];
  const B = b && STATIONS[b.code];
  if (!A?.[3] || !B?.[3]) return null;
  const p = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [A[3]!, A[4]!, B[3]!, B[4]!];
  const h = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const round = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

function estimateLeg(leg: TripLeg): number {
  const direct = km(leg.from, leg.to);
  const hours = leg.duration / 60;
  const suburban = /пригородн|экспресс|ласточка/i.test(leg.service) && leg.transportType === 'train' && hours < 4;
  switch (leg.transportType) {
    case 'air':
      // Эконом по России: ~2 500 ₽ + ~4 ₽ за км
      return round(2500 + 4 * (direct ?? hours * 650), 100);
    case 'bus':
      return round(2.6 * (direct ? direct * 1.25 : hours * 55), 10);
    default:
      if (suburban) return round(Math.max(60, 3 * (direct ? direct * 1.2 : hours * 45)), 10);
      // Плацкарт: ~1.7 ₽ за км пути по железной дороге
      return round(Math.max(300, 1.7 * (direct ? direct * 1.3 : hours * 60)), 10);
  }
}

function estimateTransit(t: TransitLeg): number {
  const air = (c: string) => STATIONS[c]?.[1] != null;
  const capital = /Москва|Санкт-Петербург/.test(t.city);
  if (air(t.from.code) || air(t.to.code)) return capital ? 550 : 250; // аэроэкспресс / автобус в аэропорт
  return capital ? 70 : 50; // метро или городской автобус
}

/** Цены на авиабилеты в ближайшие ±3 дня — если на саму дату данных нет. */
async function tpPricesNear(env: Env, from: string, to: string, date: string): Promise<number | null> {
  const list = await tpPrices(env, from, to, date.slice(0, 7));
  const target = Date.parse(date);
  const near = list.filter((x) => Math.abs(Date.parse(x.departure_at.slice(0, 10)) - target) <= 3 * 86_400_000);
  return near.length ? Math.min(...near.map((x) => x.price)) : null;
}

/**
 * Цены для всех сегментов. Порядок источников для каждого вида транспорта —
 * от самого точного к оценке, чтобы ни у одного маршрута не осталось пропуска:
 *   самолёт: цена рейса (Aviasales) → минимум на направлении в эту дату → минимум ±3 дня → оценка;
 *   поезд:   цена поезда (Туту.ру) → минимум среди поездов направления → оценка;
 *   автобус: цена от Яндекса → минимум среди автобусов этого участка → оценка;
 *   переезд между станциями: ориентировочная стоимость городского транспорта.
 */
async function attachPrices(env: Env, routes: Route[], marker: string) {
  const allLegs = routes.flatMap((r) => r.legs);
  const trips = allLegs.filter((l): l is TripLeg => l.kind === 'trip');

  // ── Самолёты ──
  const planeLegs = trips
    .filter((l) => l.transportType === 'air')
    .map((leg) => ({ leg, fromCity: STATIONS[leg.from.code]?.[2] ?? null, toCity: STATIONS[leg.to.code]?.[2] ?? null }));
  const pairs = new Map<string, Promise<TpPrice[]>>();
  for (const p of planeLegs) {
    if (!p.fromCity || !p.toCity) continue;
    const date = p.leg.departure.slice(0, 10);
    const key = `${p.fromCity}-${p.toCity}-${date}`;
    if (!pairs.has(key)) pairs.set(key, tpPrices(env, p.fromCity, p.toCity, date));
  }
  const resolved = new Map<string, TpPrice[]>();
  await Promise.all([...pairs].map(async ([k, pr]) => resolved.set(k, await pr)));

  await Promise.all(
    planeLegs.map(async ({ leg, fromCity, toCity }) => {
      const date = leg.departure.slice(0, 10);
      if (!fromCity || !toCity) return;
      leg.buyUrl = `https://www.aviasales.ru/search/${fromCity}${ddmm(date)}${toCity}1?marker=${marker}`;
      leg.buyLabel = 'Купить на Aviasales';
      const list = resolved.get(`${fromCity}-${toCity}-${date}`) ?? [];
      const [airline, number] = leg.service.split(' · ')[0].split(' ');
      const exact = list.find((x) => x.airline === airline && x.flight_number === number && x.departure_at.slice(0, 10) === date);
      if (exact) {
        leg.price = exact.price;
        leg.priceApprox = false;
        leg.buyUrl = `https://www.aviasales.ru${exact.link}${exact.link.includes('?') ? '&' : '?'}marker=${marker}`;
      } else if (leg.price == null && list.length) {
        leg.price = Math.min(...list.map((x) => x.price));
        leg.priceApprox = true;
      } else if (leg.price == null) {
        const near = await tpPricesNear(env, fromCity, toCity, date);
        if (near != null) {
          leg.price = near;
          leg.priceApprox = true;
        }
      }
    }),
  );

  // ── Поезда: цены по классам и покупка на Туту.ру ──
  await Promise.all(
    trips
      .filter((l) => l.transportType === 'train' && !/пригородн/i.test(l.service))
      .map(async (leg) => {
        const info = await tutuForTrain(leg.from.city, leg.to.city, leg.service.split(' · ')[0], leg.departure.slice(0, 10));
        if (!info) return;
        leg.buyUrl = info.url;
        leg.buyLabel = 'Купить на Туту.ру';
        leg.adLabel = `Реклама · tutu.ru · erid ${TUTU_ERID}`;
        if (leg.price != null) return;
        if (info.fares.length) {
          leg.fares = info.fares;
          leg.price = info.fares[0].price;
          leg.priceApprox = true;
        } else if (info.pairMin != null) {
          leg.price = info.pairMin;
          leg.priceApprox = true;
        }
      }),
  );

  // ── Автобусы без цены: самая низкая цена среди автобусов того же участка ──
  const busMin = new Map<string, number>();
  for (const l of trips) {
    if (l.transportType !== 'bus' || l.price == null) continue;
    const key = `${l.from.city}>${l.to.city}`;
    busMin.set(key, Math.min(busMin.get(key) ?? Infinity, l.price));
  }
  for (const l of trips) {
    if (l.transportType === 'bus' && l.price == null && busMin.has(`${l.from.city}>${l.to.city}`)) {
      l.price = busMin.get(`${l.from.city}>${l.to.city}`)!;
      l.priceApprox = true;
    }
  }

  // ── Всё, что осталось без цены, — оценка ──
  for (const l of allLegs) {
    if (l.kind === 'trip' && l.price == null) {
      l.price = estimateLeg(l);
      l.priceApprox = true;
      l.priceEstimated = true;
    } else if (l.kind === 'transit' && l.price == null) {
      l.price = estimateTransit(l);
      l.priceEstimated = true;
    }
  }

  for (const r of routes) {
    const t = r.legs.filter((l): l is TripLeg => l.kind === 'trip');
    r.price = Math.round(r.legs.reduce((s, l) => s + (l.price ?? 0), 0));
    r.priceStatus = r.legs.some((l) => l.priceEstimated) ? 'estimate' : t.some((l) => l.priceApprox) ? 'approx' : 'exact';
  }
}

async function yandexSearch(env: Env, from: string, to: string, date: string, transfers = true): Promise<YResponse> {
  const key = `y:${from}:${to}:${date}:${transfers}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return JSON.parse(hit.body);
  const all: YSegment[] = [];
  let first: YResponse | null = null;
  for (let offset = 0, page = 0; page < 3; page++, offset += 100) {
    const url = new URL('https://api.rasp.yandex.net/v3.0/search/');
    url.search = new URLSearchParams({
      apikey: env.YANDEX_KEY,
      format: 'json',
      lang: 'ru_RU',
      from,
      to,
      date,
      transfers: String(transfers),
      limit: '100',
      offset: String(offset),
    }).toString();
    const res = await fetch(url);
    const data = (await res.json()) as YResponse;
    if (data.error) {
      if (page === 0) return data;
      break;
    }
    first ??= data;
    all.push(...(data.segments ?? []));
    const total = data.pagination?.total ?? 0;
    if (offset + 100 >= total) break;
  }
  const result = { ...(first ?? {}), segments: all };
  cache.set(key, { exp: Date.now() + CACHE_TTL_MS * 2, body: JSON.stringify(result) });
  return result;
}

const nextDate = (date: string) => new Date(Date.parse(date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);

/** Склеивает прямые рейсы А → узел и узел → Б в маршруты с пересадкой. */
async function hubRoutes(env: Env, from: string, to: string, date: string): Promise<Route[]> {
  const hubs = pickHubs(from, to, 3);
  const out: Route[] = [];
  await Promise.all(
    hubs.map(async (hub) => {
      const [first, second, secondNext] = await Promise.all([
        yandexSearch(env, from, hub, date, false),
        yandexSearch(env, hub, to, date, false),
        yandexSearch(env, hub, to, nextDate(date), false),
      ]);
      if (first.error) return;
      const legs1 = buildRoutes(first, date).filter((r) => r.legs.length === 1).map((r) => r.legs[0] as TripLeg);
      const legs2 = [...buildRoutes(second, date), ...(secondNext.error ? [] : buildRoutes(secondNext, date))]
        .filter((r) => r.legs.length === 1)
        .map((r) => r.legs[0] as TripLeg)
        .sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure));
      for (const a of legs1) {
        const arr = Date.parse(a.arrival);
        const perType = new Map<string, number>();
        for (const b of legs2) {
          const same = a.to.code === b.from.code;
          const gap = (Date.parse(b.departure) - arr) / 60000;
          if (gap < minConnection(a.transportType === 'air', b.transportType === 'air', same) || gap > 16 * 60) continue;
          // Ближайшие 2 стыковки каждого вида транспорта: более поздние почти никогда не лучше
          const n = perType.get(b.transportType) ?? 0;
          if (n >= 2) continue;
          perType.set(b.transportType, n + 1);
          const legs: Leg[] = [a];
          if (!same) legs.push({ kind: 'transit', id: `t-${a.to.code}-${b.from.code}`, city: b.from.city, from: a.to, to: b.from });
          legs.push(b);
          out.push({
            id: `${a.id}__${b.id}`,
            legs,
            departure: a.departure,
            arrival: b.arrival,
            duration: minutesBetween(a.departure, b.arrival),
            price: null,
            priceStatus: 'none',
            transfers: 1,
            modes: [...new Set([a.transportType, b.transportType])],
          });
        }
      }
    }),
  );
  return out;
}

/** Убирает повторы и стыковки, которые хуже других по времени при том же наборе транспорта и времени выезда. */
function mergeRoutes(base: Route[], extra: Route[]): Route[] {
  const sig = (r: Route) =>
    r.legs
      .filter((l): l is TripLeg => l.kind === 'trip')
      .map((t) => t.service.split(' · ')[0] + t.departure)
      .join('|');
  const seen = new Set(base.map(sig));
  const best = new Map<string, Route>();
  for (const r of extra) {
    if (seen.has(sig(r))) continue;
    // Группа: набор транспорта + 3-часовое окно отправления — внутри оставляем самый быстрый маршрут
    const key = [...r.modes].sort().join('+') + '@' + Math.floor(Number(r.departure.slice(11, 13)) / 3);
    const cur = best.get(key);
    if (!cur || r.duration < cur.duration) best.set(key, r);
  }
  return [...base, ...[...best.values()].sort((a, b) => a.duration - b.duration).slice(0, 40)];
}

async function handleSearch(url: URL, env: Env): Promise<{ status: number; body: unknown }> {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!/^[cs]\d+$/.test(from) || !/^[cs]\d+$/.test(to)) return { status: 400, body: { error: 'Укажите города отправления и назначения.' } };
  if (from === to) return { status: 400, body: { error: 'Пункты отправления и назначения совпадают.' } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, body: { error: 'Некорректная дата.' } };

  const y = await yandexSearch(env, from, to, date);
  if (y.error) {
    // «Ничего не нашли» — не ошибка сервиса, а пустая выдача
    if (/не найден|not found/i.test(y.error.text)) return { status: 200, body: { routes: [], meta: { from: { code: from, title: '' }, to: { code: to, title: '' }, date } } };
    return { status: 502, body: { error: 'Сервис расписаний вернул ошибку: ' + y.error.text } };
  }
  const extra = await hubRoutes(env, from, to, date).catch(() => [] as Route[]);
  const routes = mergeRoutes(buildRoutes(y, date), extra);
  await attachPrices(env, routes, env.TP_MARKER || '795764');
  const fromTitle = y.search?.from.title ?? '';
  const toTitle = y.search?.to.title ?? '';
  return {
    status: 200,
    body: {
      routes,
      meta: {
        from: { code: from, title: fromTitle },
        to: { code: to, title: toTitle },
        date,
        source: 'yandex-rasp',
        fetchedAt: new Date().toISOString(),
        blablacarUrl: `https://www.blablacar.ru/search?fn=${encodeURIComponent(fromTitle)}&tn=${encodeURIComponent(toTitle)}&db=${date}`,
      },
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin);

    if (url.pathname === '/api/health') {
      // ?pad — ~48 КБ несжимаемых данных: сайт по скорости их загрузки выбирает адрес API,
      // который не замедляют (короткий ответ проходит даже через замедленный канал).
      if (!url.searchParams.has('pad')) return json({ ok: true, prices: Boolean(env.TP_TOKEN) }, 200, origin);
      const bytes = new Uint8Array(36000);
      crypto.getRandomValues(bytes);
      let pad = '';
      for (let i = 0; i < bytes.length; i += 8192) pad += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return json({ ok: true, pad: btoa(pad) }, 200, origin, { 'Cache-Control': 'no-store' });
    }

    if (url.pathname === '/api/search') {
      const key = url.pathname + url.search;
      const hit = cache.get(key);
      if (hit && hit.exp > Date.now()) return json(hit.body, 200, origin, { 'X-Cache': 'HIT' });
      try {
        const { status, body } = await handleSearch(url, env);
        const text = JSON.stringify(body);
        if (status === 200) {
          cache.set(key, { exp: Date.now() + CACHE_TTL_MS, body: text });
          if (cache.size > 300) cache.delete(cache.keys().next().value!);
        }
        return json(text, status, origin, { 'Cache-Control': 'public, max-age=600' });
      } catch (e) {
        return json({ error: 'Не удалось получить расписание. Попробуйте ещё раз.' }, 502, origin);
      }
    }
    return json({ error: 'Not found' }, 404, origin);
  },
};
