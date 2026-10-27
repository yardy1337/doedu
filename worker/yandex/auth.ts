// Личный кабинет «Доеду»: регистрация, вход, сессии и избранные маршруты.
// Работает внутри функции Yandex Cloud; данные — в YDB Serverless в России (152-ФЗ).
// Доступ к базе — от сервисного аккаунта функции (MetadataAuthService), паролей в коде нет.
//
// Таблицы (SQL для создания — worker/yandex/schema.sql):
//   users(email, id, name, hash, salt, created, fails, lockeduntil)
//   sessions(token, email, expires)          — token хранится как SHA-256, не в открытом виде
//   favorites(email, fid, payload, created)  — payload: JSON маршрута и параметров поиска

import { createHash, pbkdf2 as pbkdf2cb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Driver, MetadataAuthService, TypedData, TypedValues, Types, type TableSession } from 'ydb-sdk';

const pbkdf2 = promisify(pbkdf2cb);
const PBKDF2_ITERATIONS = 210_000;
const SESSION_DAYS_REMEMBER = 90;
const SESSION_HOURS_SHORT = 12;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const MAX_FAVORITES = 200;
const MAX_PAYLOAD = 16_000;

let driver: Driver | null = null;
async function db(): Promise<Driver> {
  if (driver) return driver;
  const conn = process.env.YDB_CONNECTION;
  if (!conn) throw new HttpError(503, 'Личный кабинет ещё не настроен.');
  const d = new Driver({ connectionString: conn, authService: new MetadataAuthService() });
  if (!(await d.ready(10_000))) throw new HttpError(503, 'База данных недоступна. Попробуйте позже.');
  driver = d;
  return d;
}

async function q<T = Record<string, unknown>>(sql: string, params: Record<string, ReturnType<typeof TypedValues.utf8>> = {}): Promise<T[]> {
  const d = await db();
  return d.tableClient.withSessionRetry(async (s: TableSession) => {
    const res = await s.executeQuery(sql, params);
    const rs = res.resultSets[0];
    return rs ? (TypedData.createNativeObjects(rs) as unknown as T[]) : [];
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const now = () => new Date();

async function hashPassword(password: string, salt: string): Promise<string> {
  return (await pbkdf2(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')).toString('hex');
}

function normEmail(v: unknown): string {
  const e = String(v ?? '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, 'Проверьте адрес почты.');
  return e;
}

function checkPassword(v: unknown): string {
  const p = String(v ?? '');
  if (p.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов.');
  if (p.length > 200) throw new HttpError(400, 'Слишком длинный пароль.');
  return p;
}

type User = { email: string; id: string; name: string; created: Date };
const publicUser = (u: User) => ({ id: u.id, email: u.email, name: u.name, created: new Date(u.created).toISOString() });

async function createSession(email: string, remember: boolean): Promise<{ token: string; expires: string }> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (remember ? SESSION_DAYS_REMEMBER * 86_400_000 : SESSION_HOURS_SHORT * 3_600_000));
  await q(
    `DECLARE $token AS Utf8; DECLARE $email AS Utf8; DECLARE $expires AS Timestamp;
     UPSERT INTO sessions (token, email, expires) VALUES ($token, $email, $expires);`,
    { $token: TypedValues.utf8(sha256(token)), $email: TypedValues.utf8(email), $expires: TypedValues.timestamp(expires) },
  );
  return { token, expires: expires.toISOString() };
}

async function userByToken(auth: string | undefined): Promise<User> {
  const token = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'Войдите в аккаунт.');
  const rows = await q<{ email: string; expires: Date }>(
    `DECLARE $token AS Utf8; SELECT email, expires FROM sessions WHERE token = $token;`,
    { $token: TypedValues.utf8(sha256(token)) },
  );
  const s = rows[0];
  if (!s || new Date(s.expires) < now()) throw new HttpError(401, 'Сессия истекла — войдите снова.');
  const users = await q<User>(`DECLARE $email AS Utf8; SELECT email, id, name, created FROM users WHERE email = $email;`, {
    $email: TypedValues.utf8(s.email),
  });
  if (!users[0]) throw new HttpError(401, 'Аккаунт не найден.');
  return users[0];
}

// ─── Обработчики ────────────────────────────────────────────────────────────

async function register(body: Record<string, unknown>) {
  const email = normEmail(body.email);
  const password = checkPassword(body.password);
  if (body.consent !== true) throw new HttpError(400, 'Нужно согласие на обработку персональных данных.');
  const name = String(body.name ?? '').trim().slice(0, 60) || email.split('@')[0];
  const salt = randomBytes(16).toString('hex');
  const hash = await hashPassword(password, salt);
  const id = randomBytes(9).toString('base64url');
  const exists = await q(`DECLARE $email AS Utf8; SELECT email FROM users WHERE email = $email;`, { $email: TypedValues.utf8(email) });
  if (exists.length) throw new HttpError(409, 'Аккаунт с такой почтой уже есть — войдите.');
  await q(
    `DECLARE $email AS Utf8; DECLARE $id AS Utf8; DECLARE $name AS Utf8; DECLARE $hash AS Utf8; DECLARE $salt AS Utf8; DECLARE $created AS Timestamp;
     INSERT INTO users (email, id, name, hash, salt, created, fails) VALUES ($email, $id, $name, $hash, $salt, $created, 0u);`,
    {
      $email: TypedValues.utf8(email),
      $id: TypedValues.utf8(id),
      $name: TypedValues.utf8(name),
      $hash: TypedValues.utf8(hash),
      $salt: TypedValues.utf8(salt),
      $created: TypedValues.timestamp(now()),
    },
  ).catch((e) => {
    // одновременная регистрация с той же почтой — INSERT упрётся в первичный ключ
    if (/already exists|PRECONDITION_FAILED|Conflict/i.test(String(e))) throw new HttpError(409, 'Аккаунт с такой почтой уже есть — войдите.');
    throw e;
  });
  const session = await createSession(email, body.remember !== false);
  return { status: 201, body: { ...session, user: publicUser({ email, id, name, created: now() }) } };
}

async function login(body: Record<string, unknown>) {
  const email = normEmail(body.email);
  const password = String(body.password ?? '');
  const rows = await q<User & { hash: string; salt: string; fails: number | null; lockeduntil: Date | null }>(
    `DECLARE $email AS Utf8; SELECT email, id, name, created, hash, salt, fails, lockeduntil FROM users WHERE email = $email;`,
    { $email: TypedValues.utf8(email) },
  );
  const u = rows[0];
  const wrong = new HttpError(401, 'Неверная почта или пароль.');
  if (!u) {
    await hashPassword(password, 'x'.repeat(32)); // одинаковое время ответа, есть аккаунт или нет
    throw wrong;
  }
  if (u.lockeduntil && new Date(u.lockeduntil) > now()) throw new HttpError(429, 'Слишком много попыток. Попробуйте через 15 минут.');
  const hash = await hashPassword(password, u.salt);
  const ok = hash.length === u.hash.length && timingSafeEqual(Buffer.from(hash), Buffer.from(u.hash));
  if (!ok) {
    const fails = (u.fails ?? 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await q(
      `DECLARE $email AS Utf8; DECLARE $fails AS Uint32; DECLARE $lock AS Timestamp?;
       UPDATE users SET fails = $fails, lockeduntil = $lock WHERE email = $email;`,
      {
        $email: TypedValues.utf8(email),
        $fails: TypedValues.uint32(lock ? 0 : fails),
        $lock: lock ? TypedValues.optional(TypedValues.timestamp(lock)) : TypedValues.optionalNull(Types.TIMESTAMP),
      },
    );
    throw wrong;
  }
  if (u.fails) {
    await q(`DECLARE $email AS Utf8; UPDATE users SET fails = 0u, lockeduntil = NULL WHERE email = $email;`, { $email: TypedValues.utf8(email) });
  }
  const session = await createSession(email, body.remember !== false);
  return { status: 200, body: { ...session, user: publicUser(u) } };
}

async function logout(auth: string | undefined) {
  const token = auth?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (token) await q(`DECLARE $token AS Utf8; DELETE FROM sessions WHERE token = $token;`, { $token: TypedValues.utf8(sha256(token)) });
  return { status: 200, body: { ok: true } };
}

async function listFavorites(user: User) {
  const rows = await q<{ fid: string; payload: string; created: Date }>(
    `DECLARE $email AS Utf8; SELECT fid, payload, created FROM favorites WHERE email = $email ORDER BY created DESC LIMIT 200;`,
    { $email: TypedValues.utf8(user.email) },
  );
  return rows.map((r) => ({ id: r.fid, created: new Date(r.created).toISOString(), ...JSON.parse(r.payload) }));
}

async function addFavorite(user: User, body: Record<string, unknown>) {
  const fid = String(body.id ?? '').slice(0, 200);
  if (!fid) throw new HttpError(400, 'Нет идентификатора маршрута.');
  const payload = JSON.stringify({ route: body.route ?? null, search: body.search ?? null });
  if (payload.length > MAX_PAYLOAD) throw new HttpError(413, 'Маршрут слишком большой.');
  const count = await q<{ n: number }>(`DECLARE $email AS Utf8; SELECT CAST(COUNT(*) AS Uint32) AS n FROM favorites WHERE email = $email;`, {
    $email: TypedValues.utf8(user.email),
  });
  if (Number(count[0]?.n ?? 0) >= MAX_FAVORITES) throw new HttpError(409, `В избранном может быть до ${MAX_FAVORITES} маршрутов.`);
  await q(
    `DECLARE $email AS Utf8; DECLARE $fid AS Utf8; DECLARE $payload AS Utf8; DECLARE $created AS Timestamp;
     UPSERT INTO favorites (email, fid, payload, created) VALUES ($email, $fid, $payload, $created);`,
    { $email: TypedValues.utf8(user.email), $fid: TypedValues.utf8(fid), $payload: TypedValues.utf8(payload), $created: TypedValues.timestamp(now()) },
  );
  return { status: 201, body: { ok: true } };
}

async function removeFavorite(user: User, fid: string) {
  await q(`DECLARE $email AS Utf8; DECLARE $fid AS Utf8; DELETE FROM favorites WHERE email = $email AND fid = $fid;`, {
    $email: TypedValues.utf8(user.email),
    $fid: TypedValues.utf8(fid),
  });
  return { status: 200, body: { ok: true } };
}

/** Маршрутизация /api/auth/*, /api/me, /api/favorites. null — путь не наш. */
export async function handleAccount(
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  rawBody: string,
): Promise<{ status: number; body: unknown } | null> {
  if (!/^\/api\/(auth\/|me$|favorites$)/.test(path)) return null;
  const auth = headers.authorization ?? headers.Authorization;
  let body: Record<string, unknown> = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, 'Некорректный запрос.');
    }
  }
  if (method === 'POST' && path === '/api/auth/register') return register(body);
  if (method === 'POST' && path === '/api/auth/login') return login(body);
  if (method === 'POST' && path === '/api/auth/logout') return logout(auth);
  const user = await userByToken(auth);
  if (method === 'GET' && path === '/api/me') return { status: 200, body: { user: publicUser(user) } };
  if (method === 'GET' && path === '/api/favorites') return { status: 200, body: { favorites: await listFavorites(user) } };
  if (method === 'POST' && path === '/api/favorites') return addFavorite(user, body);
  if (method === 'DELETE' && path === '/api/favorites') return removeFavorite(user, String(query.id ?? ''));
  throw new HttpError(405, 'Метод не поддерживается.');
}
