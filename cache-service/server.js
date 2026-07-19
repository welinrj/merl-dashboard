// =============================================================================
// Caching sidecar — entrypoint
// =============================================================================
// Wires the real Redis store and starts the HTTP server. Configuration is via
// environment variables (see cache-service/README.md and .env.example).
// =============================================================================

import { createStore } from "./store.js";
import { createApp } from "./app.js";

const {
  PORT = "8080",
  REDIS_URL = "redis://redis:6379",
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  CACHE_TTL = "300",
  INVALIDATE_SECRET = "",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[cache] SUPABASE_URL and SUPABASE_ANON_KEY are required");
  process.exit(1);
}

const store = createStore(REDIS_URL);
await store.connect();

const app = createApp({
  store,
  supabaseUrl: SUPABASE_URL.replace(/\/$/, ""),
  supabaseAnonKey: SUPABASE_ANON_KEY,
  ttl: Number(CACHE_TTL),
  invalidateSecret: INVALIDATE_SECRET,
});

const server = app.listen(Number(PORT), () => {
  console.log(`[cache] listening on :${PORT} (store=${store.kind}, ttl=${CACHE_TTL}s)`);
});

async function shutdown(signal) {
  console.log(`[cache] ${signal} received, shutting down`);
  server.close();
  await store.quit();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
