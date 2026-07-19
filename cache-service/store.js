// =============================================================================
// Cache store abstraction
// =============================================================================
// Wraps Redis behind a tiny get/set/del interface, with an in-memory fallback
// (REDIS_URL="memory://") so the caching logic can be unit-tested without a
// live Redis and so a single-node deployment can run degraded if Redis is down.
// =============================================================================

import { createClient } from "redis";

/** In-process TTL map — used for tests and as a last-resort fallback. */
function memoryStore() {
  const map = new Map(); // key -> { value, expiresAt }
  return {
    kind: "memory",
    async connect() {},
    async get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      if (hit.expiresAt && hit.expiresAt <= Date.now()) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, ttlSeconds) {
      map.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
      });
    },
    async del(prefix) {
      let n = 0;
      for (const key of [...map.keys()]) {
        if (key.startsWith(prefix)) {
          map.delete(key);
          n += 1;
        }
      }
      return n;
    },
    async quit() {
      map.clear();
    },
  };
}

function redisStore(url) {
  const client = createClient({ url });
  let ready = false;
  client.on("error", (e) => {
    ready = false;
    console.error("[cache] redis error:", e.message);
  });
  client.on("ready", () => {
    ready = true;
  });
  return {
    kind: "redis",
    async connect() {
      await client.connect();
      ready = true;
    },
    async get(key) {
      if (!ready) return null; // fail open — treat as a miss
      try {
        return await client.get(key);
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      if (!ready) return;
      try {
        await client.set(key, value, ttlSeconds ? { EX: ttlSeconds } : {});
      } catch {
        /* ignore — caching is best-effort */
      }
    },
    async del(prefix) {
      if (!ready) return 0;
      let n = 0;
      try {
        for await (const key of client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
          await client.del(key);
          n += 1;
        }
      } catch {
        /* ignore */
      }
      return n;
    },
    async quit() {
      try {
        await client.quit();
      } catch {
        /* ignore */
      }
    },
  };
}

export function createStore(url = "redis://redis:6379") {
  return url.startsWith("memory") ? memoryStore() : redisStore(url);
}
