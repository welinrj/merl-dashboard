// Account visibility is mocked here; actual RLS is independently checked against live roles.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const now = Math.floor(Date.now()/1000), b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const project = {id:'pa',code:'VCAP2',name:'Coastal adaptation',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,spent_vuv:90,provinces:[]};
const periods = [{project_id:'pa',period_label:'Q2 2026',period_type:'quarterly',period_end:'2026-06-30',submission_status:'draft'},
  {project_id:'pa',period_label:'Q3 2026',period_type:'quarterly',period_end:'2026-09-30',submission_status:'approved'}];
const rows = {v_projects:[project],v_reporting_periods:periods,
  v_financial_progress:[{project_id:'pa',approved_budget:100,cumulative_expenditure:90,reporting_period:'Q3 2026'}],
  v_project_indicators:[{id:'ia',project_id:'pa',code:'CI1',name:'Households protected',target_value:10}],
  v_indicator_progress:[{id:'new',project_id:'pa',indicator_id:'ia',reporting_period:'Q3 2026',cumulative_actual:9,date_reported:'2026-09-30'}]};
try {
 for (const role of ['system_admin','project_manager']) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({token,now}) => { localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}})); }, {token,now});
  await context.route(`${HOST}/**`, async route => {
   const req=route.request(),url=new URL(req.url()),path=url.pathname;
   const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(path.endsWith('/rpc/current_profile')) return json([{id:'u1',email:'test@example.com',full_name:'Test account',role}]);
   if(path==='/auth/v1/user') return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
   if(path.startsWith('/rest/v1/')) { let body=role==='system_admin' ? rows[path.split('/').pop()] || [] : [];
    for(const [key,value] of url.searchParams) if(value.startsWith('eq.')) body=body.filter(row=>String(row[key])===value.slice(3));
    return json((req.headers().accept||'').includes('vnd.pgrst.object') ? body[0] || null : body); }
   return json([]);
  });
  const page=await context.newPage();
  await page.goto('http://localhost:5199/#/dashboards');
  const account=page.locator('.wc-context');
  await account.getByText('Test account',{exact:true}).waitFor({timeout:20000});
  await account.getByText(role==='system_admin' ? '1 project with a results framework available' : '0 projects with results frameworks available',{exact:true}).waitFor();
  if(role==='project_manager') {
   assert.match(await account.innerText(),/Project Manager/);
   assert.match(await account.innerText(),/check your assignments/);
   await account.locator('summary').click();
   assert.equal(await account.locator('option').count(),1);
  } else {
   await account.locator('summary').click();
   await page.locator('#workspace-period').selectOption('Q2 2026');
   await page.waitForURL(url=>url.hash.includes('period=Q2'));
   await account.locator('summary').click();
   await page.locator('.dsh-mobile-nav').getByRole('link',{name:'Results',exact:true}).click();
   await page.getByRole('heading',{name:'Results Framework',exact:true}).waitFor();
   assert.match(await account.locator('summary').innerText(),/Q2 2026/);
   await page.locator('.rf2-tools select').selectOption('pa');
   await page.waitForURL(url=>url.hash.includes('project=pa'));
   await account.locator('summary').click();
   await page.locator('#workspace-period').selectOption('Q3 2026');
   await page.waitForURL(url=>url.hash.includes('period=Q3') && url.hash.includes('project=pa'));
   await page.reload();
   await page.getByRole('heading',{name:'Results Framework',exact:true}).waitFor();
   assert.equal(await page.locator('.rf2-tools select').inputValue(),'pa');
   await page.locator('.wc-period summary').click();
   await page.locator('#workspace-period').selectOption('Q2 2026');
   await page.waitForURL(url=>url.hash.includes('period=Q2'));
   await page.locator('.wc-period summary').click();
   await page.locator('.dsh-mobile-nav').getByRole('link',{name:'Reports',exact:true}).click();
   await page.locator('#report-preview').waitFor();
   assert.match(await account.locator('summary').innerText(),/Q2 2026/);
   await page.getByRole('combobox').first().selectOption('financial');
   const report=await page.locator('#report-preview').innerText();
   assert.doesNotMatch(report,/\b90\b/); // Newer expenditure must never replace a missing period.
   await page.reload();
   await page.locator('#report-preview').waitFor();
   assert.match(await page.locator('.wc-period summary').innerText(),/Q2 2026/);
   await page.locator('.wc-period summary').click();
   await page.locator('#workspace-period').selectOption('');
   await page.waitForURL(url=>new URLSearchParams(url.hash.split('?')[1]).get('period')==='');
   await page.goBack();
   await page.waitForURL(url=>url.hash.includes('period=Q2'));
   await page.locator('.wc-period summary').filter({hasText:'Q2 2026'}).waitFor();
   assert.match(await page.locator('.wc-period summary').innerText(),/Q2 2026/);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
  await context.close();
 }
 console.log('PASS: account context, scoped period persistence, missing finance, browser Back and mobile width');
} finally { await browser.close(); }
