-- Таблицы личного кабинета «Доеду» (YDB). Выполнить один раз в консоли:
-- Managed Service for YDB → база doedu-db → «Навигация» → «Новый SQL-запрос» → вставить → «Выполнить».

CREATE TABLE users (
    email Utf8 NOT NULL,
    id Utf8,
    name Utf8,
    hash Utf8,
    salt Utf8,
    created Timestamp,
    fails Uint32,
    lockeduntil Timestamp,
    PRIMARY KEY (email)
);

CREATE TABLE sessions (
    token Utf8 NOT NULL,
    email Utf8,
    expires Timestamp,
    PRIMARY KEY (token)
) WITH (
    TTL = Interval("PT0S") ON expires
);

CREATE TABLE favorites (
    email Utf8 NOT NULL,
    fid Utf8 NOT NULL,
    payload Utf8,
    created Timestamp,
    PRIMARY KEY (email, fid)
);
