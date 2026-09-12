// Regression for the user-approved 21st.dev hierarchy: title, chart with its
// value inside, context, and destination. No production data is modified.
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
    await page.locator('.ovx-kpis .ovx-kpi').first().waitFor({ timeout: 15000 });
    const result = await page.locator('.ovx-kpis').evaluate((root) => {
      const cards = [...root.querySelectorAll('.ovx-kpi')];
      const rect = (element) => element.getBoundingClientRect();
      const fits = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
      const records = cards.map((card) => {
        const title = card.querySelector('.kpi-card-label');
        const visual = card.querySelector('.kpi-card-visual');
        const value = card.querySelector('.kpi-card-value');
        const context = card.querySelector('.kpi-card-sub');
        const footer = card.querySelector('.kpi-card-link');
        const gauge = card.querySelector('.k21-gauge');
        const a = rect(card), t = rect(title), v = rect(visual), n = rect(value), c = rect(context), f = rect(footer);
        const hierarchy = t.bottom <= v.top + 1 && v.bottom <= c.top + 1 && c.bottom <= f.top + 1;
        const withinCard = [t, v, n, c, f].every((box) => fits(box, a));
        let gaugeValid = true;
        if (gauge) {
          const g = rect(gauge);
          const path = gauge.querySelector('.k21-gauge-value');
          const p = rect(path);
          const number = Number(value.textContent.replace(/[^0-9.]/g, ''));
          const offset = Number(path.getAttribute('stroke-dashoffset'));
          gaugeValid = value.closest('.k21-gauge-copy') !== null && fits(n, g)
            && n.top > g.top + g.height * .3
            && p.width > 0 && p.height > 0 && getComputedStyle(path).stroke !== 'none'
            && Math.abs(offset - (100 - number)) <= 1;
        } else {
          gaugeValid = value.parentElement === visual;
        }
        return { title: title.textContent.trim(), value: value.textContent.trim(), cardTop: a.top,
          titleTop: t.top, hierarchy, withinCard, gaugeValid, hasGauge: !!gauge,
          duplicateValue: card.querySelectorAll('.kpi-card-value').length !== 1 };
      });
      const groups = [];
      for (const record of records) {
        const group = groups.find((row) => Math.abs(row[0].cardTop - record.cardTop) <= 2);
        if (group) group.push(record); else groups.push([record]);
      }
      const aligned = groups.every((row) => row.every((record) => Math.abs(record.titleTop - row[0].titleTop) <= 1));
      return { count: cards.length, records, aligned, gaugeCount: records.filter((r) => r.hasGauge).length };
    });
    if (result.count !== 6 || !result.aligned || result.gaugeCount !== 2 || result.records.some((r) => !r.hierarchy || !r.withinCard || !r.gaugeValid || r.duplicateValue)) {
      throw new Error(`${width}px KPI hierarchy failure: ${JSON.stringify(result)}`);
    }
    console.log(`✓ ${width}px: title → visual/number → context → action; two visible score gauges`);
  }
} finally {
  await browser.close();
}
