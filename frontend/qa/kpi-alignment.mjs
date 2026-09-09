// Executive cockpit regression: KPI cards must remain readable, aligned and
// clickable from desktop through phone widths. The overview now uses six compact
// management KPIs rather than the retired four-card gauge layout.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq';
const HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(([ref, token, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: token, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);
await context.route(`${HOST}/**`, async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (path.endsWith('/rpc/current_profile')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'u1', full_name: 'Admin', role: 'system_admin' }]) });
  if (path.startsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (path.startsWith('/rest/v1/')) {
    const rel = path.replace('/rest/v1/', '').split('/')[0];
    let rows = fixture[rel] ?? [];
    for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter((row) => String(row[key]) === value.slice(3));
    if ((route.request().headers()['accept'] || '').includes('vnd.pgrst.object')) {
      const one = rows[0] ?? null;
      return route.fulfill({ status: one ? 200 : 406, contentType: 'application/json', body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

try {
  const page = await context.newPage();
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 780]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
    await page.locator('.ov-kpis .ov-kpi').first().waitFor({ timeout: 15000 });
    const result = await page.locator('.ov-kpis').evaluate((root) => {
      const cards = [...root.querySelectorAll('.ov-kpi')];
      const records = cards.map((card) => {
        const box = card.getBoundingClientRect();
        const label = card.querySelector(':scope > span');
        const value = card.querySelector(':scope > b');
        const context = card.querySelector(':scope > small');
        const children = [...card.children];
        const hierarchy = !!label && !!value && !!context
          && children.indexOf(label) < children.indexOf(value)
          && children.indexOf(value) < children.indexOf(context);
        const noOverflow = card.scrollWidth <= card.clientWidth + 1 && card.scrollHeight <= card.clientHeight + 1;
        return {
          label: label?.textContent?.trim(),
          value: value?.textContent?.trim(),
          top: box.top,
          bottom: box.bottom,
          hierarchy,
          noOverflow,
          minHeight: box.height >= 100,
        };
      });
      const rowGroups = [];
      for (const r of records) {
        const row = rowGroups.find((g) => Math.abs(g[0].top - r.top) <= 2);
        if (row) row.push(r); else rowGroups.push([r]);
      }
      const rowAligned = rowGroups.every((row) => Math.max(...row.map(r => r.bottom)) - Math.min(...row.map(r => r.bottom)) <= 2);
      const noHorizontalOverflow = document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
      return { count: cards.length, records, rowAligned, noHorizontalOverflow };
    });
    if (result.count !== 6 || !result.rowAligned || !result.noHorizontalOverflow || result.records.some((r) => !r.label || !r.value || !r.hierarchy || !r.noOverflow || !r.minHeight)) {
      throw new Error(`${width}px executive KPI layout failure: ${JSON.stringify(result)}`);
    }
    console.log(`PASS ${width}px: six executive KPIs aligned, ordered and overflow-safe`);
  }
} finally {
  await browser.close();
}
