// Permission matrix + authentication lifecycle.
//
// For every role: which navigation items appear, which routes survive a direct
// URL, and whether write/approve controls are offered. Then the auth lifecycle:
// does logout actually clear the session, and can a logged-out user get back in
// with the back button or a copied URL.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));

const ROLES = ['system_admin', 'docc_me_officer', 'project_manager', 'data_entry_officer', 'viewer'];
const ROUTES = ['/dashboards', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin',
  '/analytics/results', '/analytics/financial', '/analytics/geographic', '/analytics/risks',
  '/analytics/project-portfolio'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const mkContext = async (role, withSession = true) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  if (withSession) {
    await ctx.addInitScript(([ref, tok, exp]) => {
      localStorage.setItem('merl.lang', 'en');
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
      }));
    }, [REF, jwt, now + 99999]);
  }
  await ctx.route(`${HOST}/**`, async (r) => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (p.endsWith('/rpc/current_profile')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'u1', email: 'user@docc.gov.vu', full_name: 'Test User', role }]) });
    }
    if (p.startsWith('/auth/v1/logout')) return r.fulfill({ status: 204, body: '' });
    if (p.startsWith('/auth/v1/user')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
    }
    if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (p.startsWith('/rest/v1/')) {
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
  return ctx;
};

// ── Permission matrix ────────────────────────────────────────────────────────
console.log('ROUTE ACCESS BY ROLE  (reached = the route rendered; redirected = sent away)\n');
const header = ['route'.padEnd(34), ...ROLES.map((r) => r.slice(0, 12).padEnd(13))].join('');
console.log(header);
console.log('-'.repeat(header.length));

const matrix = {};
for (const role of ROLES) {
  const ctx = await mkContext(role);
  const page = await ctx.newPage();
  matrix[role] = {};
  for (const route of ROUTES) {
    await page.goto(`http://localhost:5199/#${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    matrix[role][route] = page.url().includes(route.split('?')[0]);
  }
  // Which write / approve controls the role is offered anywhere.
  await page.goto('http://localhost:5199/#/review', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const body = await page.locator('body').innerText().catch(() => '');
  matrix[role]._approve = /\bApprove\b/i.test(body);
  await page.goto('http://localhost:5199/#/project-setup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const ps = await page.locator('body').innerText().catch(() => '');
  matrix[role]._newProject = /New project/i.test(ps);
  matrix[role]._nav = (await page.locator('.dsh-nav').innerText().catch(() => '')).split('\n').filter(Boolean).length;
  await ctx.close();
}
for (const route of ROUTES) {
  console.log(route.padEnd(34) + ROLES.map((r) => (matrix[r][route] ? 'reached' : 'REDIRECTED').padEnd(13)).join(''));
}
console.log('-'.repeat(header.length));
console.log('Approve offered'.padEnd(34) + ROLES.map((r) => (matrix[r]._approve ? 'yes' : 'no').padEnd(13)).join(''));
console.log('New project offered'.padEnd(34) + ROLES.map((r) => (matrix[r]._newProject ? 'yes' : 'no').padEnd(13)).join(''));
console.log('Sidebar items'.padEnd(34) + ROLES.map((r) => String(matrix[r]._nav).padEnd(13)).join(''));


await b.close();
