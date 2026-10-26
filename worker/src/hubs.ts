// ═════════════════════════════════════════════════════════════════════════════
// Собственный поиск гибридных маршрутов через крупные пересадочные узлы.
//
// Яндекс сам предлагает лишь несколько стыковок (чаще самолёт + самолёт). Чтобы в выдаче
// были поезда, автобусы и их сочетания с самолётами, доеду дополнительно ищет маршруты
// А → узел → Б: берёт прямые рейсы до 2–3 узлов и от них, а затем склеивает их с учётом
// времени на пересадку — так же, как демо-алгоритм на сайте (src/lib/router.ts).
//
// Узлы выбираются по географии: ближайший крупный город к точке отправления
// (из Томска — Новосибирск), ближайший к точке назначения и узлы «по пути»,
// крюк через которые не больше 30% от расстояния А → Б.
// ═════════════════════════════════════════════════════════════════════════════

import coordsData from '../../data/coords.json';
import hubsData from '../../data/hubs.json';

const COORDS = coordsData as Record<string, [number, number]>;
const HUBS = (hubsData as [string, string][]).map(([code]) => code);

function distKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const p = Math.PI / 180;
  const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + (Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p))) / 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** До max узлов для стыковки; пусто, если города рядом (там хватает прямых рейсов). */
export function pickHubs(from: string, to: string, max = 3): string[] {
  const A = COORDS[from];
  const B = COORDS[to];
  if (!A || !B) return [];
  const dAB = distKm(A, B);
  if (dAB < 250) return [];
  const cand = HUBS.filter((h) => h !== from && h !== to && COORDS[h]).map((code, rank) => {
    const H = COORDS[code];
    const dA = distKm(A, H);
    const dB = distKm(H, B);
    return { code, rank, dA, dB, detour: (dA + dB) / dAB };
  });
  const picked: string[] = [];
  const add = (c?: { code: string }) => c && !picked.includes(c.code) && picked.push(c.code);
  // Ближайший узел к отправлению и к назначению — выбраться из небольшого города
  add(cand.filter((c) => c.dA < 450 && c.detour < 1.6).sort((a, b) => a.dA - b.dA)[0]);
  add(cand.filter((c) => c.dB < 450 && c.detour < 1.6).sort((a, b) => a.dB - b.dB)[0]);
  // Узлы по пути: чем крупнее (выше в списке) и меньше крюк, тем лучше
  cand
    .filter((c) => c.detour < 1.3 && c.dA > 150 && c.dB > 150)
    .sort((a, b) => a.detour * (1 + a.rank / 30) - b.detour * (1 + b.rank / 30))
    .forEach(add);
  return picked.slice(0, max);
}

/** Минимальное время на пересадку, мин: другой вокзал или аэропорт — дольше, на самолёт — регистрация. */
export function minConnection(prevAir: boolean, nextAir: boolean, sameStation: boolean): number {
  return (sameStation ? 30 : 100) + (nextAir ? 60 : 0) + (prevAir ? 20 : 0);
}
