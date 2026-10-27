// Готовит dist-yandex/package.json: Yandex Cloud при сборке функции сам установит ydb-sdk.
import { writeFileSync } from 'node:fs';
writeFileSync(
  new URL('../dist-yandex/package.json', import.meta.url),
  JSON.stringify({ name: 'doedu-api', private: true, main: 'index.js', dependencies: { 'ydb-sdk': '5.11.1' } }, null, 2) + '\n',
);
