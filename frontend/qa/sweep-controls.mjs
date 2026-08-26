// Clicks every visible, enabled interactive control on every route and records
// what happened: console errors, page errors, navigation, and whether the app
// still renders afterwards. Runs against a stub, so no real data is touched and
// destructive controls are safe to press.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));
const ROLE = process.argv[2] || 'system_admin';

const ROUTES = [
  '/dashboards', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin',
  '/analytics/results', '/analytics/financial', '/analytics/geographic', '/analytics/risks',
  '/analytics/project-portfolio?project=pa',
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(([ref, tok, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);

const netFail = [];
await ctx.route(`${HOST}/**`, async (r) => {
  const u = new URL(r.request().url()), p = u.pathname;
  if (p.endsWith('/rpc/current_profile')) {
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 'u1', email: 'admin@docc.gov.vu', full_name: 'Test Admin', role: ROLE }]) });
  }
  if (p.startsWith('/auth/v1/user')) {
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  }
  if (p.startsWith('/rest/v1/rpc/')) {
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  if (p.startsWith('/rest/v1/')) {
    const rel = p.replace('/rest/v1/', '').split('/')[0];
    if (!(rel in T)) netFail.push(`unstubbed view: ${rel}`);
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
let errs = [];
page.on('pageerror', (e) => errs.push(`PAGEERROR ${String(e).slice(0, 140)}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`CONSOLE ${m.text().slice(0, 140)}`); });
page.on('requestfailed', (r) => {
  const u = r.url();
  // Google Fonts and the unpkg leaflet stylesheet are blocked by the sandbox
  // and are pre-existing external assets, not application faults.
  if (/fonts\.googleapis|fonts\.gstatic|unpkg\.com/.test(u)) return;
  netFail.push(`${r.failure()?.errorText} ${u.slice(0, 90)}`);
});
page.on('dialog', (d) => d.dismiss().catch(() => {}));

// A control is worth clicking if a user can see and press it.
const SELECTOR = 'button:visible:not([disabled]), a[href]:visible, [role=tab]:visible, [role=option]:visible';

const findings = [];
let clicked = 0, routesOk = 0;

for (const route of ROUTES) {
  await page.goto(`http://localhost:5199/#${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2200);
  errs = [];

  const n = await page.locator(SELECTOR).count();
  const labels = [];
  for (let i = 0; i < n; i += 1) {
    const el = page.locator(SELECTOR).nth(i);
    labels.push(((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '(icon)')
      .replace(/\s+/g, ' ').trim().slice(0, 40));
  }

  for (let i = 0; i < n; i += 1) {
    errs = [];
    const before = page.url();
    const el = page.locator(SELECTOR).nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const label = labels[i] || '(icon)';

    await el.click({ timeout: 3000, force: false }).catch(() => {});
    await page.waitForTimeout(450);
    clicked += 1;

    // Did the app survive?
    const alive = await page.evaluate(() => document.body.innerText.trim().length > 50).catch(() => false);
    const navigated = page.url() !== before;

    if (errs.length) findings.push(`${route} :: "${label}" -> ${errs[0]}`);
    if (!alive) findings.push(`${route} :: "${label}" -> BLANK PAGE after click`);

    // Close anything modal the click opened, and get back to a known state.
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(120);
    if (navigated || !alive) {
      await page.goto(`http://localhost:5199/#${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1400);
    }
  }
  routesOk += 1;
  console.log(`  ${route.padEnd(42)} ${n} controls clicked`);
}

console.log(`\nroutes swept: ${routesOk}/${ROUTES.length}   controls clicked: ${clicked}`);
console.log(`\nfindings (${findings.length}):`);
for (const f of [...new Set(findings)]) console.log(`  ${f}`);
console.log(`\nnetwork failures (${[...new Set(netFail)].length}):`);
for (const f of [...new Set(netFail)].slice(0, 15)) console.log(`  ${f}`);

await b.close();
