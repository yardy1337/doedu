-- Таблицы личного кабинета «Доеду» (YDB). Выполнить один раз в консоли:
-- Managed Service for YDB → база doedu-db → «Навигация» → «Новый SQL-запрос» → вставить → «Выполнить».
--
-- Почта в открытом виде не хранится: eid = HMAC(почта), emailenc = AES-256-GCM(почта).
-- Пароль — scrypt с «перцем», токены сессий — SHA-256. Ключи — в AUTH_SECRET функции, не в базе.

CREATE TABLE users (
    eid Utf8 NOT NULL,
    id Utf8,
    emailenc Utf8,
    nameenc Utf8,
    hash Utf8,
    created Timestamp,
    fails Uint32,
    lockeduntil Timestamp,
    PRIMARY KEY (eid)
);

CREATE TABLE sessions (
    token Utf8 NOT NULL,
    eid Utf8,
    expires Timestamp,
    PRIMARY KEY (token),
    INDEX idx_eid GLOBAL ON (eid)
) WITH (
    TTL = Interval("PT0S") ON expires
);

CREATE TABLE favorites (
    eid Utf8 NOT NULL,
    fid Utf8 NOT NULL,
    payload Utf8,
    created Timestamp,
    PRIMARY KEY (eid, fid)
);

CREATE TABLE ratelimits (
    k Utf8 NOT NULL,
    n Uint32,
    expires Timestamp,
    PRIMARY KEY (k)
) WITH (
    TTL = Interval("PT0S") ON expires
);
