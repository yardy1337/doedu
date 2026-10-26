// ═════════════════════════════════════════════════════════════════════════════
// Цены на поезда — партнёрский API Туту.ру через Travelpayouts.
//
//   • suggest.travelpayouts.com/search?service=tutu_railway&term=<город>
//       → коды станций РЖД («Экспресс») по названию; работает для любого города России,
//         поэтому таблицу соответствий заранее не храним — код ищется при первом запросе и кешируется.
//   • suggest.travelpayouts.com/search?service=tutu_trains&term=<код>&term2=<код>
//       → поезда между городами с ценами по классам вагонов («от …» — минимальная цена класса).
//
// Поезд из расписания Яндекса сопоставляется с поездом Туту.ру по номеру («305Н»).
// Ссылка на покупку — поиск Туту.ру по направлению и дате с партнёрскими метками (marker 795764).
// ═════════════════════════════════════════════════════════════════════════════

const SUGGEST = 'https://suggest.travelpayouts.com/search';
const DAY = 24 * 60 * 60 * 1000;

/** Партнёрские метки из ссылки Туту.ру в кабинете Travelpayouts (erid — идентификатор рекламы). */
const TUTU_UTM = 'utm_source=travelpayouts&utm_medium=cpa&utm_campaign=8752d1b011034d49a2a1cdf7b-795764&utm_content=795764';
export const TUTU_ERID = '2Vtzqxgqzeq';

export interface Fare {
  type: string; // плацкарт, купе, СВ…
  price: number;
}

interface TutuTrip {
  trainNumber: string;
  name: string;
  categories: { type: string; price: number }[];
}

const FARE_NAMES: Record<string, string> = {
  sedentary: 'сидячий',
  plazcard: 'плацкарт',
  coupe: 'купе',
  lux: 'СВ',
  soft: 'люкс',
  common: 'общий',
};

const memo = new Map<string, { exp: number; value: unknown }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await load();
  memo.set(key, { exp: Date.now() + ttl, value });
  if (memo.size > 2000) memo.delete(memo.keys().next().value!);
  return value;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim();

/** Код РЖД города (вся группа вокзалов) по названию; null — если Туту.ру такого города не знает. */
export function tutuCityCode(city: string): Promise<string | null> {
  return cached(`tc:${city}`, 30 * DAY, async () => {
    try {
      const res = await fetch(`${SUGGEST}?service=tutu_railway&term=${encodeURIComponent(city)}`);
      if (!res.ok) return null;
      const list = (await res.json()) as { title: string; value: string }[];
      if (!Array.isArray(list) || !list.length) return null;
      // Точное совпадение названия — это код города целиком («Томск»), а не отдельного вокзала
      const exact = list.find((x) => norm(x.title) === norm(city));
      const prefixed = list.find((x) => norm(x.title).startsWith(norm(city) + ' ('));
      return (exact ?? prefixed)?.value ?? null;
    } catch {
      return null;
    }
  });
}

function tutuTrips(from: string, to: string): Promise<TutuTrip[]> {
  return cached(`tt:${from}:${to}`, 3 * 60 * 60 * 1000, async () => {
    try {
      const res = await fetch(`${SUGGEST}?service=tutu_trains&term=${from}&term2=${to}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { trips?: TutuTrip[] };
      return data.trips ?? [];
    } catch {
      return [];
    }
  });
}

export function tutuSearchUrl(from: string, to: string, date: string): string {
  const d = `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
  return `https://www.tutu.ru/poezda/rasp_d.php?nnst1=${from}&nnst2=${to}&date=${d}&${TUTU_UTM}&erid=${TUTU_ERID}`;
}

/** Цены и ссылка Туту.ру для поезда: по городам отправления/прибытия и номеру. */
export async function tutuForTrain(
  fromCity: string,
  toCity: string,
  number: string,
  date: string,
): Promise<{ fares: Fare[]; url: string; pairMin: number | null } | null> {
  const [from, to] = await Promise.all([tutuCityCode(fromCity), tutuCityCode(toCity)]);
  if (!from || !to || from === to) return null;
  const trips = await tutuTrips(from, to);
  const n = number.toUpperCase().replace(/\s/g, '');
  const trip = trips.find((t) => t.trainNumber.toUpperCase() === n);
  const fares = (trip?.categories ?? [])
    .filter((c) => c.price > 0)
    .map((c) => ({ type: FARE_NAMES[c.type] ?? c.type, price: c.price }))
    .sort((a, b) => a.price - b.price);
  // Самая низкая цена среди всех поездов направления — запасной вариант «от …», если поезд не найден
  const all = trips.flatMap((t) => t.categories.map((c) => c.price)).filter((p) => p > 0);
  return { fares, url: tutuSearchUrl(from, to, date), pairMin: all.length ? Math.min(...all) : null };
}
