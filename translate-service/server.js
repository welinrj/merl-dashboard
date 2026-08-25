// server.js — the container entrypoint: start the worker, answer a health probe.
//
// The health endpoint reports what the worker has been doing, not merely that
// the process is alive, so "translations have stopped" is visible from the
// outside without opening a shell on the server.

import http from 'node:http';
import { createWorker, configFromEnv } from './worker.js';

const cfg = configFromEnv();

if (!cfg.supabaseUrl || !cfg.serviceKey) {
  console.error(JSON.stringify({
    level: 'error',
    msg: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
  }));
  process.exit(1);
}

const worker = createWorker(cfg);
worker.start();

const port = Number(process.env.PORT || 8081);

http.createServer((req, res) => {
  if (req.url === '/health') {
    const { provider, lastRunAt, lastError, translated, skipped, failures } = worker.state;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      provider: provider?.name ?? null,
      lang: cfg.targetLang,
      lastRunAt, lastError, translated, skipped, failures,
    }));
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'health endpoint listening', port }));
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { worker.stop(); process.exit(0); });
}
