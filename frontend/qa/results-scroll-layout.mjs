// Exercise Results scrolling with 301 synthetic indicators; never write live records.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('qa/fixture.json','utf8'));
const ref='ndntvncboeajanipafeq', host=`https://${ref}.supabase.co`;
const now=Math.floor(Date.now()/1000), b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const session={access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};

fixture.v_framework_nodes=[
 {id:'goal',project_id:'pa',node_type:'project_objective',node_code:'GOAL',title:'More resilient coastal communities'},
 {id:'outcome',project_id:'pa',parent_node_id:'goal',node_type:'outcome',node_code:'OC1',title:'Communities improve adaptation outcomes'},
 {id:'output',project_id:'pa',parent_node_id:'outcome',node_type:'output',node_code:'OP1',title:'Adaptation measures implemented'},
];
fixture.v_project_indicators=Array.from({length:301},(_,index)=>({...fixture.v_project_indicators[0],id:`indicator-${index}`,code:`IND-${index+1}`,name:`Framework record ${index+1}`,framework_node_id:'output'}));

mkdirSync('qa-artifacts',{recursive:true});
const browser=await chromium.launch();
try {
 for(const language of ['en']) {
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
  await page.goto('http://127.0.0.1:5199/#/results-framework');
  await page.locator('.rf2-table tbody tr').first().waitFor();

  for(const [width,height] of [[1440,900],[1366,768],[1024,768],[390,844]]) {
   await page.setViewportSize({width,height});
   const toggle=page.locator('.rf2-mobile-results>button');
   if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
   const table=page.getByRole('region',{name:'Results framework table'});
   await table.waitFor();
   await page.waitForFunction(()=>document.querySelectorAll('.rf2-table tbody tr').length>=301);
   assert.notEqual(await page.locator('.rf2-tools').evaluate(el=>getComputedStyle(el).position),'sticky','Filters must scroll with the page');
   await table.scrollIntoViewIfNeeded();
   const size=await table.boundingBox();
   assert(size.height<=height*.65+2,'Table has a bounded scroll viewport');
   const outer=await page.locator('.dsh-scroll').evaluate(el=>el.scrollTop);
   await table.evaluate(el=>{el.scrollTop=600;el.scrollLeft=650;});
   const geometry=await table.evaluate(el=>{
    const rect=el.getBoundingClientRect(),head=el.querySelector('th'),h=head.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.x+15,rect.y+12);
    return {top:rect.top,headTop:h.top,headBackground:getComputedStyle(head).backgroundColor,
      scrollTop:el.scrollTop,scrollLeft:el.scrollLeft,headHit:Boolean(hit?.closest('thead')),
      projectLeft:el.querySelector('td.rf2-project').getBoundingClientRect().left,left:rect.left};
   });
   assert(geometry.scrollTop>0 && geometry.scrollLeft>0,'Both table axes work');
   assert(Math.abs(geometry.top-geometry.headTop)<3,'Column headings stay at the table top');
   assert.equal(geometry.headBackground,'rgb(237, 245, 247)');
   assert(geometry.headHit,'Rows must not paint over the column headings');
   if(width>900)assert(Math.abs(geometry.projectLeft-geometry.left)<3,'Project identity stays frozen horizontally');
   assert(Math.abs(await page.locator('.dsh-scroll').evaluate(el=>el.scrollTop)-outer)<2,'Table scrolling does not move the page');
   // Reproduce the native wheel gesture at the end of a long table, rather
   // than only setting scrollTop: it must not chain into the outer page.
   await table.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const beforeWheel=await page.locator('.dsh-scroll').evaluate(el=>el.scrollTop);
   const area=await table.boundingBox();
   await page.mouse.move(area.x+area.width/2,area.y+area.height/2);
   await page.mouse.wheel(0,600);
   await page.waitForTimeout(150);
   assert(Math.abs(await page.locator('.dsh-scroll').evaluate(el=>el.scrollTop)-beforeWheel)<2,'Wheel scrolling must stay inside the table');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No body overflow');
   await page.screenshot({path:`qa-artifacts/results-scroll-${width}x${height}.png`});
   // A reader can leave the spreadsheet for the grouped, readable list.
   await toggle.scrollIntoViewIfNeeded();await toggle.click();
   await page.locator('.rf2-result-groups').waitFor();
   if(width>700){
    const report=await page.locator('.rf2-mobile-results>a').boundingBox();
    const mode=await toggle.boundingBox();
    assert(Math.abs(report.y-mode.y)<2,'Report and view actions share one compact row');
   }
   await toggle.click();
  }
  // Search remains functional after scrolling a long framework.
  await page.locator('input[type=search]').filter({visible:true}).last().fill('Framework record 301');
  await page.waitForFunction(()=>document.querySelectorAll('.rf2-table tbody tr').length===1);
  console.log('PASS Results table scrolling, opaque sticky headings, static filters, frozen project identity, list switch and search across 301 synthetic indicators');
  await context.close();
 }
} finally { await browser.close(); }
