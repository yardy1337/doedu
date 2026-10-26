# doedu-api — API поиска маршрутов «Доеду»

Cloudflare Worker. Сейчас развёрнут на `https://doedu-api.doedu.workers.dev`, сайт (`/index.html`) ходит туда за маршрутами.

## Что внутри

- `src/index.ts` — точка входа: `GET /api/search?from=&to=&date=` (+ `fromCode`/`toCode`).
  - Поиск в Яндекс Расписаниях (с пересадками).
  - Сборка гибридных маршрутов через пересадочные узлы.
  - Цены: Aviasales/Travelpayouts, Туту.ру, оценка «≈» по расстоянию.
  - CORS: список `ALLOWED_ORIGINS`.
- `src/hubs.ts` — выбор пересадочных узлов и минимальное время стыковки.
- `src/tutu.ts` — цены поездов Туту.ру (через suggest.travelpayouts.com) и партнёрские ссылки.
- `../data/` — справочники, они вшиваются в бандл при сборке (KV/D1 не используются):
  - `stations.json` — код станции Яндекса → `[город, IATA аэропорта, IATA города, широта, долгота]`;
  - `coords.json` — координаты городов;
  - `hubs.json` — 30 пересадочных узлов;
  - `ru-cities.json` — 7973 города для подсказок ввода на сайте (уже встроен в `index.html`).
- `scripts/build-data.py` — пересборка справочников.
- `serve-local.mjs`, `test-local.mjs` — локальный запуск и проверка (Node 18+).

## Секреты (в репозитории их нет)

Задаются в Cloudflare: Workers & Pages → doedu-api → Settings → Variables and Secrets.

| Имя | Что | Где взять |
|---|---|---|
| `YANDEX_KEY` | ключ API Яндекс Расписаний | yandex.ru/dev/rasp |
| `TP_TOKEN` | токен Travelpayouts (точные цены авиа) | travelpayouts.com → профиль → API-токен |
| `TP_MARKER` | партнёрский маркер Travelpayouts (публичный, 795764) | уже в `wrangler.toml` как `[vars]` |

Без `TP_TOKEN` поиск работает, но цены авиа будут «от» или «≈».

## Сборка и деплой

```bash
cd worker
npm i
npm run build                       # → dist/worker.js
npx wrangler deploy                 # нужен вход в Cloudflare (npx wrangler login) или CLOUDFLARE_API_TOKEN
npx wrangler secret put YANDEX_KEY  # и TP_TOKEN
```

Для `wrangler deploy` токену Cloudflare нужно право Workers Scripts: Edit.

## Пересборка справочников

1. Скачайте исходники в `worker/scripts/raw/`:
   - `stations.json` — `https://api.rasp.yandex.net/v3.0/stations_list/?apikey=$YANDEX_KEY&lang=ru_RU&format=json`;
   - `tp_airports.json` — `https://api.travelpayouts.com/data/ru/airports.json`.
2. Запустите `python3 worker/scripts/build-data.py` — файлы в `data/` обновятся.
3. Пересоберите и задеплойте воркер.
