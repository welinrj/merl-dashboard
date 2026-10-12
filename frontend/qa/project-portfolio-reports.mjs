// A new officer should be able to find a project and change its manager on a phone.
// All authentication and writes are mocked; no real project data is edited.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE,'utf8'));
const HOST='https://ndntvncboeajanipafeq.supabase.co';
const now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const projects=[{id:'pa',code:'VCAP2',name:'Selected coastal project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,provinces:[]},{id:'pb',code:'OTHER',name:'Other project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:900,provinces:[]}];
const rows={v_projects:projects,v_financial_progress:[{id:'fa',project_id:'pa',approved_budget:100,cumulative_expenditure:40,reporting_period:'Q3 2026'},{id:'fb',project_id:'pb',approved_budget:900,cumulative_expenditure:600,reporting_period:'Q3 2026'}],v_reporting_periods:projects.map(p=>({id:'period-'+p.id,project_id:p.id,period_type:'quarterly',period_label:'Q3 2026',submission_status:'approved',period_end:'2026-09-30'})),v_project_indicators:[{id:'ia',project_id:'pa',code:'CI1',name:'Selected project indicator',target_value:10},{id:'ib',project_id:'pb',code:'OTHER-IND',name:'Other project indicator',target_value:999}]};
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({token,now})=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));},{token,now});
 await context.route(`${HOST}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',email:'test@example.com',full_name:'Test officer',role:'system_admin'}]);
  if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
  if(path.startsWith('/rest/v1/')){let body=rows[path.split('/').pop()]||[];for(const [key,value] of url.searchParams)if(value.startsWith('eq.'))body=body.filter(row=>String(row[key])===value.slice(3));return json((req.headers().accept||'').includes('vnd.pgrst.object')?body[0]||null:body);}
  return json([]);
 });
 const page=await context.newPage();
 await page.goto('http://localhost:5199/#/project-setup');
 await page.getByRole('heading',{name:'Find your project',exact:true}).waitFor({timeout:20000});
 await page.getByRole('button',{name:/Selected coastal project/}).click();
 await page.getByRole('link',{name:'View project portfolio & reports',exact:true}).click();
 await page.getByRole('link',{name:'Generate project reports',exact:true}).waitFor({timeout:20000});
 assert.equal(await page.locator('.dsh-nav').getByRole('link',{name:'Project portfolio',exact:true}).count(),1);
 await page.getByRole('link',{name:'Generate project reports',exact:true}).click();
 await page.locator('#report-preview').waitFor({timeout:20000});
 await page.getByRole('combobox').first().selectOption('financial');
 assert.equal(await page.getByLabel('Project to include',{exact:true}).inputValue(),'pa');
 let report=await page.locator('#report-preview').innerText();assert.match(report,/Selected coastal project/);assert.doesNotMatch(report,/Other project/);assert.doesNotMatch(report,/900/);
 await page.getByRole('combobox').first().selectOption('indicator');
 report=await page.locator('#report-preview').innerText();assert.match(report,/Selected project indicator/);assert.doesNotMatch(report,/Other project indicator/);
 console.log('PASS Phone project portfolio entry and multiple report types retain project scope');
}finally{await browser.close();}
