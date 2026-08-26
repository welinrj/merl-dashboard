// Data integrity, filters, search, sorting, export and responsive behaviour.
//
// The stub holds values chosen so every KPI can be worked out by hand, and the
// assertions below are those hand calculations — not a copy of whatever the app
// happens to render.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await ctx.addInitScript(([ref, tok, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);
await ctx.route(`${HOST}/**`, async (r) => {
  const u = new URL(r.request().url()), p = u.pathname;
  if (p.endsWith('/rpc/current_profile')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'u1', full_name: 'Admin', role: 'system_admin' }]) });
  if (p.startsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
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
const page = await ctx.newPage();
const go = async (r) => { await page.goto(`http://localhost:5199/#${r}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2300); };
const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

// ── KPI reconciliation ───────────────────────────────────────────────────────
// Hand calculation from the stub:
//   projects        = 2                       (pa, pb)
//   total budget    = 1,000,000 + 160,000,000 = 161,000,000  -> "161.00M"
//   expenditure     = 300,000 (the only financial record)
//   beneficiaries   = 120 (one record, checked)
console.log('\nDASHBOARD KPIs (traced to the underlying records)');
await go('/dashboards');
let tx = await body();
check('project count is 2', /\b2\b/.test(tx));
check('total budget reads 161.00M', /161\.00M|161,000,000/.test(tx), tx.match(/VT [\d.,]+M?/)?.[0]);
check('expenditure reads 300.0K (300,000 of 161.00M)', /300\.0K|300,000/.test(tx),
  tx.match(/DISBURSED[^A-Z]{0,40}/)?.[0]);
check('beneficiaries read 120', /\b120\b/.test(tx));
check('no NaN anywhere', !/NaN/.test(tx), tx.match(/.{0,30}NaN.{0,30}/)?.[0]);
check('no undefined leaked into the page', !/\bundefined\b/.test(tx));
check('no raw status tokens shown', !/\bon_track\b|\bnot_started\b|\bin_progress\b/.test(tx),
  tx.match(/\b(on_track|not_started|in_progress)\b/)?.[0]);

// ── Analytics filters ────────────────────────────────────────────────────────
console.log('\nANALYTICS FILTERS');
await go('/analytics/portfolio');
const before = await body();
const selects = page.locator('select');
const nSel = await selects.count();
check(`filter controls present (${nSel})`, nSel > 0);
if (nSel > 0) {
  // Pick a real option on the first filter and confirm the page responds.
  const opts = await selects.first().locator('option').allTextContents();
  if (opts.length > 1) {
    await selects.first().selectOption({ index: 1 });
    await page.waitForTimeout(1200);
    const after = await body();
    check('changing a filter changes the page', after !== before);
    // Reset must restore the original view.
    const reset = page.getByRole('button', { name: /reset/i }).first();
    if (await reset.count()) {
      await reset.click(); await page.waitForTimeout(1200);
      check('reset restores the unfiltered view', (await body()) === before);
    } else check('reset control offered once a filter is active', false, 'no Reset button found');
  }
}

// ── Search ───────────────────────────────────────────────────────────────────
console.log('\nGLOBAL SEARCH');
await go('/dashboards');
// Global search is a command-palette trigger, not an inline box: open it first.
await page.locator('.gs-trigger, button[aria-label*="earch" i]').first().click().catch(() => {});
await page.waitForTimeout(600);
const search = page.locator('input').first();
if (await search.count()) {
  await search.click(); await search.fill('DEMO-0001'); await page.waitForTimeout(900);
  check('exact code finds the project', /Community Coastal/i.test(await body()));
  await search.fill('coastal'); await page.waitForTimeout(900);
  check('partial lowercase finds it', /Community Coastal/i.test(await body()));
  await search.fill('zzzznotathing'); await page.waitForTimeout(900);
  const none = await body();
  check('no match is handled without error', !/NaN|undefined/.test(none));
  await search.fill(''); await page.keyboard.press('Escape');
} else check('global search present', false);

// ── Map ──────────────────────────────────────────────────────────────────────
console.log('\nMAP');
await go('/analytics/geographic');
const svg = page.locator('svg').first();
check('map renders', await svg.count() > 0);
const paths = await page.locator('svg path').count();
check(`province shapes drawn (${paths})`, paths >= 6);
const region = page.locator('svg path').first();
await region.click().catch(() => {});
await page.waitForTimeout(800);
check('clicking a region does not error', !/NaN|undefined/.test(await body()));

// ── Export ───────────────────────────────────────────────────────────────────
console.log('\nEXPORT / PRINT');
await go('/reports');
await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
const printBtn = page.getByRole('button', { name: /print|pdf|export/i }).first();
if (await printBtn.count()) {
  await printBtn.click(); await page.waitForTimeout(1200);
  check('report export triggers print', await page.evaluate(() => window.__printed === true));
} else check('an export control exists on Reports', false);

await go('/analytics/project-portfolio?project=pa');
await page.evaluate(() => { window.__printed = false; window.print = () => { window.__printed = true; }; });
const exp = page.getByRole('button', { name: /Export project performance/i }).first();
if (await exp.count()) {
  await exp.click(); await page.waitForTimeout(1200);
  check('project performance export triggers print', await page.evaluate(() => window.__printed === true));
}

// ── Responsive ───────────────────────────────────────────────────────────────
console.log('\nRESPONSIVE');
for (const [w, h, name] of [[1920, 1080, 'desktop-wide'], [1440, 900, 'laptop'],
  [1024, 1366, 'tablet'], [768, 1024, 'ipad'], [390, 844, 'phone'], [360, 780, 'small phone']]) {
  await page.setViewportSize({ width: w, height: h });
  await go('/analytics/project-portfolio?project=pa');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const readable = (await body()).length > 200;
  check(`${name} (${w}px): no sideways scroll, content present`, !overflow && readable,
    overflow ? 'HORIZONTAL OVERFLOW' : 'no content');
}
await page.setViewportSize({ width: 1440, height: 900 });

// ── Accessibility basics ─────────────────────────────────────────────────────
console.log('\nACCESSIBILITY');
await go('/analytics/project-portfolio?project=pa');
const a11y = await page.evaluate(() => {
  // Painted box, which is reliable. A control that deliberately extends its
  // target with a pseudo-element is asserted separately below.
  const small = [...document.querySelectorAll('button, a[href], [role=tab]')]
    // The bell is deliberately an 18px icon; its real target is asserted below.
    .filter((e) => !e.closest('.dsh-bell'))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 24; })
    .map((e) => (e.textContent || e.getAttribute('aria-label') || e.className.toString() || '?').trim().slice(0, 24));
  const unlabelled = [...document.querySelectorAll('button')]
    .filter((e) => !e.textContent.trim() && !e.getAttribute('aria-label') && !e.getAttribute('title')).length;
  const inputsNoLabel = [...document.querySelectorAll('input, select')]
    .filter((e) => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('placeholder')
      && !e.getAttribute('aria-labelledby') && !e.id).length;
  const imgNoAlt = [...document.querySelectorAll('img')].filter((e) => !e.hasAttribute('alt')).length;
  // The bell is an 18px icon whose hit area is widened with a pseudo-element;
  // measure what a finger would actually land on.
  const bell = document.querySelector('.dsh-bell');
  let bellReach = 0;
  if (bell) {
    const r = bell.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const on = (x, y) => { const t = document.elementFromPoint(x, y); return !!(t && t.closest('.dsh-bell')); };
    let up = 0, down = 0;
    while (up < 48 && on(cx, cy - up - 1)) up += 1;
    while (down < 48 && on(cx, cy + down + 1)) down += 1;
    bellReach = up + down;
  }
  return { small, unlabelled, inputsNoLabel, imgNoAlt, bellReach };
});
check(`no unlabelled buttons (${a11y.unlabelled})`, a11y.unlabelled === 0);
check(`no unlabelled inputs (${a11y.inputsNoLabel})`, a11y.inputsNoLabel === 0);
check(`images carry alt text (${a11y.imgNoAlt} missing)`, a11y.imgNoAlt === 0);
check(`painted controls >= 24px tall (${a11y.small.length} smaller)`, a11y.small.length === 0, a11y.small.join(', '));

// Keyboard: tab must reach something focusable and show a ring.
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
check(`notification bell hit area >= 40px (${a11y.bellReach}px)`, a11y.bellReach >= 40, `${a11y.bellReach}px`);
check(`keyboard focus reaches a control (${focused})`, focused !== 'BODY' && focused !== 'NONE');

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
