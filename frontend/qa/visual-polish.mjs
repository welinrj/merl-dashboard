// Regression for the user-approved 21st.dev hierarchy: title, chart with its
// value inside, context, and destination. No production data is modified.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';

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

mkdirSync('qa-artifacts',{recursive:true});
let page;
try {
  page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const fits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal body overflow');
  await page.setViewportSize({width:360,height:900});
  await page.goto('http://localhost:5199/#/dashboards');
  await page.locator('.ovx-kpis .ovx-kpi').first().waitFor({timeout:20000});
  await page.locator('.dsh-lang button[lang=fr]').click();
  await page.waitForFunction(()=>document.documentElement.lang==='fr');
  await fits();
  const textFits=await page.locator('.ovx-kpi').evaluateAll(cards=>cards.every(card=>{
    const bounds=card.getBoundingClientRect();
    return [...card.querySelectorAll('.kpi-card-label,.kpi-card-sub,.kpi-card-link')].every(element=>{
      const box=element.getBoundingClientRect();
      return box.width>0 && box.left>=bounds.left && box.right<=bounds.right+1 && element.scrollHeight<=element.clientHeight+1;
    });
  }));
  assert.ok(textFits,'French card labels and actions are fully visible');
  await page.locator('.ovx-kpi').first().screenshot({animations:'disabled',path:'qa-artifacts/header-visual-kpis-fr-360.png'});
  await page.locator('.ovx-kpi-progress').screenshot({animations:'disabled',path:'qa-artifacts/header-visual-progress-fr-360.png'});
  await page.locator('.dsh-lang button[lang=en]').click();
  await page.goto('http://localhost:5199/#/review');
  await page.locator('.merl-status-badge:visible').first().waitFor();
  for(const badge of await page.locator('.merl-status-badge:visible').all()){
    assert.ok((await badge.innerText()).trim().length>0);assert.equal(await badge.locator('svg[aria-hidden=true]').count(),1);
  }
  await fits();await page.screenshot({animations:'disabled',path:'qa-artifacts/header-visual-review-360.png'});
  await page.goto('http://localhost:5199/#/project-setup');
  await page.getByRole('heading',{name:'Find your project',exact:true}).waitFor();
  await page.getByRole('button',{name:/Community Coastal Resilience/}).click();
  await page.getByRole('button',{name:'Edit project manager',exact:true}).click();
  const input=page.getByLabel('Project manager',{exact:false});await input.waitFor();
  assert.ok(await input.evaluate(element=>parseFloat(getComputedStyle(element).fontSize)>=16),'Phone inputs avoid small type');
  await input.focus();
  assert.ok(await input.evaluate(element=>getComputedStyle(element).outlineStyle!=='none'),'Keyboard focus remains visible');
  for(const width of [360,1440,1920]){
    await page.setViewportSize({width,height:900});await fits();
    await input.scrollIntoViewIfNeeded();
    await page.screenshot({animations:'disabled',path:`qa-artifacts/header-visual-form-${width}.png`});
  }
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.goto('http://localhost:5199/#/reports');
  await page.locator('#report-preview').waitFor();
  await page.getByRole('button',{name:'View full report',exact:true}).click();
  for(const width of [360,1440]){
    await page.setViewportSize({width,height:900});await fits();
    await page.locator('#report-preview').scrollIntoViewIfNeeded();
    await page.screenshot({animations:'disabled',path:`qa-artifacts/header-visual-report-${width}.png`});
    await page.locator('.rp-t').first().screenshot({animations:'disabled',path:`qa-artifacts/header-visual-report-table-${width}.png`});
  }
  assert.ok(await page.locator('.rp-t').count()>0,'Report tables remain visible');
  await page.getByRole('button',{name:'Show report cover',exact:true}).click();
  await page.locator('.island-report-cover').screenshot({animations:'disabled',path:'qa-artifacts/header-visual-report-cover.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: French card text, status symbols with labels, phone inputs and focus, forms and report tables at phone/desktop widths');
}catch(error){if(page)await page.screenshot({animations:'disabled',path:'qa-artifacts/header-visual-failure.png'});throw error;}finally{await browser.close();}
