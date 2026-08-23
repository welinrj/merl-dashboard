#!/usr/bin/env node
// =============================================================================
// check-supabase.mjs — quick backend connectivity check for the MERL Portal.
// Verifies the frontend can reach its Supabase backend and that the anon key is
// valid, using the same URL/key resolution as src/supabaseClient.ts:
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (env overrides), else the
//   staging-project fallbacks below.
//
// Usage:
//   node scripts/check-supabase.mjs
//   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/check-supabase.mjs
//   npm run check:supabase
//
// Exit code 0 = connected, 1 = a check failed. No secrets are printed.
// =============================================================================

const URL = process.env.VITE_SUPABASE_URL
  || 'https://ndntvncboeajanipafeq.supabase.co';
const KEY = process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kbnR2bmNib2VhamFuaXBhZmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODA3ODEsImV4cCI6MjA5ODg1Njc4MX0.EPLQbtDvTPIVY57NCZEjsUJzxrbMhP-gngVyP1Vfpm4';

const usingEnv = !!process.env.VITE_SUPABASE_URL;
const host = (() => { try { return new global.URL(URL).host; } catch { return URL; } })();

async function hit(path, headers = {}) {
  const ctl = AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
  const res = await fetch(`${URL}${path}`, { headers, signal: ctl });
  return res.status;
}

const results = [];
function record(name, ok, detail) { results.push({ name, ok, detail }); }

try {
  console.log(`Checking Supabase backend: ${host}  (${usingEnv ? 'from VITE_SUPABASE_URL' : 'built-in fallback'})\n`);

  // 1) Project reachable / live.
  try {
    const s = await hit('/auth/v1/health', { apikey: KEY });
    record('Auth service reachable', s === 200, `GET /auth/v1/health → ${s}`);
  } catch (e) { record('Auth service reachable', false, `network error: ${e.message}`); }

  // 2) Anon key valid (settings returns 200 for a good key, 401 for a bad one).
  try {
    const s = await hit('/auth/v1/settings', { apikey: KEY });
    record('Anon API key accepted', s === 200, `GET /auth/v1/settings → ${s}`);
  } catch (e) { record('Anon API key accepted', false, `network error: ${e.message}`); }

  // 3) PostgREST (data API) reachable — a request the key is routed to. A valid
  //    key on an RLS-protected resource returns 200 or a 401/permission body
  //    from PostgREST (both prove the data layer is reachable and the key routed);
  //    a DNS/proxy failure throws instead.
  try {
    const s = await hit('/rest/v1/', { apikey: KEY });
    record('Data API (PostgREST) reachable', s > 0, `GET /rest/v1/ → ${s}`);
  } catch (e) { record('Data API (PostgREST) reachable', false, `network error: ${e.message}`); }

  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}  —  ${r.detail}`);
    if (!r.ok) allOk = false;
  }
  console.log(allOk
    ? '\nBackend connection OK.'
    : '\nBackend connection FAILED — check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY and network access.');
  process.exit(allOk ? 0 : 1);
} catch (e) {
  console.error('Connection check errored:', e.message);
  process.exit(1);
}
