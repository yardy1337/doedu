// Личный кабинет «Доеду»: регистрация, вход, сессии, избранное, смена пароля, удаление аккаунта.
// Работает в функции Yandex Cloud; данные — в YDB Serverless в России (152-ФЗ).
//
// Защита на случай кражи базы:
//  • почта не хранится в открытом виде: ключ строки — HMAC(почта), сама почта — AES-256-GCM;
//  • пароль — scrypt с солью и секретным «перцем» (без AUTH_SECRET подбирать бессмысленно);
//  • токены сессий хранятся только как SHA-256;
//  • AUTH_SECRET живёт в настройках функции, отдельно от базы.
// Плюс: лимиты запросов по хешу IP, блокировка после неверных паролей, проверка надёжности пароля.
//
// Доступ к базе — от сервисного аккаунта функции (IAM-токен из контекста вызова), паролей к базе в коде нет.
// Таблицы — worker/yandex/schema.sql.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { handleAdmin, isAdminEmail } from './admin';
import { Driver, TokenAuthService, TypedData, TypedValues, Types, type TableSession } from 'ydb-sdk';

const SESSION_DAYS_REMEMBER = 90;
const SESSION_HOURS_SHORT = 12;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const MAX_FAVORITES = 200;
const MAX_PAYLOAD = 16_000;
const MIN_PASSWORD = 10;
// scrypt: N=2^15, r=8 — ~32 МБ памяти и ~0,1 с на проверку
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Лимиты на хеш IP: [запросов, окно в минутах]. */
const LIMITS: Record<string, [number, number]> = {
  admin: [300, 10],
  stats: [60, 10],
  login: [20, 10],
  register: [5, 60],
  password: [10, 60],
  write: [120, 10],
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ─── Ключи из AUTH_SECRET ───────────────────────────────────────────────────
type Keys = { index: Buffer; enc: Buffer; pepper: Buffer; ip: Buffer };
let keys: Keys | null = null;
function secrets(): Keys {
  if (keys) return keys;
  const s = process.env.AUTH_SECRET ?? '';
  if (s.length < 32) throw new HttpError(503, 'Личный кабинет ещё не настроен.');
  const derive = (label: string) => createHmac('sha256', s).update(`doedu:${label}:v1`).digest();
  keys = { index: derive('email-index'), enc: derive('email-enc'), pepper: derive('password-pepper'), ip: derive('ip') };
  return keys;
}

export const emailId = (email: string) => createHmac('sha256', secrets().index).update(email).digest('base64url');

function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secrets().enc, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

export function decrypt(b64: string | null | undefined): string {
  if (!b64) return '';
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', secrets().enc, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  // «перец» — HMAC пароля секретом функции: без AUTH_SECRET хеши из украденной базы не подобрать
  const peppered = createHmac('sha256', secrets().pepper).update(password.normalize('NFKC')).digest();
  return new Promise((resolve, reject) => scryptCb(peppered, salt, 32, SCRYPT, (e, key) => (e ? reject(e) : resolve(key))));
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `s1$${salt.toString('base64')}$${(await scrypt(password, salt)).toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [ver, salt, hash] = stored.split('$');
  if (ver !== 's1' || !salt || !hash) return false;
  const got = await scrypt(password, Buffer.from(salt, 'base64'));
  const want = Buffer.from(hash, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ─── База ───────────────────────────────────────────────────────────────────
// Вход в YDB от сервисного аккаунта функции. Встроенный MetadataAuthService требует тяжёлый
// пакет @yandex-cloud/nodejs-sdk, поэтому берём IAM-токен сами: Yandex Cloud кладёт его в контекст
// каждого вызова (context.token), а запасной путь — служебный адрес метаданных.
let iamToken: { value: string; exp: number } | null = null;

/** Вызывается из handler при каждом запросе: свежий токен сервисного аккаунта из контекста функции. */
export function setIamToken(token: { access_token?: string; expires_in?: number } | undefined) {
  if (token?.access_token) iamToken = { value: token.access_token, exp: Date.now() + (token.expires_in ?? 3600) * 1000 - 60_000 };
}

async function currentIamToken(): Promise<string> {
  if (iamToken && iamToken.exp > Date.now()) return iamToken.value;
  const res = await fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  }).catch(() => null);
  if (!res?.ok) throw new HttpError(503, 'Личный кабинет ещё не настроен: у функции нет сервисного аккаунта.');
  const t = (await res.json()) as { access_token: string; expires_in: number };
  setIamToken(t);
  return t.access_token;
}

const functionAuth = {
  getAuthMetadata: async () => new TokenAuthService(await currentIamToken()).getAuthMetadata(),
};

let driver: Driver | null = null;
async function db(): Promise<Driver> {
  if (driver) return driver;
  // пробелы и переносы строк, случайно попавшие при вставке длинного адреса, убираем
  const conn = process.env.YDB_CONNECTION?.replace(/\s+/g, '');
  if (!conn) throw new HttpError(503, 'Личный кабинет ещё не настроен.');
  // Разбираем адрес сами: ydb-sdk берёт базу из пути URL, а в адресе Yandex Cloud путь — «/»,
  // и параметр ?database= он тогда не читает (получается «Database not found»).
  const url = new URL(conn);
  const database = url.searchParams.get('database') || (url.pathname !== '/' ? url.pathname : '');
  if (!database) throw new HttpError(503, 'Личный кабинет ещё не настроен: в YDB_CONNECTION нет пути к базе.');
  const endpoint = `${url.protocol}//${url.host}`;
  const d = new Driver({ endpoint, database, authService: functionAuth });
  if (!(await d.ready(10_000))) throw new HttpError(503, 'База данных недоступна. Попробуйте позже.');
  driver = d;
  return d;
}

type Param = ReturnType<typeof TypedValues.utf8>;
export async function q<T = Record<string, unknown>>(sql: string, params: Record<string, Param> = {}): Promise<T[]> {
  const d = await db();
  return d.tableClient.withSessionRetry(async (s: TableSession) => {
    const res = await s.executeQuery(sql, params);
    const rs = res.resultSets[0];
    return rs ? (TypedData.createNativeObjects(rs) as unknown as T[]) : [];
  });
}
export const U = TypedValues.utf8;
export const TS = TypedValues.timestamp;

// ─── Лимиты запросов по хешу IP ─────────────────────────────────────────────
export async function rateLimit(kind: keyof typeof LIMITS, ip: string): Promise<void> {
  const [max, minutes] = LIMITS[kind];
  const window = Math.floor(Date.now() / (minutes * 60_000));
  // хеш IP с секретом: сам адрес нигде не хранится
  const k = createHmac('sha256', secrets().ip).update(`${kind}:${window}:${ip}`).digest('base64url');
  const rows = await q<{ n: number }>(
    `DECLARE $k AS Utf8; DECLARE $expires AS Timestamp;
     $cur = (SELECT n FROM ratelimits WHERE k = $k);
     UPSERT INTO ratelimits (k, n, expires) VALUES ($k, COALESCE($cur, 0u) + 1u, $expires);
     SELECT COALESCE($cur, 0u) + 1u AS n;`,
    { $k: U(k), $expires: TS(new Date(Date.now() + minutes * 60_000)) },
  );
  if (Number(rows[0]?.n ?? 0) > max) throw new HttpError(429, 'Слишком много запросов. Попробуйте через несколько минут.');
}

// ─── Проверки ввода ─────────────────────────────────────────────────────────
export function normEmail(v: unknown): string {
  const e = String(v ?? '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new HttpError(400, 'Проверьте адрес почты.');
  return e;
}

// самые частые пароли из утечек — такие не принимаем
const COMMON = new Set(
  'password password1 password123 1234567890 12345678910 qwertyuiop 1q2w3e4r5t qwerty1234 1qaz2wsx3edc 0987654321 1111111111 0000000000 iloveyou123 abcdefghij qwerty123456 123123123123 zaq12wsxcde йцукенгшщз пароль12345 1234qwer1234 adminadmin1 welcome1234 qazwsxedcrfv 123456789a a123456789 q1w2e3r4t5 password12 asdfghjkl1'.split(
    ' ',
  ),
);

function checkPassword(v: unknown, email?: string): string {
  const p = String(v ?? '');
  if (p.length < MIN_PASSWORD) throw new HttpError(400, `Пароль — минимум ${MIN_PASSWORD} символов.`);
  if (p.length > 200) throw new HttpError(400, 'Слишком длинный пароль.');
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || /^\d+$/.test(p)) throw new HttpError(400, 'Слишком простой пароль — добавьте буквы и разные символы.');
  if (email && (low.includes(email.split('@')[0]) || low === email)) throw new HttpError(400, 'Пароль не должен содержать почту.');
  return p;
}

// ─── Пользователи и сессии ──────────────────────────────────────────────────
export type UserRow = { eid: string; id: string; emailenc: string; nameenc: string | null; created: Date };
export const publicUser = (u: UserRow) => ({ id: u.id, email: decrypt(u.emailenc), name: decrypt(u.nameenc), created: new Date(u.created).toISOString() });

async function createSession(eid: string, remember: boolean) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + (remember ? SESSION_DAYS_REMEMBER * 86_400_000 : SESSION_HOURS_SHORT * 3_600_000));
  await q(
    `DECLARE $token AS Utf8; DECLARE $eid AS Utf8; DECLARE $expires AS Timestamp;
     UPSERT INTO sessions (token, eid, expires) VALUES ($token, $eid, $expires);`,
    { $token: U(sha256(token)), $eid: U(eid), $expires: TS(expires) },
  );
  return { token, expires: expires.toISOString() };
}

const bearer = (auth: string | undefined) => auth?.match(/^Bearer\s+([A-Za-z0-9_-]{20,100})$/)?.[1];

export async function userByToken(auth: string | undefined): Promise<UserRow & { tokenHash: string }> {
  const token = bearer(auth);
  if (!token) throw new HttpError(401, 'Войдите в аккаунт.');
  const tokenHash = sha256(token);
  const rows = await q<{ eid: string; expires: Date }>(`DECLARE $t AS Utf8; SELECT eid, expires FROM sessions WHERE token = $t;`, { $t: U(tokenHash) });
  const s = rows[0];
  if (!s || new Date(s.expires) < new Date()) throw new HttpError(401, 'Сессия истекла — войдите снова.');
  const users = await q<UserRow & { blocked: boolean | null }>(`DECLARE $eid AS Utf8; SELECT eid, id, emailenc, nameenc, created, blocked FROM users WHERE eid = $eid;`, { $eid: U(s.eid) });
  if (!users[0]) throw new HttpError(401, 'Аккаунт не найден.');
  if (users[0].blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  return { ...users[0], tokenHash };
}

export async function dropSessions(eid: string, exceptTokenHash?: string) {
  await q(
    `DECLARE $eid AS Utf8; DECLARE $keep AS Utf8;
     DELETE FROM sessions ON SELECT token FROM sessions VIEW idx_eid WHERE eid = $eid AND token != $keep;`,
    { $eid: U(eid), $keep: U(exceptTokenHash ?? '') },
  );
}

// ─── Обработчики ────────────────────────────────────────────────────────────
async function register(body: Record<string, unknown>, ip: string) {
  await rateLimit('register', ip);
  const email = normEmail(body.email);
  const password = checkPassword(body.password, email);
  if (body.consent !== true) throw new HttpError(400, 'Нужно согласие на обработку персональных данных.');
  const name = String(body.name ?? '').trim().slice(0, 60);
  const eid = emailId(email);
  const hash = await hashPassword(password);
  const id = randomBytes(9).toString('base64url');
  const conflict = new HttpError(409, 'Аккаунт с такой почтой уже есть — войдите.');
  const exists = await q(`DECLARE $eid AS Utf8; SELECT eid FROM users WHERE eid = $eid;`, { $eid: U(eid) });
  if (exists.length) throw conflict;
  await q(
    `DECLARE $eid AS Utf8; DECLARE $id AS Utf8; DECLARE $em AS Utf8; DECLARE $nm AS Utf8?; DECLARE $hash AS Utf8; DECLARE $created AS Timestamp;
     INSERT INTO users (eid, id, emailenc, nameenc, hash, created, fails) VALUES ($eid, $id, $em, $nm, $hash, $created, 0u);`,
    {
      $eid: U(eid),
      $id: U(id),
      $em: U(encrypt(email)),
      $nm: name ? TypedValues.optional(U(encrypt(name))) : TypedValues.optionalNull(Types.UTF8),
      $hash: U(hash),
      $created: TS(new Date()),
    },
  ).catch((e) => {
    if (/already exists|PRECONDITION_FAILED|Conflict/i.test(String(e))) throw conflict;
    throw e;
  });
  const session = await createSession(eid, body.remember !== false);
  return { status: 201, body: { ...session, user: { id, email, name, created: new Date().toISOString() } } };
}

async function login(body: Record<string, unknown>, ip: string) {
  await rateLimit('login', ip);
  const email = normEmail(body.email);
  const password = String(body.password ?? '').slice(0, 200);
  const eid = emailId(email);
  const rows = await q<UserRow & { hash: string; fails: number | null; lockeduntil: Date | null; blocked: boolean | null }>(
    `DECLARE $eid AS Utf8; SELECT eid, id, emailenc, nameenc, created, hash, fails, lockeduntil, blocked FROM users WHERE eid = $eid;`,
    { $eid: U(eid) },
  );
  const u = rows[0];
  const wrong = new HttpError(401, 'Неверная почта или пароль.');
  if (!u) {
    await scrypt(password, randomBytes(16)); // одинаковое время ответа, есть аккаунт или нет
    throw wrong;
  }
  if (u.blocked) throw new HttpError(403, 'Аккаунт заблокирован. Напишите в поддержку.');
  if (u.lockeduntil && new Date(u.lockeduntil) > new Date()) throw new HttpError(429, `Слишком много попыток. Попробуйте через ${LOCK_MINUTES} минут.`);
  if (!(await verifyPassword(password, u.hash))) {
    const fails = (u.fails ?? 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    await q(
      `DECLARE $eid AS Utf8; DECLARE $fails AS Uint32; DECLARE $lock AS Timestamp?;
       UPDATE users SET fails = $fails, lockeduntil = $lock WHERE eid = $eid;`,
      { $eid: U(eid), $fails: TypedValues.uint32(lock ? 0 : fails), $lock: lock ? TypedValues.optional(TS(lock)) : TypedValues.optionalNull(Types.TIMESTAMP) },
    );
    throw wrong;
  }
  if (u.fails || u.lockeduntil) await q(`DECLARE $eid AS Utf8; UPDATE users SET fails = 0u, lockeduntil = NULL WHERE eid = $eid;`, { $eid: U(eid) });
  const session = await createSession(eid, body.remember !== false);
  return { status: 200, body: { ...session, user: publicUser(u) } };
}

async function changePassword(user: UserRow & { tokenHash: string }, body: Record<string, unknown>, ip: string) {
  await rateLimit('password', ip);
  const rows = await q<{ hash: string }>(`DECLARE $eid AS Utf8; SELECT hash FROM users WHERE eid = $eid;`, { $eid: U(user.eid) });
  if (!rows[0] || !(await verifyPassword(String(body.current ?? ''), rows[0].hash))) throw new HttpError(403, 'Текущий пароль указан неверно.');
  const next = checkPassword(body.password, decrypt(user.emailenc));
  await q(`DECLARE $eid AS Utf8; DECLARE $hash AS Utf8; UPDATE users SET hash = $hash WHERE eid = $eid;`, { $eid: U(user.eid), $hash: U(await hashPassword(next)) });
  await dropSessions(user.eid, user.tokenHash); // остальные устройства — выйти
  return { status: 200, body: { ok: true } };
}

async function deleteAccount(user: UserRow, body: Record<string, unknown>, ip: string) {
  await rateLimit('password', ip);
  const rows = await q<{ hash: string }>(`DECLARE $eid AS Utf8; SELECT hash FROM users WHERE eid = $eid;`, { $eid: U(user.eid) });
  if (!rows[0] || !(await verifyPassword(String(body.password ?? ''), rows[0].hash))) throw new HttpError(403, 'Пароль указан неверно.');
  await q(`DECLARE $eid AS Utf8; DELETE FROM favorites WHERE eid = $eid;`, { $eid: U(user.eid) });
  await dropSessions(user.eid);
  await q(`DECLARE $eid AS Utf8; DELETE FROM users WHERE eid = $eid;`, { $eid: U(user.eid) });
  return { status: 200, body: { ok: true } };
}

async function listFavorites(user: UserRow) {
  const rows = await q<{ fid: string; payload: string; created: Date }>(
    `DECLARE $eid AS Utf8; SELECT fid, payload, created FROM favorites WHERE eid = $eid ORDER BY created DESC LIMIT 200;`,
    { $eid: U(user.eid) },
  );
  return rows.map((r) => ({ id: r.fid, created: new Date(r.created).toISOString(), ...JSON.parse(r.payload) }));
}

async function addFavorite(user: UserRow, body: Record<string, unknown>, ip: string) {
  await rateLimit('write', ip);
  const fid = String(body.id ?? '').slice(0, 200);
  if (!fid) throw new HttpError(400, 'Нет идентификатора маршрута.');
  const payload = JSON.stringify({ route: body.route ?? null, search: body.search ?? null });
  if (payload.length > MAX_PAYLOAD) throw new HttpError(413, 'Маршрут слишком большой.');
  const count = await q<{ n: number }>(`DECLARE $eid AS Utf8; SELECT CAST(COUNT(*) AS Uint32) AS n FROM favorites WHERE eid = $eid;`, { $eid: U(user.eid) });
  if (Number(count[0]?.n ?? 0) >= MAX_FAVORITES) throw new HttpError(409, `В избранном может быть до ${MAX_FAVORITES} маршрутов.`);
  await q(
    `DECLARE $eid AS Utf8; DECLARE $fid AS Utf8; DECLARE $payload AS Utf8; DECLARE $created AS Timestamp;
     UPSERT INTO favorites (eid, fid, payload, created) VALUES ($eid, $fid, $payload, $created);`,
    { $eid: U(user.eid), $fid: U(fid), $payload: U(payload), $created: TS(new Date()) },
  );
  return { status: 201, body: { ok: true } };
}

async function removeFavorite(user: UserRow, fid: string, ip: string) {
  await rateLimit('write', ip);
  await q(`DECLARE $eid AS Utf8; DECLARE $fid AS Utf8; DELETE FROM favorites WHERE eid = $eid AND fid = $fid;`, { $eid: U(user.eid), $fid: U(fid) });
  return { status: 200, body: { ok: true } };
}

/** Пути кабинета: вход, профиль, избранное, объявление, счётчик поисков, кабинет основателя. */
export const ACCOUNT_PATH = /^\/api\/(auth\/|me$|favorites$|admin\/|stats\/|announcement$)/;

/** Маршрутизация путей кабинета. null — путь не наш. */
export async function handleAccount(
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  rawBody: string,
  ip: string,
): Promise<{ status: number; body: unknown } | null> {
  if (!ACCOUNT_PATH.test(path)) return null;
  secrets(); // без AUTH_SECRET кабинет не работает
  if (rawBody.length > 32_000) throw new HttpError(413, 'Слишком большой запрос.');
  let body: Record<string, unknown> = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, 'Некорректный запрос.');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Некорректный запрос.');
  }
  const auth = headers.authorization;
  // публичные: объявление на сайте и анонимный счётчик поисков; кабинет основателя — /api/admin/*
  const extra = await handleAdmin(method, path, query, body, auth, ip);
  if (extra) return extra;
  if (method === 'POST' && path === '/api/auth/register') return register(body, ip);
  if (method === 'POST' && path === '/api/auth/login') return login(body, ip);
  if (method === 'POST' && path === '/api/auth/logout') {
    const t = bearer(auth);
    if (t) await q(`DECLARE $t AS Utf8; DELETE FROM sessions WHERE token = $t;`, { $t: U(sha256(t)) });
    return { status: 200, body: { ok: true } };
  }
  const user = await userByToken(auth);
  if (method === 'GET' && path === '/api/me') return { status: 200, body: { user: publicUser(user), admin: isAdminEmail(decrypt(user.emailenc)) } };
  if (method === 'POST' && path === '/api/auth/logout-all') {
    await dropSessions(user.eid, user.tokenHash);
    return { status: 200, body: { ok: true } };
  }
  if (method === 'POST' && path === '/api/auth/password') return changePassword(user, body, ip);
  if (method === 'POST' && path === '/api/auth/delete') return deleteAccount(user, body, ip);
  if (method === 'GET' && path === '/api/favorites') return { status: 200, body: { favorites: await listFavorites(user) } };
  if (method === 'POST' && path === '/api/favorites') return addFavorite(user, body, ip);
  if (method === 'DELETE' && path === '/api/favorites') return removeFavorite(user, String(query.id ?? ''), ip);
  throw new HttpError(405, 'Метод не поддерживается.');
}

/** Для тестов: криптография без базы. */
export const _test = { encrypt, decrypt, hashPassword, verifyPassword, emailId, checkPassword };
