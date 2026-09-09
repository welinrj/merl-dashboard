// The data-availability guard must fire on a real failed read and must not fire
// on a request the app itself cancelled.
//
// supabaseClient wraps fetch so a failed PostgREST read is recorded and the UI
// blocks the values rather than rendering a transport failure as a believable
// zero. Its catch block treated *any* thrown fetch as a failure — including the
// abort React Query issues when a query is no longer needed. fetchPublicSnapshot
// passes `.abortSignal(signal)`, so navigating away from the public dashboard
// while its snapshot was still loading raised the full-screen unavailable-data
// dialog over a page whose reads were fine, and nothing cleared it but a reload.
// It needed a read to still be in flight at the moment of navigation, so it
// surfaced as an intermittent failure of qa/public-dashboard.mjs.
//
// Both directions are asserted here: narrowing the guard must not stop it
// blocking a genuinely failed read.
import { chromium } from 'playwright';

const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const BASE = 'http://localhost:5199';
const GUARD = '[role=alertdialog][aria-labelledby=data-availability-title]';

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

// ── 1. An aborted read must not raise the guard ─────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route((u) => u.href.startsWith(HOST), async (route) => {
    const url = route.request().url();
    if (url.includes('public_portal_')) {
      // Slow, so navigating away cancels it mid-flight — the real-world case is
      // a field phone on a slow connection. The request being cancelled is the
      // point of the test, so fulfilling it afterwards is expected to fail:
      // swallow that rather than leave a rejected promise behind.
      await new Promise((r) => setTimeout(r, 4000));
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: url.includes('summary') ? '{"singleton":true,"project_count":0}' : '[]' })
        .catch(() => {});
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      .catch(() => {});
  });
  const page = await ctx.newPage();
  const guarded = () => page.locator(GUARD).count();

  await page.goto(`${BASE}/#/dashboards`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);                     // snapshot reads in flight
  await page.goto(`${BASE}/#/project-setup`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);                     // navigation aborts them
  check('navigating away mid-read does not raise the guard', (await guarded()) === 0);

  await page.goto(`${BASE}/#/dashboards`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  check('the public dashboard is usable on return', (await guarded()) === 0);

  const menu = page.getByRole('button', { name: 'Open menu' });
  const clickable = await menu.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  }).catch(() => false);
  check('the mobile menu is not covered', clickable === true);
  // Route handlers deliberately sleep, so some may still be in flight. Drop them
  // before closing: tearing the context down underneath a pending handler leaves
  // the browser process behind, and an orphan per run is enough to slow the next
  // script in the suite past its own load timeout on a small CI runner.
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 2. A genuinely failed read must still raise it ──────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route((u) => u.href.startsWith(HOST), (route) => {
    const url = route.request().url();
    if (url.includes('/rest/v1/') && route.request().method() === 'GET') {
      return route.fulfill({ status: 500, contentType: 'application/json',
        body: '{"message":"server error"}' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#/dashboards`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  check('a failed read still blocks the portal', (await page.locator(GUARD).count()) === 1,
    'the guard exists to stop a transport failure reading as a legitimate zero');
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nRead-failure guard behaves correctly in both directions');
// Set the code and let node exit on its own: process.exit() here would kill the
// process before Playwright has finished shutting the browser down.
process.exitCode = failed ? 1 : 0;
