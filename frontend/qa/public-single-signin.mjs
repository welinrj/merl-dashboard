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
  if (await form.locator('input[type="email"]').count() !== 1 || await form.locator('input[type="password"]').count() !== 1 || await form.locator('button[type="submit"]').count() !== 1) {
    throw new Error(`${label}: email, password or submit control is missing`);
  }
  console.log(`PASS ${label}`);
};

try {
  await page.goto('http://localhost:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
  await page.locator('.pbd-root .pbd-metrics').waitFor({ timeout: 15000 });
  await assertHeaderLogin('Public overview');
  const publicDestinations = page.locator('.pbd-root .dsh-nav button');
  if (await publicDestinations.count() !== 1 || await publicDestinations.first().innerText() !== 'Public Overview') {
    throw new Error('Expected Public Overview to be the only public destination');
  }
  const form = page.locator('.pbd-header-login');
  await form.getByLabel('Email').fill('invalid@example.test');
  await form.getByLabel('Password').fill('invalid-password');
  await form.locator('button[type="submit"]').click();
  await form.getByRole('alert').waitFor({ timeout: 15000 });
  if (new URL(page.url()).hash !== '#/dashboards') throw new Error('Failed login changed the dashboard route');
  if (await form.locator('input[type="password"]').inputValue() !== 'invalid-password') throw new Error('Failed password was not retained for correction');
  console.log('PASS Invalid credentials remain on the public dashboard');
  await page.setViewportSize({ width: 390, height: 844 });
  const publicMenu = page.locator('.pbd-root .dsh-head .dsh-hamburger');
  await publicMenu.waitFor({ state: 'visible' });
  if (!await publicMenu.getAttribute('aria-label')) throw new Error('Public mobile menu has no accessible label');
  await publicMenu.click();
  await assertHeaderLogin('Mobile menu open');
  const overlay = page.getByRole('button', { name: 'Close menu' });
  const box = await overlay.boundingBox();
  const sidebar = await page.locator('.dsh-side.open').boundingBox();
  if (!box || !sidebar || box.x + box.width - 12 <= sidebar.x + sidebar.width) {
    throw new Error('Mobile menu has no exposed backdrop to close it');
  }
  await overlay.click({ position: { x: box.width - 12, y: box.height / 2 } });
  if (await page.locator('.dsh-side').evaluate(el => el.classList.contains('open'))) throw new Error('Mobile menu did not close');
  await assertHeaderLogin('Mobile menu closed');
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error('Mobile page has horizontal overflow');
  console.log('PASS Mobile layout has no horizontal overflow');

  const mobileSignIn = page.locator('.pbd-mobile-signin');
  await mobileSignIn.click();
  const loginLayer = page.locator('.pbd-mobile-login-layer');
  const mobileForm = loginLayer.locator('form.pbd-header-login');
  await mobileForm.waitFor({ state: 'visible' });
  const [layerBox, formBox, viewport] = await Promise.all([
    loginLayer.boundingBox(),
    mobileForm.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);
  if (!layerBox || layerBox.x !== 0 || layerBox.y !== 0 || Math.abs(layerBox.width - viewport.width) > 1 || Math.abs(layerBox.height - viewport.height) > 1) {
    throw new Error('Mobile sign-in layer does not cover the viewport');
  }
  if (!formBox || formBox.x < 10 || formBox.x + formBox.width > viewport.width - 10 || formBox.y < 60) {
    throw new Error('Mobile sign-in form is clipped or off-screen');
  }
  if (await page.locator('.dsh-side').evaluate(el => el.classList.contains('open'))) throw new Error('Opening sign-in also opened the mobile menu');
  await mobileForm.getByLabel('Email').fill('phone@example.test');
  await mobileForm.getByLabel('Password').fill('phone-password');
  if (!await mobileForm.getByRole('button', { name: 'Sign In' }).isVisible()) throw new Error('Mobile sign-in submit button is not visible');
  await mobileForm.getByRole('button', { name: 'Close' }).click();
  await loginLayer.waitFor({ state: 'detached' });
  console.log('PASS Mobile sign-in opens fully inside the viewport and closes cleanly');
} finally {
  await browser.close();
}
