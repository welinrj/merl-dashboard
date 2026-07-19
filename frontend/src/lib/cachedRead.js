// =============================================================================
// cachedRead — read a shared aggregate from the Redis caching sidecar, with a
// graceful fallback to computing it directly when the sidecar isn't present.
// =============================================================================
// In production the sidecar is reachable at same-origin `/api-cache/<name>` (see
// nginx.conf + docker-compose). On staging (Supabase Cloud, no sidecar) or if
// the cache is down, the fetch fails fast and we fall back to `fallback()` — so
// the UI works identically everywhere, just without the shared cache speed-up.
//
//   const { data, source } = await cachedRead('srf-analytics', async () => {...});
//
// `source` is 'HIT' | 'MISS' (from the sidecar's X-Cache header) or 'origin'
// when the fallback ran — handy for diagnostics, ignorable otherwise.

const CACHE_BASE = '/api-cache';

export async function cachedRead(name, fallback, { timeoutMs = 2500 } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${CACHE_BASE}/${name}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const data = await res.json();
      // A same-origin SPA fallback (index.html) would 200 with HTML; guard on
      // the X-Cache header the sidecar always sets so we don't accept that.
      const source = res.headers.get('X-Cache');
      if (source) return { data, source };
    }
    throw new Error(`cache unavailable (${res.status})`);
  } catch {
    return { data: await fallback(), source: 'origin' };
  }
}
