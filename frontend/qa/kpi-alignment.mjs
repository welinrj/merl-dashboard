// Regression: the four executive values share a baseline within each grid row.
// Uses the existing QA fixture; no production records or credentials are changed.
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
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
    await page.locator('.ovx-kpis .ovx-kpi').first().waitFor({ timeout: 15000 });
    const result = await page.locator('.ovx-kpis').evaluate((root) => {
      const cards = [...root.querySelectorAll('.ovx-kpi')];
      const rect = (element) => element.getBoundingClientRect();
      const positions = cards.map((card) => {
        const value = card.querySelector('.kpi-card-value');
        const label = card.querySelector('.kpi-card-label');
        const a = rect(card), v = rect(value), l = rect(label);
        return { cardTop: a.top, valueTop: v.top, labelTop: l.top,
          valueFits: v.left >= a.left - 1 && v.right <= a.right + 1 && v.bottom <= a.bottom + 1,
          text: value.textContent.trim() };
      });
      const groups = [];
      for (const item of positions) {
        const group = groups.find((row) => Math.abs(row[0].cardTop - item.cardTop) <= 2);
        if (group) group.push(item); else groups.push([item]);
      }
      const aligned = groups.every((row) => row.every((item) =>
        Math.abs(item.valueTop - row[0].valueTop) <= 1 && Math.abs(item.labelTop - row[0].labelTop) <= 1));
      const gauges = [...root.querySelectorAll('.k21-gauge')];
      const visibleGauges = gauges.every((gauge) => {
        const path = gauge.querySelector('.k21-gauge-value');
        const box = rect(path);
        return box.width > 0 && box.height > 0 && getComputedStyle(path).stroke !== 'none';
      });
      return { count: cards.length, aligned, positions, visibleGauges, gaugeCount: gauges.length };
    });
    if (result.count !== 4 || !result.aligned || !result.positions.every((p) => p.valueFits) || result.gaugeCount !== 2 || !result.visibleGauges) {
      throw new Error(`${width}px KPI alignment failure: ${JSON.stringify(result)}`);
    }
    console.log(`✓ ${width}px: four values aligned within their rows; both score gauges visible`);
  }
} finally {
  await browser.close();
}
