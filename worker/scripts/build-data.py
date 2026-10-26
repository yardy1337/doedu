"""
Собирает справочники для доеду из официальных источников:
  • stations.json  — справочник станций API Яндекс Расписаний (/v3.0/stations_list/)
  • tp_airports.json — справочник аэропортов Travelpayouts (api.travelpayouts.com/data/ru/airports.json)
Результат (в папку data/ в корне репозитория):
  • data/ru-cities.json  — города России с вокзалами/аэропортами/автовокзалами для автодополнения
  • data/stations.json   — код станции Яндекса → [город, IATA аэропорта, IATA города, широта, долгота]
  • data/coords.json, data/hubs.json — координаты городов и пересадочные узлы
Запуск: python3 worker/scripts/build-data.py   (сначала скачать исходники в worker/scripts/raw/, см. worker/README.md)
"""
import json, math, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = os.path.join(ROOT, 'worker', 'scripts', 'raw')
OUT = os.path.join(ROOT, 'data')
stations = json.load(open(os.path.join(D, 'stations.json')))
tp_airports = json.load(open(os.path.join(D, 'tp_airports.json')))

ru = next(c for c in stations['countries'] if c.get('title') == 'Россия')
# Аэропорты Travelpayouts в России — для сопоставления по координатам
tp_ru = [a for a in tp_airports if a.get('country_code') == 'RU' and a.get('iata_type') == 'airport' and a.get('coordinates')]

def norm(x):
    return re.sub(r'[^а-яa-z0-9]', '', (x or '').lower().replace('ё', 'е'))

def dist_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))

# «Вес» типа станции: насколько город важен как точка междугородних поездок
WEIGHT = {'airport': 8, 'train_station': 4, 'bus_station': 3, 'station': 1, 'river_port': 1, 'marine_station': 1, 'port': 1}

cities = []
station_map = {}
unmatched_airports = 0
for region in ru['regions']:
    for s in region['settlements']:
        code = s.get('codes', {}).get('yandex_code')
        title = (s.get('title') or '').strip()
        if not code or not title:
            continue
        rank = 0
        lat = lon = None
        for st in s['stations']:
            t = st.get('station_type')
            rank += WEIGHT.get(t, 0)
            st_code = st.get('codes', {}).get('yandex_code')
            if lat is None and st.get('latitude'):
                lat, lon = st['latitude'], st['longitude']
            if not st_code or t in ('bus_stop', 'stop', 'platform', 'crossing', 'post', 'unknown', ''):
                continue
            # [город, IATA аэропорта, IATA города, широта, долгота] — координаты нужны для оценки цены по расстоянию
            entry = [title, None, None, round(st['latitude'], 4) if st.get('latitude') else None, round(st['longitude'], 4) if st.get('longitude') else None]
            if t == 'airport' and st.get('latitude'):
                # Координаты в справочнике Travelpayouts грубые (до ~20 км), поэтому ищем в радиусе 45 км
                # и предпочитаем аэропорт с тем же названием («Богашёво» = TOF)
                name = norm(st.get('title'))
                def score(a):
                    d = dist_km(st['latitude'], st['longitude'], a['coordinates']['lat'], a['coordinates']['lon'])
                    same = name and (name in norm(a.get('name')) or norm(a.get('name')) in name)
                    return d - (40 if same else 0) - (5 if a.get('flightable') else 0), d
                best = min(tp_ru, key=lambda a: score(a)[0])
                sc, d = score(best)
                if d < 45 and sc < 25:
                    entry[1], entry[2] = best['code'], best.get('city_code') or best['code']
                else:
                    unmatched_airports += 1
            station_map[st_code] = entry
        # Все населённые пункты со станциями — даже посёлки, где есть только автобусные остановки
        if lat is not None:
            cities.append([code, title, (region.get('title') or '').strip(), round(lat, 3), round(lon, 3), rank])

cities.sort(key=lambda c: (-c[5], c[1]))
json.dump(cities, open(os.path.join(OUT, 'ru-cities.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(station_map, open(os.path.join(OUT, 'stations.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
# Координаты городов и список крупных пересадочных узлов — для поиска стыковок на сервере
HUB_NAMES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Самара', 'Нижний Новгород',
             'Ростов-на-Дону', 'Краснодар', 'Красноярск', 'Омск', 'Челябинск', 'Уфа', 'Пермь', 'Тюмень', 'Иркутск',
             'Хабаровск', 'Владивосток', 'Воронеж', 'Волгоград', 'Минеральные Воды', 'Сочи', 'Кемерово', 'Барнаул',
             'Саратов', 'Ярославль', 'Архангельск', 'Мурманск', 'Калининград', 'Симферополь']
coords = {c[0]: [c[3], c[4]] for c in cities}
hubs = []
for name in HUB_NAMES:
    best = next((c for c in cities if c[1] == name), None)  # cities отсортированы по весу — берём крупнейший
    if best:
        hubs.append([best[0], best[1]])
json.dump(coords, open(os.path.join(OUT, 'coords.json'), 'w'), separators=(',', ':'))
json.dump(hubs, open(os.path.join(OUT, 'hubs.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('cities', len(cities), 'stations', len(station_map), 'airports w/o IATA', unmatched_airports, 'hubs', len(hubs))
