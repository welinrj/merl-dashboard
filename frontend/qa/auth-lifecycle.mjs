// Authentication lifecycle, without the harness re-seeding the session.
//
// addInitScript runs on every navigation, so a context that injects the auth
// token that way silently signs the user back in after sign-out and makes the
// back button look like a hole. The token is therefore written once, by hand,
// and never again — which is how a real browser behaves.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });

let profileCalls = 0;
await ctx.route(`${HOST}/**`, async (r) => {
  const u = new URL(r.request().url()), p = u.pathname;
  const auth = r.request().headers()['authorization'] || '';
  if (p.endsWith('/rpc/current_profile')) {
    profileCalls += 1;
    // No bearer token means no profile — the server would not answer either.
    if (!auth.includes(jwt)) return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'JWT expired or missing' }) });
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'u1', email: 'admin@docc.gov.vu', full_name: 'Test Admin', role: 'system_admin' }]) });
  }
  if (p.startsWith('/auth/v1/logout')) return r.fulfill({ status: 204, body: '' });
  if (p.startsWith('/auth/v1/user')) {
    if (!auth.includes(jwt)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"invalid"}' });
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  }
  if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (p.startsWith('/rest/v1/')) {
    if (!auth.includes(jwt)) return r.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"JWT missing"}' });
    const rel = p.replace('/rest/v1/', '').split('/')[0];
    let body = T[rel] ?? [];
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) body = body.filter((x) => String(x[k]) === v.slice(3));
    if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) {
      const one = body[0] ?? null;
      return r.fulfill({ status: one ? 200 : 406, contentType: 'application/json', body: JSON.stringify(one) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

const page = await ctx.newPage();
const atLogin = async () => (await page.locator('input[type=password]').count()) > 0;
const say = (label, value, bad = false) =>
  console.log(`  ${label.padEnd(44)}${String(value).padEnd(8)}${bad ? '<-- PROBLEM' : ''}`);

// Seed the session exactly once.
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
await page.evaluate(([ref, tok, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);

await page.goto('http://localhost:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
say('session restored from storage', !(await atLogin()));
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000);
say('survives refresh', !(await atLogin()));

// Sign out through the account menu, where it actually lives.
await page.locator('.dsh-user').first().click().catch(() => {});
await page.waitForTimeout(400);
const out = page.getByRole('button', { name: /Sign out|Log ?out/i }).first();
say('sign-out control reachable', (await out.count()) > 0);
await out.click(); await page.waitForTimeout(2200);
say('returns to login after sign-out', await atLogin());

const cleared = await page.evaluate((ref) => {
  try { return localStorage.getItem(`sb-${ref}-auth-token`) === null; } catch { return 'unreadable'; }
}, REF);
say('auth token cleared from localStorage', cleared, cleared !== true);

// Back button must not restore a signed-in view.
await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(2000);
const backIn = !(await atLogin());
say('back button regains access', backIn, backIn);

// A copied deep link must not either.
await page.goto('http://localhost:5199/#/admin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const deepIn = !(await atLogin());
say('copied URL to /admin regains access', deepIn, deepIn);
const leaked = await page.locator('body').innerText().catch(() => '');
say('project data visible after sign-out', /DEMO-0001|Community Coastal/.test(leaked), /DEMO-0001|Community Coastal/.test(leaked));

// Bad credentials must be refused and must say so.
await page.evaluate(() => { try { localStorage.clear(); } catch { /* ignore */ } });
await page.goto('http://localhost:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);
const emailBox = page.locator('input[type=email], input[name=email]').first();
if (await emailBox.count()) {
  const submit = page.getByRole('button', { name: /sign in|log ?in/i }).first();
  await submit.click().catch(() => {});           // blank credentials
  await page.waitForTimeout(900);
  say('blank credentials rejected (stays on login)', await atLogin());
  const html = await page.locator('body').innerText();
  say('required fields are marked', /required|Email|Password/i.test(html));
}

await b.close();
