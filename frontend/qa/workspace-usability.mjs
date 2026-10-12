// Check the guided reporting flow and review cards on a phone.
// All authentication and writes are mocked; no real project data is edited.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE,'utf8'));
const HOST='https://ndntvncboeajanipafeq.supabase.co';
const now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const project={id:'pa',code:'VCAP2',name:'Vanuatu Coastal Adaptation Project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,provinces:[]};
const periods=[{id:'period1',project_id:'pa',period_label:'Q3 2026',period_end:'2026-09-30',submission_status:'returned',review_comments:'Add explanation'}, {id:'future',project_id:'pa',period_label:'Q1 2027',period_end:'2027-03-31',submission_status:'draft'}];
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({token,now})=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));},{token,now});
 let saved;
 await context.route(`${HOST}/**`,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',email:'test@example.com',full_name:'Test officer',role:'system_admin'}]);
  if(path.endsWith('/rpc/upsert_financial_progress')){saved=req.postDataJSON();return json('fin1');}
  if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
  if(path.startsWith('/rest/v1/')){const rel=path.split('/').pop();return json(rel==='v_projects'?[project]:rel==='v_reporting_periods'?periods:rel==='v_financial_progress'?[{id:'fin1',project_id:'pa',reporting_period:'Q3 2026',approved_budget:100,annual_budget:55,cumulative_expenditure:25}]:[]);}
  return json([]);
 });
 await context.route('https://services.arcgis.com/**',r=>r.abort());
 const page=await context.newPage();
 await page.goto('http://localhost:5199/#/dashboards');
 await page.getByRole('navigation',{name:'Start here'}).waitFor({timeout:20000});
 await page.getByText('How to use this page',{exact:true}).click();
 assert.equal(await page.locator('.wg-guide li').count(),3);
 await page.getByText('Reports needing attention (1)',{exact:true}).waitFor();
 await page.getByText('Reports needing attention (1)',{exact:true}).click();
 await page.getByRole('link',{name:'Continue report',exact:true}).click();
 await page.locator('.mr-tabs').waitFor({timeout:15000});
 await page.getByRole('button',{name:/Financial Progress/i}).last().click();
 await page.locator('.mr-cards').getByRole('button',{name:'Edit',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.waitFor();
 assert.equal(await dialog.getByLabel(/Annual Budget/i).isVisible(),false);
 await dialog.getByLabel(/Cumulative Expenditure/i).fill('75');
 await dialog.getByRole('button',{name:/Save changes/i}).click();
 await dialog.waitFor({state:'hidden'});
 assert.equal(saved.p_reporting_period,'Q3 2026');assert.equal(saved.p_annual_budget,55);assert.equal(saved.p_cumulative_expenditure,75);
 await page.goto('http://localhost:5199/#/review');
 await page.locator('.ux-table-cards .ux-table-card').first().waitFor();
 assert.equal(await page.locator('.ux-table-desktop').isVisible(),false);
 assert.equal(await page.locator('.ux-table-cards').isVisible(),true);
 console.log('PASS Starting actions, three-step guides, scoped reminders, period deep link, optional field preservation and phone review cards');
}finally{await browser.close();}
