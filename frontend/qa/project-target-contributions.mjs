import { openOverviewDetails } from './overview-details.mjs';
// Regression for the user-approved 21st.dev hierarchy: title, chart with its
// value inside, context, and destination. No production data is modified.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq';
const HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json', 'utf8'));
const spec=[['23A398','VCAP2',23,5,19],['VCCRP-001','VCCRP',31,2,28],['24B298','L&D',29,5,25],['CBIT-VU','CBIT',24,4,14],['NAPS','NAPs',192,0,0],['BOLD','BOLD',2,0,0]];
fixture.v_projects=spec.map(([code,acronym])=>({id:code,code,acronym,name:acronym+' project',status:'active',has_results_framework:true,provinces:[acronym==='VCAP2'?'SANMA':'TORBA']}));
fixture.v_project_indicators=spec.flatMap(([code,_,total])=>Array.from({length:total},(_,n)=>({id:code+'-'+n,project_id:code,code:code+'-'+n,name:'Target '+n,target_value:100})));
fixture.v_indicator_progress=spec.flatMap(([code,_,total,achieved,reported])=>Array.from({length:reported},(_,n)=>({id:code+'-update-'+n,project_id:code,indicator_id:code+'-'+n,cumulative_actual:n<achieved?100:0,achievement_pct:n<achieved?100:0,review_status:'approved',reporting_period:'Q4 2026',period_end:'2026-12-31'})));
fixture.v_reporting_periods=spec.map(([code])=>({project_id:code,period_label:'Q4 2026',period_end:'2026-12-31',submission_status:'approved'}));
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
try {
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1920,1366,390,320]) {
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5199/#/dashboards',{waitUntil:'domcontentloaded'});
  const chart=page.locator('.target-contributions');await chart.waitFor();
  await chart.getByText('Share of the 16 achieved targets',{exact:true}).waitFor();
  await chart.locator('.recharts-pie-sector').first().waitFor();
  if(await chart.locator('.recharts-pie-sector').count()!==4)throw Error('Expected one pie segment per contributing project');
  const vcap=chart.locator('[data-project-code="23A398"]'),vccrp=chart.locator('[data-project-code="VCCRP-001"]');
  if(!(await vcap.innerText()).includes('31.25%')||!(await vcap.innerText()).includes('1.66 points overall'))throw Error('VCAP contribution denominator is wrong');
  if(!(await vccrp.innerText()).includes('12.5%'))throw Error('VCCRP contribution denominator is wrong');
  if(await chart.locator('.target-contributions-others[open]').count())throw Error('Unassessed projects must stay collapsed');
  if(!await chart.evaluate(el=>el.scrollWidth<=el.clientWidth+1))throw Error(width+'px chart overflow');
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error(width+'px page overflow');
  await chart.screenshot({animations:'disabled',path:`qa-artifacts/target-contributions-${width}.png`});
 }
 await page.locator('.dashboard-filters-toggle').click();
 await page.getByLabel('Province',{exact:true}).selectOption('SANMA');
 await page.locator('.target-contributions').getByText('Share of the 5 achieved targets',{exact:true}).waitFor();
 if(await page.locator('.target-contributions .recharts-pie-sector').count()!==1||!(await page.locator('.target-contributions-legend').innerText()).includes('100%'))throw Error('Contribution must follow selected projects');
 await page.locator('.dsh-lang button[lang=fr]').click();
 await page.getByRole('heading',{name:'Contribution par projet',exact:true}).waitFor();
 await page.locator('.target-contributions').getByText('Part des 5 cibles atteintes',{exact:true}).waitFor();
 fixture.v_indicator_progress=[];await page.reload();
 await page.locator('.target-contributions-empty').waitFor();
 if(await page.locator('.target-contributions .recharts-pie-sector').count())throw Error('No fictitious pie for missing achievements');
 if(errors.length)throw Error(errors.join('; '));
 console.log('PASS contribution shares, overall points, selected scope, zero/missing results, French and 320/390/1366/1920px layouts');
} finally {await browser.close();}
