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
const project={id:'pa',code:'VCAP2',name:'Vanuatu Coastal Adaptation Project',acronym:'VCAP2',has_results_framework:true,status:'active',description:'Coastal resilience',budget_vuv:1200000,currency:'VUV',project_manager:'Old manager',provinces:['Sanma'],islands:['Santo'],communities:['Wusi'],lead_agency:'DoCC'};
try {
 for(const role of ['system_admin','viewer']) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({token,now})=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}}));},{token,now});
  let writes=[],failSave=false;
  await context.route(`${HOST}/**`,async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(path.endsWith('/rpc/current_profile'))return json([{id:'u1',email:'test@example.com',full_name:'Test officer',role}]);
   if(path.endsWith('/rpc/upsert_project')){if(failSave)return json({message:'Save temporarily unavailable'},500);const args=req.postDataJSON();writes.push(args);project.project_manager=args.p_project_manager;return json('pa');}
   if(path==='/auth/v1/user')return json({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
   if(path.startsWith('/rest/v1/')){const rel=path.split('/').pop();return json(rel==='v_projects'?[project]:fixture[rel]||[]);}
   return json([]);
  });
  const page=await context.newPage();
  await page.goto('http://localhost:5199/#/project-setup');
  await page.getByRole('heading',{name:'Find your project',exact:true}).waitFor({timeout:20000});
  await page.getByRole('searchbox').fill('VCAP2');
  await page.getByRole('button',{name:/Vanuatu Coastal Adaptation Project/}).click();
  assert.equal(await page.getByRole('button',{name:'Edit project manager',exact:true}).count(),role==='system_admin'?1:0);
  if(role==='viewer'){assert.equal(writes.length,0);await context.close();continue;}
  await page.getByRole('button',{name:'Edit project manager',exact:true}).click();
  await page.getByLabel('Project manager',{exact:false}).fill('New manager');
  assert.equal(await page.getByLabel('Approved budget (Vanuatu vatu)',{exact:false}).count(),0);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Edit project manager',exact:true}).waitFor();
  assert.equal(writes.length,1);assert.equal(writes[0].p_project_manager,'New manager');assert.equal(writes[0].p_budget_vuv,1200000);assert.deepEqual(writes[0].p_islands,['Santo']);
  await page.getByRole('status').filter({hasText:'Your changes have been saved.'}).first().waitFor();
  await page.getByRole('button',{name:'Edit project manager',exact:true}).click();
  await page.getByLabel('Project manager',{exact:false}).fill('Do not save');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(writes.length,1);
  await page.getByRole('button',{name:'Edit project manager',exact:true}).click();
  await page.getByLabel('Project manager',{exact:false}).fill('Retry manager');failSave=true;
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Your changes were not saved.'}).waitFor();
  assert.equal(await page.getByLabel('Project manager',{exact:false}).evaluate(el=>el.value),'Retry manager');
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isEnabled(),true);
  await context.close();
 }
 console.log('PASS Phone project search, section editing, preserved data, cancel, failed save and read-only access');
}finally{await browser.close();}
