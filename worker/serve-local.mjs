// Локальный сервер для проверки сайта с живыми данными: node worker/serve-local.mjs (порт 8787).
import http from 'node:http';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
const worker = (await import('./dist/worker.js')).default;
const env = { YANDEX_KEY: process.env.YANDEX_KEY, TP_TOKEN: '', TP_MARKER: '795764' };
http
  .createServer(async (req, res) => {
    const r = await worker.fetch(new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(8787, () => console.log('doedu-api local on :8787'));
