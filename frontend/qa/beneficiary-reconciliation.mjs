// Portfolio beneficiary KPIs must agree with the per-project figure.
//
// Form 8 is period-scoped, so a project reporting each quarter holds one record
// per period. The Overview, the dashboards and the printed reports used to add
// every record together; Project Analysis reduced each project under the
// double-counting rule (sum only when every record is confirmed free of double
// counting, otherwise the largest single report). With one record per project —
// which is all the seeded staging data has — the two agree, so the divergence
// was invisible. Add a second reporting period and the same headcount is shown
// two different ways on two screens.
//
// This fixture gives project `pa` two periods (120 confirmed, 150 unconfirmed).
// The honest figure is 150. A flat sum would say 270.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE ?? 'qa/fixture-multiperiod.json', 'utf8'));

const EXPECTED = 150;      // largest single report for the one project with data
const FLAT_SUM = 270;      // what adding every record would have shown

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(([ref, tok, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);
await ctx.route(`${HOST}/**`, async (r) => {
  const u = new URL(r.request().url()), p = u.pathname;
  if (p.endsWith('/rpc/current_profile')) {
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'u1', email: 'admin@docc.gov.vu', full_name: 'Test Admin', role: 'system_admin' }]) });
  }
  if (p.startsWith('/auth/v1/user')) {
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  }
  if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (p.startsWith('/rest/v1/')) {
    const rel = p.replace('/rest/v1/', '').split('/')[0];
    let body = T[rel] ?? [];
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) body = body.filter((x) => String(x[k]) === v.slice(3));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

const page = await ctx.newPage();
const numbersOn = async (route) => {
  await page.goto(`http://localhost:5199/#${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3500);
  const text = await page.locator('body').innerText();
  return new Set([...text.matchAll(/\b\d[\d,]*\b/g)].map((m) => Number(m[0].replace(/,/g, ''))));
};

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

console.log('BENEFICIARY RECONCILIATION (project pa: 120 confirmed + 150 unconfirmed)');

for (const [label, route] of [
  ['Overview', '/dashboards'],
  ['Dashboards (portfolio)', '/analytics/portfolio'],
  ['Project Analysis', '/analytics/project-portfolio?project=pa'],
]) {
  const seen = await numbersOn(route);
  check(`${label} shows the reconciled figure (${EXPECTED})`, seen.has(EXPECTED));
  check(`${label} does not show the double-counted sum (${FLAT_SUM})`, !seen.has(FLAT_SUM),
    seen.has(FLAT_SUM) ? 'a flat sum across reporting periods is on screen' : '');
}

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll pages report the same headcount');
process.exit(failed ? 1 : 0);
