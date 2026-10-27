// Кабинет основателя «Доеду»: статистика, пользователи, объявление на сайте, проверка системы.
// Доступ — только у почт из переменной ADMIN_EMAILS (через запятую). Почты пользователей в списках
// замаскированы; полную почту не показываем — найти человека можно по точной почте (через её HMAC).
//
// Публичные пути (без входа):
//   GET  /api/announcement   — объявление для баннера на сайте
//   POST /api/stats/search   — анонимный счётчик поисков {from, to} (без данных о человеке)

import { TypedValues } from 'ydb-sdk';
import { findChats, generateInternalSecret, getKey, listKeys, notifyFlags, putSetting, setKey, testKey } from './keys';
import { decrypt, dropSessions, emailId, HttpError, normEmail, q, rateLimit, TS, U, userByToken, type UserRow } from './auth';

const D = TypedValues.date;
const DAY = 86_400_000;

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

async function requireAdmin(auth: string | undefined, ip: string): Promise<UserRow> {
  await rateLimit('admin', ip);
  const user = await userByToken(auth);
  if (!isAdminEmail(decrypt(user.emailenc))) throw new HttpError(403, 'Нет доступа.');
  return user;
}

/** i•••@gmail.com — достаточно, чтобы отличать людей, но не раскрывать почту целиком. */
function mask(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(6, Math.max(3, local.length - 1)))}@${domain}`;
}

const dayStart = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - offsetDays * DAY);
};
const iso = (d: Date) => new Date(d).toISOString().slice(0, 10);
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Ряд по дням за N дней: пропуски — нули. */
function series(rows: { d: Date; n: number }[], days: number) {
  const map = new Map(rows.map((r) => [iso(r.d), num(r.n)]));
  return Array.from({ length: days }, (_, i) => {
    const day = iso(dayStart(days - 1 - i));
    return { day, n: map.get(day) ?? 0 };
  });
}

// ─── Счётчик поисков (анонимный) ────────────────────────────────────────────
const CITY = /^[\p{L}][\p{L}\s.\-()]{0,58}$/u;

async function countSearch(body: Record<string, unknown>, ip: string) {
  await rateLimit('stats', ip);
  const from = String(body.from ?? '').trim();
  const to = String(body.to ?? '').trim();
  if (!CITY.test(from) || !CITY.test(to)) throw new HttpError(400, 'Некорректные города.');
  await q(
    `DECLARE $d AS Date; DECLARE $k AS Utf8;
     $cur = (SELECT n FROM stats WHERE day = $d AND metric = "search" AND k = $k);
     $all = (SELECT n FROM stats WHERE day = $d AND metric = "search" AND k = "*");
     UPSERT INTO stats (day, metric, k, n) VALUES
       ($d, "search", $k, COALESCE($cur, 0u) + 1u),
       ($d, "search", "*", COALESCE($all, 0u) + 1u);`,
    { $d: D(dayStart()), $k: U(`${from} → ${to}`) },
  );
  return { status: 200, body: { ok: true } };
}

// ─── Объявление на сайте ────────────────────────────────────────────────────
type Announcement = { text: string; level: 'info' | 'warning'; updated: string };

async function getAnnouncement(): Promise<Announcement | null> {
  const rows = await q<{ v: string }>(`SELECT v FROM settings WHERE k = "announcement";`).catch(() => []); // до миграции таблицы нет
  if (!rows[0]?.v) return null;
  const a = JSON.parse(rows[0].v) as Announcement;
  return a.text ? a : null;
}

async function setAnnouncement(body: Record<string, unknown>) {
  const text = String(body.text ?? '').trim().slice(0, 280);
  const level = body.level === 'warning' ? 'warning' : 'info';
  const v = JSON.stringify({ text, level, updated: new Date().toISOString() } satisfies Announcement);
  await q(`DECLARE $v AS Utf8; UPSERT INTO settings (k, v) VALUES ("announcement", $v);`, { $v: U(v) });
  return { status: 200, body: { announcement: text ? JSON.parse(v) : null } };
}

// ─── Статистика ─────────────────────────────────────────────────────────────
async function stats() {
  const since30 = dayStart(29);
  const since7 = dayStart(6);
  const [totals, regs, favs, sessions, searches, topSearch] = await Promise.all([
    q<{ users: number; blocked: number; new7: number; newToday: number }>(
      `DECLARE $s7 AS Timestamp; DECLARE $s0 AS Timestamp;
       SELECT CAST(COUNT(*) AS Uint32) AS users,
              CAST(COUNT_IF(blocked == true) AS Uint32) AS blocked,
              CAST(COUNT_IF(created >= $s7) AS Uint32) AS new7,
              CAST(COUNT_IF(created >= $s0) AS Uint32) AS newToday
       FROM users;`,
      { $s7: TS(since7), $s0: TS(dayStart()) },
    ),
    q<{ d: Date; n: number }>(
      `DECLARE $s AS Timestamp;
       SELECT d, CAST(COUNT(*) AS Uint32) AS n FROM users WHERE created >= $s GROUP BY CAST(created AS Date) AS d;`,
      { $s: TS(since30) },
    ),
    q<{ payload: string }>(`SELECT payload FROM favorites LIMIT 5000;`),
    q<{ n: number }>(`DECLARE $now AS Timestamp; SELECT CAST(COUNT(*) AS Uint32) AS n FROM sessions WHERE expires > $now;`, { $now: TS(new Date()) }),
    q<{ d: Date; n: number }>(`DECLARE $s AS Date; SELECT day AS d, n FROM stats WHERE metric = "search" AND k = "*" AND day >= $s;`, {
      $s: D(since30),
    }),
    q<{ k: string; n: number }>(
      `DECLARE $s AS Date;
       SELECT k, CAST(SUM(n) AS Uint32) AS n FROM stats WHERE metric = "search" AND k != "*" AND day >= $s
       GROUP BY k ORDER BY n DESC LIMIT 15;`,
      { $s: D(since7) },
    ),
  ]);

  // популярные направления в избранном — из сохранённых параметров поиска
  const favTop = new Map<string, number>();
  for (const f of favs) {
    try {
      const s = (JSON.parse(f.payload) as { search?: { from?: string; to?: string } }).search;
      if (s?.from && s?.to) favTop.set(`${s.from} → ${s.to}`, (favTop.get(`${s.from} → ${s.to}`) ?? 0) + 1);
    } catch {
      /* битую запись пропускаем */
    }
  }
  const searchSeries = series(searches, 30);
  const t = totals[0] ?? { users: 0, blocked: 0, new7: 0, newToday: 0 };
  return {
    status: 200,
    body: {
      users: { total: num(t.users), new7: num(t.new7), today: num(t.newToday), blocked: num(t.blocked) },
      sessionsActive: num(sessions[0]?.n),
      favorites: { total: favs.length },
      searches: { today: searchSeries[29]?.n ?? 0, last7: searchSeries.slice(-7).reduce((a, b) => a + b.n, 0) },
      registrationsDaily: series(regs, 30),
      searchesDaily: searchSeries,
      topSearches: topSearch.map((r) => ({ route: r.k, n: num(r.n) })),
      topFavorites: [...favTop.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([route, n]) => ({ route, n })),
    },
  };
}

// ─── Пользователи ───────────────────────────────────────────────────────────
type Row = UserRow & { blocked: boolean | null };
const userView = (u: Row, me: UserRow) => ({
  id: u.id,
  email: mask(decrypt(u.emailenc)),
  name: decrypt(u.nameenc),
  created: new Date(u.created).toISOString(),
  blocked: Boolean(u.blocked),
  me: u.eid === me.eid,
});

async function listUsers(me: UserRow, query: Record<string, string>) {
  if (query.email) {
    // поиск по точной почте: сравниваем HMAC, почты в базе не расшифровываем
    let eid: string;
    try {
      eid = emailId(normEmail(query.email));
    } catch {
      return { status: 200, body: { users: [], total: 0 } };
    }
    const rows = await q<Row>(`DECLARE $eid AS Utf8; SELECT eid, id, emailenc, nameenc, created, blocked FROM users WHERE eid = $eid;`, {
      $eid: U(eid),
    });
    return { status: 200, body: { users: rows.map((r) => userView(r, me)), total: rows.length } };
  }
  const offset = Math.max(0, Math.min(100_000, Number(query.offset) || 0));
  const rows = await q<Row>(
    `DECLARE $off AS Uint64; SELECT eid, id, emailenc, nameenc, created, blocked FROM users ORDER BY created DESC LIMIT 50 OFFSET $off;`,
    { $off: TypedValues.uint64(offset) },
  );
  return { status: 200, body: { users: rows.map((r) => userView(r, me)), offset, more: rows.length === 50 } };
}

async function userAction(me: UserRow, body: Record<string, unknown>) {
  const id = String(body.id ?? '');
  const action = String(body.action ?? '');
  const rows = await q<{ eid: string }>(`DECLARE $id AS Utf8; SELECT eid FROM users WHERE id = $id;`, { $id: U(id) });
  const eid = rows[0]?.eid;
  if (!eid) throw new HttpError(404, 'Пользователь не найден.');
  if (eid === me.eid && action !== 'logout') throw new HttpError(400, 'Это ваш аккаунт — действие недоступно.');
  if (action === 'block' || action === 'unblock') {
    await q(`DECLARE $eid AS Utf8; DECLARE $b AS Bool; UPDATE users SET blocked = $b WHERE eid = $eid;`, {
      $eid: U(eid),
      $b: TypedValues.bool(action === 'block'),
    });
    if (action === 'block') await dropSessions(eid);
  } else if (action === 'logout') {
    await dropSessions(eid);
  } else if (action === 'delete') {
    await q(`DECLARE $eid AS Utf8; DELETE FROM favorites WHERE eid = $eid;`, { $eid: U(eid) });
    await dropSessions(eid);
    await q(`DECLARE $eid AS Utf8; DELETE FROM users WHERE eid = $eid;`, { $eid: U(eid) });
  } else throw new HttpError(400, 'Неизвестное действие.');
  return { status: 200, body: { ok: true } };
}

// ─── Проверка системы ───────────────────────────────────────────────────────
async function health() {
  const t0 = Date.now();
  await q(`SELECT 1 AS ok;`);
  return {
    status: 200,
    body: {
      db: { ok: true, ms: Date.now() - t0 },
      env: {
        YANDEX_KEY: Boolean(await getKey('YANDEX_KEY')),
        TP_TOKEN: Boolean(await getKey('TP_TOKEN')),
        AUTH_SECRET: (process.env.AUTH_SECRET ?? '').length >= 32,
        ADMIN_EMAILS: (process.env.ADMIN_EMAILS ?? '').split(',').filter((s) => s.trim()).length,
        DEBUG_ERRORS: process.env.DEBUG_ERRORS === '1',
      },
    },
  };
}

/** Маршрутизация: публичные пути и /api/admin/*. null — не наш путь. */
export async function handleAdmin(
  method: string,
  path: string,
  query: Record<string, string>,
  body: Record<string, unknown>,
  auth: string | undefined,
  ip: string,
): Promise<{ status: number; body: unknown } | null> {
  if (method === 'GET' && path === '/api/announcement') return { status: 200, body: { announcement: await getAnnouncement() } };
  if (method === 'POST' && path === '/api/stats/search') return countSearch(body, ip);
  if (!path.startsWith('/api/admin/')) return null;
  const me = await requireAdmin(auth, ip);
  if (method === 'GET' && path === '/api/admin/stats') return stats();
  if (method === 'GET' && path === '/api/admin/users') return listUsers(me, query);
  if (method === 'POST' && path === '/api/admin/users') return userAction(me, body);
  if (method === 'GET' && path === '/api/admin/announcement') return { status: 200, body: { announcement: await getAnnouncement() } };
  if (method === 'POST' && path === '/api/admin/announcement') return setAnnouncement(body);
  if (method === 'GET' && path === '/api/admin/health') return health();
  if (method === 'POST' && path === '/api/admin/check-rasp') return { status: 200, body: await testKey('YANDEX_KEY') };
  if (method === 'GET' && path === '/api/admin/keys') return { status: 200, body: { keys: await listKeys(), notify: await notifyFlags() } };
  if (method === 'POST' && path === '/api/admin/keys') {
    await setKey(String(body.name ?? ''), String(body.value ?? '').slice(0, 300));
    return { status: 200, body: { keys: await listKeys() } };
  }
  if (method === 'POST' && path === '/api/admin/keys/generate') return { status: 200, body: { value: await generateInternalSecret(), keys: await listKeys() } };
  if (method === 'POST' && path === '/api/admin/keys/test') return { status: 200, body: await testKey(String(body.name ?? '')) };
  if (method === 'POST' && path === '/api/admin/telegram/chats') return { status: 200, body: { chats: await findChats() } };
  if (method === 'POST' && path === '/api/admin/notify') {
    const flags = { register: body.register !== false, rasp: body.rasp !== false };
    await putSetting('notify', JSON.stringify(flags));
    return { status: 200, body: { notify: flags } };
  }
  throw new HttpError(405, 'Метод не поддерживается.');
}
