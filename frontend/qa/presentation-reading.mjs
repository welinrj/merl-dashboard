import { openOverviewDetails } from './overview-details.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync,mkdirSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('qa/fixture.json','utf8'));
fixture.v_projects.push({id:'no-framework',code:'PENDING-RF',name:'Current project awaiting framework',status:'active',has_results_framework:false,excluded_from_current_portfolio:false});
const ref='ndntvncboeajanipafeq',host=`https://${ref}.supabase.co`;
const now=Math.floor(Date.now()/1000),b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const session={access_token:`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',exp:now+3600})}.sig`,refresh_token:'synthetic',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};
const published={
 public_portal_summary:[{project_count:2,published_beneficiaries:50,updated_at:'2026-11-23T00:00:00Z'}],
 public_portal_projects:[{id:'pa',name:'Coastal Resilience',code:'PUB-A',currency:'VUV',budget_vuv:1000000,cumulative_expenditure_vuv:0,published_beneficiaries:50,provinces:['SANMA'],lifecycle_status:'ongoing',last_published_period:'Q1 2026',expected_primary_outcome:'Planned restoration target 500 hectares'},{id:'pb',name:'Water Security',provinces:['SANMA'],lifecycle_status:'upcoming'}],
 public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Coast',project_count:2,project_ids:['pa','pb'],project_names:['Coastal Resilience','Water Security']}],
 public_portal_kpis:[{project_id:'pa',indicator_id:'i1',label:'Trees planted',actual_value:0,target_value:500,unit:'trees',period_label:'Q1 2026'}],public_portal_indicator_categories:[],public_portal_indicator_details:[],
};
mkdirSync('qa-artifacts',{recursive:true});
const browser=await chromium.launch();
try{
 for(const lang of ['en','fr'])for(const auth of [false,true]){
  const context=await browser.newContext();
  await context.addInitScript(({ref,session,lang,auth})=>{
   localStorage.setItem('merl.lang',lang);if(auth)localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session));
   const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).startsWith('webgl')?null:get.call(this,type,...args);};
  },{ref,session,lang,auth});
  await context.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await context.route(`${host}/**`,r=>{
   const u=new URL(r.request().url()),p=u.pathname,json=(x,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
   if(p.startsWith('/auth/v1/'))return json(auth?session.user:{},auth?200:401);
   if(p.endsWith('/rpc/current_profile'))return json([{id:'u1',full_name:'Test officer',role:'system_admin'}]);
   if(p.includes('/rpc/'))return json([]);
   const rel=p.split('/').pop();let rows=(auth?fixture:published)[rel]||[];
   for(const[k,v]of u.searchParams)if(v.startsWith('eq.'))rows=rows.filter(x=>String(x[k])===v.slice(3));
   return json((r.request().headers().accept||'').includes('vnd.pgrst.object')?rows[0]||{}:rows);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   await page.goto('http://127.0.0.1:5199/#/dashboards');
   const modeName=lang==='fr'?'Mode présentation':'Presentation mode';
   if(auth)await openOverviewDetails(page);
   await page.locator(auth?'.ovx-kpis .ovx-kpi':'.pbd-metric').first().waitFor();
   assert.equal(await page.getByRole('button',{name:modeName,exact:true}).count(),0,'presentation mode is removed');
   if(!auth){
    await page.locator('.pbd-metric').first().waitFor();
    assert.equal(await page.locator('.pbd-metric').count(),5);
    assert.ok(await page.locator('.pbd-metric>small').evaluateAll(es=>es.every(e=>e.textContent.includes('23/11/2026'))));
    const info=page.locator('.pbd-metric.funding .pbd-metric-info');await info.click();
    await page.locator('.metric-information').waitFor();assert.match(await page.locator('.metric-information').innerText(),/1 \/ 2/);
    await page.keyboard.press('Escape');await page.locator('.metric-information').waitFor({state:'detached'});
    assert.equal(await info.evaluate(e=>document.activeElement===e),true,'metric focus returns to its information button');
    await page.locator('.pbd-area-list button').first().click();await page.locator('.pub-map-selection').waitFor();
    const text=await page.locator('.pub-map-selection').innerText();assert.match(text,/Trees planted/);assert.match(text,/0 trees/);assert.doesNotMatch(text,/500/);assert.match(text,/Q1 2026/);
    assert.equal(await page.locator('.pub-map-project-result').count(),2);
   }else{
    await page.locator('.ovx-kpis .ovx-kpi').first().waitFor();
    const summary=page.locator('.executive-portfolio');await summary.waitFor();
    assert.equal(await summary.locator('.executive-health').count(),5);
    assert.equal((await summary.locator('[data-health="total"] strong').innerText()).trim(),'3');
    assert.equal((await summary.locator('[data-health="critical"] strong').innerText()).trim(),'1');
    assert.equal((await summary.locator('[data-health="unassessed"] strong').innerText()).trim(),'2');
    assert.equal(await summary.getByRole('progressbar').getAttribute('aria-valuenow'),'0');
    assert.ok(await summary.evaluate(root=>[...root.querySelectorAll('article, .executive-targets')].every(el=>el.getBoundingClientRect().right<=root.getBoundingClientRect().right+1)),'executive cards stay inside the panel');
    await summary.screenshot({path:`qa-artifacts/executive-portfolio-${lang}-${width}.png`});
    const info=page.locator('.kpi-card-explain').first();await info.click();await page.locator('.figure-dialog .figure-context').waitFor();await page.keyboard.press('Escape');await page.locator('.figure-dialog').waitFor({state:'detached'});
   }
   await page.screenshot({path:`qa-artifacts/launch-reading-${auth?'internal':'public'}-${lang}-${width}.png`});
   assert.deepEqual(errors,[]);
   console.log(`PASS concise cards, map result and no presentation mode: ${auth?'internal':'public'} ${lang} ${width}`);
  }
  await context.close();
 }
}finally{await browser.close();}
