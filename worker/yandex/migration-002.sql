-- Обновление базы для кабинета основателя (выполнить один раз, если база создана по старому schema.sql):
-- Managed Service for YDB → doedu-db → «Навигация» → «Новый SQL-запрос» → вставить → «Выполнить».

ALTER TABLE users ADD COLUMN blocked Bool;

-- Анонимная статистика по дням: сколько поисков и по каким направлениям (без данных о людях)
CREATE TABLE stats (
    day Date NOT NULL,
    metric Utf8 NOT NULL,
    k Utf8 NOT NULL,
    n Uint32,
    PRIMARY KEY (day, metric, k)
);

-- Настройки сайта (например, объявление-баннер)
CREATE TABLE settings (
    k Utf8 NOT NULL,
    v Utf8,
    PRIMARY KEY (k)
);
