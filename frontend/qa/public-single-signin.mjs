import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem('merl.lang', 'en'));
await context.route('https://ndntvncboeajanipafeq.supabase.co/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/auth/v1/')) {
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  }
  const relation = url.pathname.split('/').pop();
  const rows = relation === 'public_portal_summary'
    ? [{ project_count: 0, overall_progress_pct: null, published_beneficiaries: null, total_investment_vuv: null }]
    : [];
  const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
});
await context.route('https://services.arcgis.com/**', route => route.abort());
await context.route('https://unpkg.com/**', route => route.abort());

const page = await context.newPage();
const assertHeaderLogin = async label => {
  const form = page.locator('.pbd-root .dsh-head form.pbd-header-login');
  if (await form.count() !== 1 || await page.locator('.pbd-root form.pbd-header-login').count() !== 1) {
    throw new Error(`${label}: expected exactly one login form, in the header`);
  }
  if (await page.locator('.pbd-root a[href="#/login"]').count() !== 0) {
    throw new Error(`${label}: duplicate login link remains`);
  }
  if (await form.locator('input[type="email"]').count() !== 1 || await form.locator('input[type="password"]').count() !== 1 || await form.getByRole('button', { name: 'Sign in', exact: true }).count() !== 1) {
    throw new Error(`${label}: email, password or submit control is missing`);
  }
  console.log(`PASS ${label}`);
};

try {
  await page.goto('http://localhost:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
  await page.locator('.pbd-root .pbd-kpis').waitFor({ timeout: 15000 });
  await assertHeaderLogin('Public overview');
  for (const name of ['Projects', 'Results', 'Geographic Coverage', 'Public Overview']) {
    await page.locator('.pbd-root .dsh-nav').getByRole('button', { name, exact: true }).click();
    await assertHeaderLogin(name);
  }
  const form = page.locator('.pbd-header-login');
  await form.getByLabel('Email').fill('invalid@example.test');
  await form.getByLabel('Password').fill('invalid-password');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await form.getByRole('alert').waitFor({ timeout: 15000 });
  if (new URL(page.url()).hash !== '#/dashboards') throw new Error('Failed login changed the dashboard route');
  if (await form.locator('input[type="password"]').inputValue() !== '') throw new Error('Failed password was not cleared');
  console.log('PASS Invalid credentials remain on the public dashboard');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await assertHeaderLogin('Mobile menu open');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await assertHeaderLogin('Mobile menu closed');
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error('Mobile page has horizontal overflow');
  console.log('PASS Mobile layout has no horizontal overflow');
} finally {
  await browser.close();
}
