import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
const HOST='https://ndntvncboeajanipafeq.supabase.co',now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const projects=[{id:'pa',code:'VCAP2',name:'Coastal project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,spent_vuv:90,provinces:['SANMA']}, {id:'pb',code:'OTHER',name:'Other project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100,provinces:[]}];
const rows={v_projects:projects,v_reporting_periods:[{project_id:'pa',period_label:'Q2 2026',period_end:'2026-06-30',period_type:'quarterly',submission_status:'approved'}, {project_id:'pa',period_label:'Q3 2026',period_end:'2026-09-30',period_type:'quarterly',submission_status:'approved'}, {project_id:'pb',period_label:'Q3 2026',period_end:'2026-09-30',period_type:'quarterly',submission_status:'draft'}],
 v_project_indicators:[{id:'ia',project_id:'pa',code:'CI1',name:'Households protected',target_value:10}],
 v_indicator_progress:[{id:'q3',project_id:'pa',indicator_id:'ia',reporting_period:'Q3 2026',cumulative_actual:0,achievement_pct:0,review_status:'approved'}],
 v_financial_progress:[{project_id:'pa',approved_budget:100,cumulative_expenditure:90,reporting_period:'Q2 2026'}],
 v_beneficiaries:[{project_id:'pa',total_direct:30,female:15,male:15,reporting_period:'Q2 2026',double_counting_check:false},{project_id:'pa',total_direct:20,female:10,male:10,reporting_period:'Q3 2026',double_counting_check:false}]};
try {
 let profileRole='system_admin';
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({token,now})=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));},{token,now});
 await context.route(`${HOST}/**`,async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',full_name:'Test officer',role:profileRole}]);
  if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
  if(path.startsWith('/rest/v1/')){let body=rows[path.split('/').pop()]||[];for(const [key,value]of url.searchParams)if(value.startsWith('eq.'))body=body.filter(row=>String(row[key])===value.slice(3));return json((req.headers().accept||'').includes('vnd.pgrst.object')?body[0]||null:body);}
  return json([]);
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:5199/#/dashboards');
 await page.locator('.ovx-kpis .ovx-kpi').first().waitFor({timeout:20000});
 await page.locator('.wc-period summary').click();await page.locator('#workspace-period').selectOption('Q3 2026');
 await page.locator('.ovx-kpi-beneficiaries .kpi-card-value').filter({hasText:/^20$/}).waitFor();
 await page.locator('.wc-period summary').click();
 const explain=page.getByRole('button',{name:'Explain: Overall Progress',exact:true});await explain.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/equal project weights/);assert.match(await dialog.innerText(),/Q3 2026/);assert.match(await dialog.innerText(),/Approved/);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await explain.evaluate(el=>el===document.activeElement),true);
 await page.getByRole('button',{name:'Explain: Beneficiaries Reached',exact:true}).click();await dialog.waitFor();
 assert.match(await dialog.innerText(),/largest reported total/);assert.equal(await dialog.locator('dd').first().innerText(),'20');
 for(const width of [360,1440,1920]) {await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await dialog.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));}
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.ovx-kpi-budget').getByRole('button',{name:'View reports',exact:true}).click();
 await page.locator('.report-readiness').waitFor();await page.getByRole('combobox').first().selectOption('financial');
 await page.getByLabel('Project to include',{exact:true}).selectOption('pa');
 await page.locator('.report-readiness details summary').click();
 assert.match(await page.locator('.report-readiness').innerText(),/No financial record with reported expenditure/);assert.doesNotMatch(await page.locator('.report-readiness').innerText(),/Other project/);
 assert.doesNotMatch(await page.locator('#report-preview').innerText(),/\b90\b/);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download Word',exact:true}).click();
 const download=await downloadPromise,zip=await JSZip.loadAsync(readFileSync(await download.path()));
 const xml=await zip.file('word/document.xml').async('string');assert.match(xml,/No financial record with reported expenditure/);
 rows.v_financial_progress.push({project_id:'pa',approved_budget:100,cumulative_expenditure:0,reporting_period:'Q3 2026'});
 await page.reload();await page.locator('#report-preview').waitFor();await page.getByRole('combobox').first().selectOption('financial');await page.getByLabel('Project to include',{exact:true}).selectOption('pa');
 await page.locator('.report-readiness').getByText('No gaps found by the automated checks',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Download Word',exact:true}).isEnabled(),true);
 profileRole='viewer';
 await page.goto('http://localhost:5199/#/dashboards?period=Q3+2026');await page.reload();
 await page.getByRole('button',{name:'Explain: Budget Utilisation',exact:true}).waitFor({timeout:20000});
 await page.getByRole('button',{name:'Explain: Budget Utilisation',exact:true}).click();await dialog.waitFor();
 assert.match(await dialog.getByRole('link',{name:'View source',exact:true}).first().getAttribute('href'),/^#\/analytics\/project-portfolio\?/);
 await dialog.getByRole('link',{name:'View source',exact:true}).first().click();
 await page.getByRole('heading',{name:'Project portfolio',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: figure explanation, Escape/focus, period-matched beneficiaries, phone/desktop widths, scoped readiness, Word qualifications and valid zero expenditure');
 await context.close();
} finally {await browser.close();}
