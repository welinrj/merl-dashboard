// Isolated role and reporting fixtures. Every auth/data/write request is intercepted.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const HOST='https://ndntvncboeajanipafeq.supabase.co', now=Math.floor(Date.now()/1000), b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
mkdirSync('qa-artifacts',{recursive:true});
let currentPage;
try {
 for(const role of ['project_manager','docc_me_officer','viewer']) {
  const writes=[],errors=[];
  let unknownCounts=false;
  const project={id:'pa',code:'COAST',name:'Coastal adaptation project',has_results_framework:true,status:'active',currency:'VUV',budget_vuv:100};
  const period={id:'rp1',project_id:'pa',period_label:'Q3 2026',period_start:'2026-07-01',period_end:'2026-09-30',submission_status:role==='docc_me_officer'?'submitted':'returned',review_comments:'Explain the spending change.'};
  const rows={v_projects:[project],v_reporting_periods:[period],v_project_indicators:[{id:'ia',project_id:'pa',code:'I1',name:'Households protected',target_value:10}],v_indicator_progress:[{id:'i1',project_id:'pa',indicator_id:'ia',reporting_period:'Q3 2026',cumulative_actual:5}],v_learning_updates:[{id:'l1',project_id:'pa',reporting_period:'Q3 2026',key_achievements:'Community work completed'}],v_financial_progress:[]};
  const context=await browser.newContext({viewport:{width:360,height:900}});
  await context.addInitScript(({token,now})=>{
   localStorage.setItem('merl.lang','en');
   localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));
   if (!localStorage.getItem('qa.draft-seeded')) {
    localStorage.setItem('merl.draft.v1:merl|u1|pa|Q3 2026|financial_progress|new',JSON.stringify({savedAt:Date.now(),values:{cumulative_expenditure:'25'}}));
    localStorage.setItem('qa.draft-seeded','true');
   }
  },{token,now});
  await context.route(`${HOST}/**`,async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',full_name:'Test officer',role}]);
   if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
   if(path.endsWith('/rpc/upsert_financial_progress')){const data=req.postDataJSON();writes.push({rpc:'save',data});rows.v_financial_progress=[{id:'f1',project_id:data.p_project_id,reporting_period:data.p_reporting_period,cumulative_expenditure:data.p_cumulative_expenditure}];return json('f1');}
   if(path.endsWith('/rpc/submit_reporting_period')){writes.push({rpc:'submit',data:req.postDataJSON()});period.submission_status='submitted';return json({});}
   if(path.includes('/rpc/') && req.method()==='POST')return json([]);
   if(path.startsWith('/rest/v1/')){
    let body=rows[path.split('/').pop()]||[];
    for(const [key,value]of url.searchParams)if(value.startsWith('eq.'))body=body.filter(row=>String(row[key])===value.slice(3));
    if(req.method()==='HEAD')return route.fulfill({status:200,headers:unknownCounts?{}:{'content-range':`*/${body.length}`,'access-control-expose-headers':'content-range'},body:''});
    return json((req.headers().accept||'').includes('vnd.pgrst.object')?body[0]||null:body);
   }
   return json([]);
  });
  await context.route('https://services.arcgis.com/**',route=>route.abort());
  const page=await context.newPage();currentPage=page;page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:5199/#/dashboards');
  await page.locator('.ovx-kpis').waitFor({timeout:20000});
  if(role==='viewer')assert.equal(await page.locator('.my-tasks').count(),0);
  else {
   const tasks=page.locator('.my-tasks');await tasks.waitFor();
   assert.match(await tasks.innerText(),/Coastal adaptation project/);
   for(const width of [360,1440,1920]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await tasks.screenshot({path:`qa-artifacts/header-tasks-${role}-${width}.png`});}
   await page.setViewportSize({width:360,height:900});
   if(role==='docc_me_officer'){
    const link=tasks.getByRole('link',{name:'Review report',exact:true});
    assert.match(await link.getAttribute('href'),/submission=rp1/);await link.click();
    const dialog=page.getByRole('dialog',{name:'Reporting period detail',exact:true});await dialog.waitFor();
    assert.match(await dialog.innerText(),/Coastal adaptation project/);assert.match(await dialog.innerText(),/Q3 2026/);assert.equal(writes.length,0);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.doesNotMatch(page.url(),/submission=/);
   } else {
    assert.match(await tasks.innerText(),/Explain the spending change/);
    await tasks.getByRole('link',{name:'Make corrections',exact:true}).click();
    const checklist=page.locator('.reporting-checklist');await checklist.getByText('Required sections saved: 2 of 3',{exact:true}).waitFor();
    assert.match(page.url(),/project=pa/);assert.match(page.url(),/period=Q3/);
    const spending=checklist.locator('li').filter({has:page.getByText('Spending',{exact:true})});
    assert.match(await spending.innerText(),/Not saved yet/);assert.match(await spending.innerText(),/Draft on this device/);
    assert.equal(await checklist.getByRole('button',{name:'Submit',exact:true}).count(),0);
    await checklist.getByRole('button',{name:'Continue with Spending',exact:true}).click();
    assert.match(page.url(),/module=financial_progress/);
    assert.equal(await page.locator('#reporting-records').evaluate(el=>el===document.activeElement),true);
    await page.getByRole('button',{name:'Add',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel(/Cumulative Expenditure/i).fill('25');
    await dialog.getByRole('button',{name:'Add record',exact:true}).click();await dialog.waitFor({state:'hidden'});
    await checklist.getByText('Required sections saved: 3 of 3',{exact:true}).waitFor();
    assert.equal(writes[0].data.p_project_id,'pa');assert.equal(writes[0].data.p_reporting_period,'Q3 2026');
    assert.equal(await checklist.getByText('Draft on this device',{exact:true}).count(),0);
    for(const width of [360,1440,1920]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await checklist.screenshot({path:`qa-artifacts/header-checklist-${width}.png`});}
    await page.setViewportSize({width:360,height:900});
    await page.locator('.dsh-lang button[lang=fr]').click();await checklist.getByRole('heading',{name:'Préparer votre rapport',exact:true}).waitFor();
    assert.doesNotMatch(await checklist.innerText(),/tasks\./);await checklist.screenshot({path:'qa-artifacts/header-checklist-fr-360.png'});
    await page.locator('.dsh-lang button[lang=en]').click();
    unknownCounts=true;await page.reload();await checklist.getByRole('button',{name:'Check again',exact:true}).waitFor();
    assert.equal(await checklist.getByRole('button',{name:'Submit',exact:true}).count(),0);
    unknownCounts=false;await checklist.getByRole('button',{name:'Check again',exact:true}).click();
    await checklist.getByRole('button',{name:'Submit',exact:true}).click();
    await checklist.getByText('This report has been sent and is waiting for review.',{exact:true}).waitFor();
    assert.equal(writes.filter(w=>w.rpc==='submit').length,1);assert.equal(writes.at(-1).data.p_id,'rp1');
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: role-based tasks, exact project/period/review links, saved versus device drafts, guided saving and submission, unknown-count retry, French, 360/1440/1920 widths');
} catch(error){if(currentPage)await currentPage.screenshot({path:'qa-artifacts/header-checklist-failure.png'});throw error;} finally{await browser.close();}
