import { openOverviewDetails } from './overview-details.mjs';
// Exercise Results scrolling with 301 synthetic indicators; never write live records.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('qa/fixture.json','utf8'));
const ref='ndntvncboeajanipafeq', host=`https://${ref}.supabase.co`;
const now=Math.floor(Date.now()/1000), b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const session={access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};

mkdirSync('qa-artifacts',{recursive:true});
const browser=await chromium.launch();
try {
 for(const language of ['en','fr']) {
  const context=await browser.newContext();
  await context.addInitScript(({ref,session,language})=>{
   localStorage.setItem('merl.lang',language);
   localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify(session));
  },{ref,session,language});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();
  });
  await context.route(`${host}/**`,route=>{
   const url=new URL(route.request().url()), path=url.pathname;
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(path.endsWith('/rpc/current_profile')) return json([{id:'u1',email:'test@example.com',full_name:'Test officer',role:'system_admin'}]);
   if(path.startsWith('/auth/v1/'))return json(session.user);
   if(path.startsWith('/rest/v1/rpc/'))return json([]);
   const relation=path.replace('/rest/v1/','').split('/')[0];
   let rows=fixture[relation]??[];
   for(const [key,value] of url.searchParams) if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
   if((route.request().headers().accept??'').includes('vnd.pgrst.object'))return json(rows[0]??{},rows.length?200:406);
   return json(rows);
  });
  const page=await context.newPage();
  const routes=process.env.MERL_HEADER_ONLY ? [] : [['overview','/dashboards'],['projects','/project-setup'],['framework','/results-framework'],['portfolio','/analytics/project-portfolio?project=pa'],['update','/merl-reporting'],['review','/review'],['reports','/reports'],['admin','/admin']];
  const observations=[];
  for(const [width,height] of [[1440,900],[1024,768],[390,844]]) {
   await page.setViewportSize({width,height});
   for(const [name,path] of routes) {
    await page.goto('http://127.0.0.1:5199/#'+path);
    await page.waitForTimeout(1300);
    await page.locator('.dsh-scroll').evaluate(el=>{el.scrollTop=0;});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No page overflow: '+name+' '+width);
    assert.match(await page.evaluate(()=>getComputedStyle(document.body).fontFamily),/^Arial/);
    if(name==='overview')await openOverviewDetails(page);
    if(name==='overview'){assert(await page.locator('.kpi-card-explain svg').first().isVisible(),'Metric explanation icon is visible');assert.equal(await page.locator('.dashboard-filter-fields').isVisible(),false,'Filters start closed at every width');assert.equal(await page.locator('.wg-start').isVisible(),false,'Shortcuts are on demand');}
    if(name==='reports')assert(await page.locator('.rp-selected-scope').innerText());
    if(name==='review' && width===390)assert.equal(await page.locator('.review-summary-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
    if(name==='admin')assert(await page.locator('.admin-role-badge').first().evaluate(el=>el.getBoundingClientRect().width>=136));
    observations.push({name,width,...await page.evaluate(()=>({
      title:document.querySelector('.page-pad h1,.rf2-header h1')?.textContent,
      font:getComputedStyle(document.body).fontFamily,
      bodyOverflow:document.documentElement.scrollWidth>innerWidth,
      headings:[...document.querySelectorAll('main h1,main h2')].slice(0,12).map(e=>e.textContent),
      smallText:[...document.querySelectorAll('main p,main label,main small,main a,main button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&parseFloat(getComputedStyle(e).fontSize)<12;}).slice(0,12).map(e=>({text:e.textContent?.slice(0,90),size:getComputedStyle(e).fontSize})),
      excerpt:document.querySelector('.dsh-scroll')?.innerText.slice(0,2000)
    }))});
    await page.screenshot({path:`qa-artifacts/launch-${language}-${name}-${width}.png`});
    if(name==='overview'){
      const colour=await page.locator('.kpi-card-head').first().evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.equal(colour,'rgb(234, 242, 247)','Result card headings use the shared pale blue');
      for(const selector of ['.ovx-beneficiary-summary']){
        const section=page.locator(selector);await section.scrollIntoViewIfNeeded();
        const heading=section.locator(selector.includes('beneficiary')?'.bene-head':':scope > h2');
        assert.equal(await heading.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 62, 89)','Section headings use the shared navy');
        await page.screenshot({path:`qa-artifacts/launch-${language}-${selector.slice(1)}-${width}.png`});
      }
    }

   }
  }
  writeFileSync(`qa-artifacts/launch-${language}-observations.json`,JSON.stringify(observations,null,2));
  await context.close();
  const pub=await browser.newContext();
  await pub.addInitScript(lang=>localStorage.setItem('merl.lang',lang),language);
  const published={
    public_portal_summary:[{project_count:2,total_investment_vuv:150000000,published_beneficiaries:120,updated_at:'2026-11-10T00:00:00Z'}],
    public_portal_projects:[{id:'pub1',code:'VCAP2',name:'Vanuatu Coastal Adaptation Project',provinces:['SANMA'],primary_climate_theme:'Adaptation',lifecycle_status:'ongoing',budget_vuv:150000000,cumulative_expenditure_vuv:20000000,published_beneficiaries:120},{id:'pub2',code:'CBIT',name:'Capacity-building Initiative for Transparency',provinces:['SHEFA'],primary_climate_theme:'Mitigation',lifecycle_status:'ongoing'}],
    public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Inland',project_count:1,project_ids:['pub1'],project_names:['Vanuatu Coastal Adaptation Project']}],
    public_portal_kpis:[],public_portal_indicator_categories:[{project_id:'pub1',category_key:'ecosystems',indicator_count:16},{project_id:'pub2',category_key:'governance',indicator_count:9}],
    public_portal_indicator_details:[{indicator_id:'pub-i1',project_id:'pub1',project_name:'Vanuatu Coastal Adaptation Project',category_key:'ecosystems',indicator_code:'PUB-I1',indicator_name:'Habitat restoration',target_value:10,unit:'ha'}],
    public_portal_project_inventory:[{total_projects:2,approved_projects:2,other_projects:0}]
  };
  await pub.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await pub.route(`${host}/**`,route=>{
    const req=route.request(),url=new URL(req.url()),rel=url.pathname.replace('/rest/v1/','').split('/')[0];
    const rows=published[rel];
    return route.fulfill({status:rows?200:401,contentType:'application/json',body:JSON.stringify(rows?((req.headers().accept||'').includes('vnd.pgrst.object')?rows[0]:rows):{})});
  });
  const publicPage=await pub.newPage();
  for(const width of [1440,1024,390]){
    await publicPage.setViewportSize({width,height:width===390?844:900});
    await publicPage.goto('http://127.0.0.1:5199/#/dashboards');
    await publicPage.locator('.pbd-metric').first().waitFor();
    await publicPage.waitForTimeout(500);
    assert.equal(await publicPage.locator('[data-slot=progress]').count(),0,'Category counts are not achievement bars');
    const publicFits=await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    if(!publicFits) await publicPage.screenshot({path:`qa-artifacts/launch-public-failure-${language}-${width}.png`});
    assert(publicFits,'Public page fits');
    await publicPage.locator('.dsh-scroll').evaluate(el=>{el.scrollTop=0;});
    await publicPage.screenshot({path:`qa-artifacts/launch-${language}-public-${width}.png`});
    await publicPage.locator('.pbd-activity-section').scrollIntoViewIfNeeded();
    await publicPage.screenshot({path:`qa-artifacts/launch-${language}-categories-${width}.png`});
  }
  await pub.close();

 }
} finally { await browser.close(); }
