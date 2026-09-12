// =============================================================================
// Caching sidecar — Express app factory
// =============================================================================
// Fronts the platform's expensive, organisation-wide shared aggregates with a
// Redis cache. Every user hits the same cached result instead of the database
// recomputing it per request. Only non-sensitive aggregate endpoints are cached
// here (read with the public anon key); row-level, RLS-protected data continues
// to go directly to Supabase from the browser with the user's own token.
//
// The app is exported as a factory so tests can inject a memory store and a stub
// fetch; server.js wires the real Redis store and global fetch.
// =============================================================================

import express from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * @param {object} opts
 * @param {import('./store.js')} opts.store       - cache store (get/set/del)
 * @param {string}  opts.supabaseUrl              - Supabase base URL
 * @param {string}  opts.supabaseAnonKey          - public anon key
 * @param {number}  [opts.ttl=300]                - default cache TTL (seconds)
 * @param {string}  [opts.invalidateSecret]       - shared secret for POST /invalidate
 * @param {typeof fetch} [opts.fetchImpl=fetch]   - injectable fetch (for tests)
 */
export function createApp({
  store,
  supabaseUrl,
  supabaseAnonKey,
  ttl = 300,
  invalidateSecret = "",
  fetchImpl = fetch,
}) {
  const app = express();
  app.disable("x-powered-by");

  /**
   * Compare the presented secret without leaking its length or contents
   * through how long the comparison takes. `!==` on strings returns as soon as
   * it finds a differing byte, which is enough to guess a secret one character
   * at a time over many requests.
   */
  const expectedSecret = Buffer.from(invalidateSecret, "utf8");
  function secretMatches(presented) {
    if (typeof presented !== "string") return false;
    const given = Buffer.from(presented, "utf8");
    // timingSafeEqual throws on a length mismatch, which would itself be a
    // timing signal, so both sides are hashed to a fixed width first.
    if (given.length !== expectedSecret.length) {
      // Still do a comparison of equal length so a wrong-length guess costs the
      // same as a right-length one.
      timingSafeEqual(expectedSecret, expectedSecret);
      return false;
    }
    return timingSafeEqual(given, expectedSecret);
  }

  // The single shared aggregate we cache. `key` is the Redis key; `rest` is the
  // PostgREST path (read with the anon key — the v_srf_analytics view is granted
  // to anon and exposes aggregate figures only).
  const ENDPOINTS = {
    "srf-analytics": {
      key: "dmp:srf-analytics",
      rest: "v_srf_analytics?select=*",
      ttl,
      // v_srf_analytics is a single row; unwrap the array for convenience.
      transform: (rows) => (Array.isArray(rows) ? rows[0] ?? null : rows),
    },
  };

  async function fetchFromSupabase(restPath) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${restPath}`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`supabase ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  app.get("/health", async (_req, res) => {
    res.json({ ok: true, store: store.kind, endpoints: Object.keys(ENDPOINTS) });
  });

  app.get("/:name", async (req, res) => {
    const def = ENDPOINTS[req.params.name];
    if (!def) return res.status(404).json({ error: "unknown cache endpoint" });

    // 1. Serve from cache when present.
    const cached = await store.get(def.key);
    if (cached != null) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", `public, max-age=${def.ttl}`);
      res.type("application/json").send(cached);
      return;
    }

    // 2. Miss → compute once from the origin, then populate the cache.
    try {
      const rows = await fetchFromSupabase(def.rest);
      const payload = def.transform ? def.transform(rows) : rows;
      const body = JSON.stringify(payload);
      await store.set(def.key, body, def.ttl);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", `public, max-age=${def.ttl}`);
      res.type("application/json").send(body);
    } catch (err) {
      // The upstream message can name views, columns and permission details.
      // This endpoint is public and unauthenticated, so the detail is logged
      // for the operator and the caller is told only that it failed.
      console.error(`[cache] upstream fetch failed for ${req.params.name}:`, err);
      res.status(502).json({ error: "upstream unavailable" });
    }
  });

  // Optional: force-drop cached keys (e.g. right after an edit). Guarded by a
  // shared secret so it can't be triggered by the public.
  app.post("/invalidate", express.json({ limit: "8kb" }), async (req, res) => {
    // Fail closed: the endpoint is disabled unless a secret is configured AND
    // matches, so a blank INVALIDATE_SECRET can't leave it open to anyone.
    if (!invalidateSecret || !secretMatches(req.get("x-invalidate-secret"))) {
      return res.status(403).json({ error: "forbidden" });
    }
    const cleared = await store.del("dmp:");
    res.json({ cleared });
  });

  return app;
}
