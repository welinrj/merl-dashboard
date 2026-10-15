import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const HOST='https://ndntvncboeajanipafeq.supabase.co',now=Math.floor(Date.now()/1000),b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
mkdirSync('qa-artifacts',{recursive:true});
const projects=[{id:'pa',code:'COAST',name:'Coastal project',has_results_framework:true,status:'active'}, {id:'pb',code:'NO-FRAMEWORK',name:'Unconfigured project',has_results_framework:false,status:'active'}];
const rows={v_projects:projects,v_reporting_periods:[{id:'period1',project_id:'pa',period_label:'Q2 2026',period_end:'2026-06-30',period_type:'quarterly',submission_status:'draft'}],v_project_indicators:[{id:'ia',project_id:'pa',code:'CI1',name:'Households protected',target_value:10}],v_user_project_assignments:[]};
let currentPage;
try {
 for(const role of ['docc_me_officer','project_manager','viewer']) {
  const writes=[],errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({token,now})=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));},{token,now});
  await context.route(`${HOST}/**`,async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',full_name:'Test officer',role}]);
   if(path.endsWith('/rpc/list_assignable_users'))return json([{id:'manager1',full_name:'Test manager',role:'project_manager'}]);
   if(path.endsWith('/rpc/assign_user_project')){writes.push(req.postDataJSON());return json({});}
   if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
   if(path.startsWith('/rest/v1/')){let body=rows[path.split('/').pop()]||[];for(const [key,value]of url.searchParams)if(value.startsWith('eq.'))body=body.filter(row=>String(row[key])===value.slice(3));return json((req.headers().accept||'').includes('vnd.pgrst.object')?body[0]||null:body);}
   return json([]);
  });
  const page=await context.newPage();currentPage=page;page.on('pageerror',error=>errors.push(error.message));
  if(role==='docc_me_officer'){
   await page.goto('http://localhost:5199/#/review');
   await page.getByRole('heading',{name:'Project assignments',exact:true}).waitFor();
   await page.getByLabel('Project manager',{exact:true}).selectOption('manager1');
   const manage=page.getByRole('button',{name:'Manage project assignments',exact:true});await manage.click();
   const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox').first().waitFor();
   const saved=page.waitForResponse(response=>response.url().endsWith('/rpc/assign_user_project') && response.request().method()==='POST');
   await dialog.getByRole('checkbox').first().click();await saved;await page.waitForFunction(()=>document.querySelector('dialog input[type=checkbox]')?.checked);assert.equal(writes.length,1);assert.equal(writes[0].p_user_id,'manager1');assert.equal(writes[0].p_project_id,'pa');
   for(const width of [360,1440,1920]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`qa-artifacts/role-assignments-${width}.png`});}
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await manage.evaluate(el=>el===document.activeElement),true);
   await page.goto('http://localhost:5199/#/merl-reporting?project=pa&period=Q1+2026&module=evidence');
   await page.getByRole('alert').filter({hasText:'Q1 2026 is not configured'}).waitFor();
   assert.equal(await page.locator('select.field-input').nth(1).inputValue(),'Q1 2026');
   assert.equal(await page.getByRole('button',{name:'Add',exact:true}).isEnabled(),false);
  }
  if(role==='project_manager'){
   await page.goto('http://localhost:5199/#/merl-reporting?project=pa&period=Q2+2026&module=evidence');
   await page.getByText('Evidence is saved as pending.',{exact:false}).waitFor();
   await page.getByRole('button',{name:'Add',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.getByLabel('Verification status',{exact:true}).count(),0);
   await page.keyboard.press('Escape');
  }
  if(role==='viewer'){
   await page.goto('http://localhost:5199/#/review');await page.locator('.ovx-kpis').waitFor();
   assert.equal(await page.getByRole('button',{name:'Manage project assignments',exact:true}).count(),0);
   await page.goto('http://localhost:5199/#/reports');await page.locator('#report-preview').waitFor();
   assert.equal(await page.getByLabel('Include completed project history').count(),0);
   assert.equal(await page.locator('option').filter({hasText:'Unconfigured project'}).count(),0);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: M&E assignment workflow, mobile/wide dialog and focus, missing-period guard, manager evidence verification and viewer report scope');
}catch(error){if(currentPage)await currentPage.screenshot({path:'qa-artifacts/role-assignments-failure.png'});throw error;}finally{await browser.close();}
