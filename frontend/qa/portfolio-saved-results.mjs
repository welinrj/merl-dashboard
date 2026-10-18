// Saved indicator figures remain visible without changing their review status.
// All authentication and writes are mocked; no real project data is edited.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('qa-artifacts',{recursive:true});
const HOST='https://ndntvncboeajanipafeq.supabase.co';
const now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const projects=[{id:'pa',code:'VCAP2',name:'Selected coastal project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,provinces:['SANMA'],islands:['Espiritu Santo','Epi'],area_councils:[],communities:[]},{id:'pb',code:'OTHER',name:'Other project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:900,provinces:[]}];
const rows={v_projects:projects,v_financial_progress:[{id:'fa',project_id:'pa',approved_budget:100,cumulative_expenditure:40,reporting_period:'Q3 2026'},{id:'fb',project_id:'pb',approved_budget:900,cumulative_expenditure:600,reporting_period:'Q3 2026'}],v_reporting_periods:projects.map(p=>({id:'period-'+p.id,project_id:p.id,period_type:'quarterly',period_label:'Q3 2026',submission_status:'approved',period_end:'2026-09-30'})),v_project_indicators:[{id:'ia',project_id:'pa',code:'CI1',name:'Selected project indicator',target_value:10},{id:'ib',project_id:'pb',code:'OTHER-IND',name:'Other project indicator',target_value:999}]};
rows.v_indicator_progress=projects.map(p=>({id:'progress-'+p.id,project_id:p.id,indicator_id:p.id==='pa'?'ia':'ib',indicator_code:p.id==='pa'?'CI1':'OTHER-IND',indicator_name:p.id==='pa'?'Selected project indicator':'Other project indicator',reporting_period:'Q3 2026',cumulative_actual:p.id==='pa'?5:999,final_target:p.id==='pa'?10:999,date_reported:'2026-09-30',review_status:'approved'}));
rows.v_indicator_targets=[{id:'target-ia',indicator_id:'ia',target_type:'final',numeric_value:20,created_at:'2026-01-01'}];
rows.v_evidence=[{id:'ev-ia',project_id:'pa',indicator_id:'ia',code:'EV-1',title:'Coastal delivery monitoring',document_date:'2026-09-30',reporting_period:'Q3 2026',verification_status:'verified'}];
rows.v_evidence_analysis=[{id:'analysis-ia',project_id:'pa',indicator_id:'ia',evidence_id:'ev-ia',source_location:'Page 7',review_state:'accepted',reviewed_by_name:'Review officer',created_at:'2026-10-01'}];
rows.v_indicator_progress[0].achievement_pct=125;
rows.v_indicator_progress[0].final_target=20;
rows.v_indicator_progress.push({id:'previous-ia',project_id:'pa',indicator_id:'ia',reporting_period:'Q2 2026',cumulative_actual:2,date_reported:'2026-06-30',review_status:'approved'});
rows.v_reporting_periods.push({id:'prev-period-pa',project_id:'pa',period_type:'quarterly',period_label:'Q2 2026',submission_status:'approved',period_end:'2026-06-30'});

const values=[1234.56,2345.67,45.678,890.12,0,null];
for(let n=0;n<values.length;n++){
 const id='draft-'+n;
 rows.v_project_indicators.push({id,project_id:'pa',code:'VCAP-'+n,name:'VCAP saved indicator '+n,unit:'hectares',target_value:10000});
 rows.v_indicator_progress.push({id:'result-'+n,project_id:'pa',indicator_id:id,reporting_period:'Q3 2026',date_reported:'2026-09-30',review_status:'draft',cumulative_actual:values[n],narrative:'Saved source note for indicator '+n});
}
rows.v_dashboard_kpi_config=rows.v_project_indicators.filter(i=>i.project_id==='pa').map((i,n)=>({id:'cfg-'+i.id,project_id:'pa',indicator_id:i.id,dashboard_scope:'project',short_label:i.name,display_order:n,show_target:true,show_progress:true,active:true,is_public:false}));
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
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5199/#/analytics/project-portfolio?project=pa');
 await page.locator('.ppa-indicator-result').first().waitFor({timeout:20000});
 assert.equal(await page.locator('.ppa-indicator-result').count(),7);
 for(const [n,value] of values.entries()){
  const card=page.locator('.ppa-indicator-result').filter({hasText:'VCAP saved indicator '+n});
  assert.match(await card.innerText(),/Awaiting review/);
  assert.match(await card.innerText(),/Q3 2026/);
  if(value==null)assert.match(await card.innerText(),/No numeric result recorded/);
  else assert.ok((await card.innerText()).includes(value.toLocaleString('en-US')));
  assert.doesNotMatch(await card.innerText(),/Not reported/);
 }
 assert.doesNotMatch(await page.locator('.ppa-indicator-result').filter({hasText:'Selected project indicator'}).innerText(),/Awaiting review/);
 for(const width of [360,390,1440]){
  await page.setViewportSize({width,height:1000});
  await page.getByText('Project indicator results',{exact:true}).scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`qa-artifacts/header-portfolio-results-${width}.png`});
 }
 const first=page.locator('.ppa-indicator-result').filter({hasText:'VCAP saved indicator 1'});
 await first.click();
 const panel=page.getByRole('dialog',{name:'VCAP saved indicator 1',exact:true});
 await panel.getByText('Saved source note for indicator 1',{exact:true}).waitFor();
 assert.match(await panel.innerText(),/2,345.67/);
 assert.match(await panel.innerText(),/Awaiting review/);
 await panel.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('#ppa-project').selectOption('pb');
 await page.getByRole('link',{name:'Generate project reports',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#ppa-project')?.value==='pb'&&!document.querySelector('.ppa-indicator-result'));
 assert.equal(await page.getByText('2,345.67 hectares',{exact:true}).count(),0);
 await page.locator('#ppa-project').selectOption('pa');
 await page.locator('.ppa-indicator-result').first().waitFor();
 await page.locator('.dsh-lang button[lang=fr]').click();
 await page.getByText('Résultats des indicateurs du projet',{exact:true}).waitFor();
 assert.equal(await page.locator('.ppa-indicator-result').getByText('En attente de vérification',{exact:true}).count(),6);
 assert.deepEqual(errors,[]);
 console.log('PASS Saved VCAP2 figures, draft labels, zero/missing values, source notes, review-state isolation, project switching, EN/FR and phone/desktop layout');
}finally{await browser.close();}
