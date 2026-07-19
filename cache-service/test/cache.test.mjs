// Self-test for the caching sidecar: verifies MISS→HIT, TTL expiry, that the
// origin is only hit once while cached, and that /invalidate clears the cache.
// Runs with the in-memory store and a stub fetch — no Redis or Supabase needed.
//
//   node test/cache.test.mjs

import assert from "node:assert/strict";
import { createStore } from "../store.js";
import { createApp } from "../app.js";

let originHits = 0;
const sampleRows = [{ activity_count: 65, total_budget_vuv: "1300000000.0" }];

// Stub fetch standing in for Supabase PostgREST.
const fetchImpl = async (url) => {
  originHits += 1;
  assert.ok(url.includes("/rest/v1/v_srf_analytics"), `unexpected url ${url}`);
  return {
    ok: true,
    status: 200,
    async json() {
      return sampleRows;
    },
    async text() {
      return JSON.stringify(sampleRows);
    },
  };
};

const store = createStore("memory://");
await store.connect();

const app = createApp({
  store,
  supabaseUrl: "https://example.test",
  supabaseAnonKey: "anon",
  ttl: 1, // 1s TTL so we can test expiry quickly
  invalidateSecret: "s3cret",
  fetchImpl,
});

const server = app.listen(0);
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function get(path, headers) {
  const res = await fetch(base + path, { headers });
  return { status: res.status, cache: res.headers.get("x-cache"), body: await res.json() };
}

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`);
  }
}

// 1. First request → MISS, origin hit once, single row unwrapped.
const r1 = await get("/srf-analytics");
check("first request is a MISS", r1.cache === "MISS");
check("origin hit exactly once", originHits === 1);
check("single row unwrapped from array", r1.body && r1.body.activity_count === 65);

// 2. Second request → HIT, origin NOT hit again.
const r2 = await get("/srf-analytics");
check("second request is a HIT", r2.cache === "HIT");
check("origin still hit only once (served from cache)", originHits === 1);
check("cached body matches", r2.body.activity_count === 65);

// 3. After TTL expiry → MISS again, origin hit a second time.
await new Promise((r) => setTimeout(r, 1100));
const r3 = await get("/srf-analytics");
check("after TTL expiry it is a MISS again", r3.cache === "MISS");
check("origin re-hit after expiry", originHits === 2);

// 4. Unknown endpoint → 404.
const r4 = await get("/nope");
check("unknown endpoint returns 404", r4.status === 404);

// 5. Invalidate requires the secret.
const bad = await fetch(base + "/invalidate", { method: "POST" });
check("invalidate without secret is 403", bad.status === 403);

// Prime the cache, then invalidate with the secret → next read is a MISS.
await get("/srf-analytics"); // HIT (still cached from r3)
const ok = await fetch(base + "/invalidate", {
  method: "POST",
  headers: { "x-invalidate-secret": "s3cret" },
});
check("invalidate with secret succeeds", ok.status === 200);
const r5 = await get("/srf-analytics");
check("read after invalidate is a MISS", r5.cache === "MISS");

server.close();
await store.quit();

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll cache-service checks passed.");
