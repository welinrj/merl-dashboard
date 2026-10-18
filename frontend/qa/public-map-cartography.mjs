// Public regression: one overview, public snapshot reads, finance, locations and filters.
import { chromium } from 'playwright';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const projects = [
  {id:'pa',code:'PUB-1',name:'Coastal Resilience',project_manager:'Lina Kalo',provinces:['SANMA'],primary_climate_theme:'Adaptation',docc_themes:['Adaptation','Mitigation'],lifecycle_status:'ongoing',budget_vuv:1000000,cumulative_expenditure_vuv:300000,utilisation_pct:30,progress_pct:40,published_beneficiaries:50,last_published_period:'2026 Q2',expected_primary_outcome:'Coastal communities are resilient',docc_image_url:'/project-images/vcap2.webp'},
  {id:'pb',code:'PUB-2',name:'Water Security',project_manager:'Tom Nalo',provinces:['TORBA','SANMA'],primary_climate_theme:'Water Security',lifecycle_status:'completed',budget_vuv:2000000,cumulative_expenditure_vuv:600000,utilisation_pct:30,progress_pct:100,published_beneficiaries:70,expected_primary_outcome:'Reliable water supply'},
];
const fixtures = {
  public_portal_summary:[{project_count:2,overall_progress_pct:70,published_beneficiaries:120,total_investment_vuv:3000000,total_utilised_vuv:900000,financial_utilisation_pct:30,updated_at:'2026-07-01T00:00:00Z'}],
  public_portal_projects:projects,
  public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Coast',project_count:2,project_ids:['pa','pb'],project_names:['Coastal Resilience','Water Security']},{province:'SANMA',area_council:'South Santo One (1)',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'SANMA',area_council:'South Santo Two (2)',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'MALAMPA',area_council:'West Ambrym',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'TORBA',area_council:'Mota Lava',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'TORBA',area_council:'Torres',project_count:1,project_ids:['pb'],project_names:['Water Security']}],
  public_portal_kpis:[],
  public_portal_indicator_categories:[{project_id:'pa',category_key:'ecosystems',indicator_count:3},{project_id:'pa',category_key:'capacity',indicator_count:2},{project_id:'pb',category_key:'finance',indicator_count:4}],
  public_portal_indicator_details:[{indicator_id:'i1',project_id:'pa',project_name:'Coastal Resilience',category_key:'ecosystems',indicator_code:'COAST-1',indicator_name:'Mangrove restoration',target_value:20,unit:'ha'},{indicator_id:'i3',project_id:'pa',project_name:'Coastal Resilience',category_key:'capacity',indicator_code:'COAST-2',indicator_name:'Community training',target_value:null,target_text:null},{indicator_id:'i2',project_id:'pb',project_name:'Water Security',category_key:'finance',indicator_code:'WATER-1',indicator_name:'Financing arrangements',target_value:null,target_text:null}],
};
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1100}});
await context.addInitScript(()=>localStorage.setItem('merl.lang','en'));
const reads=[];
await context.route(`${HOST}/**`, async route => {
  const request = route.request(), url = new URL(request.url());
  if(url.pathname.startsWith('/rest/v1/')) {
    const rel = url.pathname.split('/').pop(); reads.push(rel);
    if(request.method() !== 'GET' || !(rel in fixtures)) return route.fulfill({status:403,body:'{}'});
    const rows = fixtures[rel];
    const single = (request.headers().accept||'').includes('vnd.pgrst.object');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]:rows)});
  }
  if(url.pathname.startsWith('/auth/v1/')) return route.fulfill({status:401,contentType:'application/json',body:'{}'});
  return route.fulfill({status:403,body:'{}'});
});

let tileRequests=0;
await context.route(/https:\/\/(?:[^/]+\.tile\.openstreetmap\.org|server\.arcgisonline\.com)\//,route=>{tileRequests++;return route.abort();});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
mkdirSync('qa-artifacts',{recursive:true});
try{
 await page.goto('http://127.0.0.1:5199/#/dashboards');
 await page.locator('.pub-map-recorded').first().waitFor({timeout:30000});
 await page.waitForFunction(()=>document.querySelectorAll('.pub-map-recorded').length===5);
 assert.equal(await page.locator('.pub-map-boundaries').count(),0,'neutral council linework is off by default');
 assert.equal(await page.locator('.pub-map-recorded,.pub-map-unrecorded').count(),71);
 assert.ok(tileRequests>0,'default map requests geographic basemap detail');
 assert.equal(await page.locator('.pbd-neon-boundary').count(),0);
 await page.waitForFunction(()=>document.querySelector('.pub-map-neutral')?.textContent.includes('66'));
 for(const [width,height] of [[1920,1100],[1440,1100],[768,1100],[390,844],[360,780]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.getByRole('button',{name:'Show all Vanuatu'}).click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('.pub-coverage-map').scrollIntoViewIfNeeded();
  const boxes=await page.locator('.pub-coverage-map').evaluate(el=>{
   const canvas=el.querySelector('.pub-map-canvas').getBoundingClientRect(),key=el.querySelector('.pub-map-key').getBoundingClientRect();
   const land=el.querySelector('.leaflet-councilLand-pane path').getBoundingClientRect();
   const fillsMap=land.height>=canvas.height*.6;
   const allIslands=land.left>=canvas.left&&land.right<=canvas.right&&land.top>=canvas.top&&land.bottom<=canvas.bottom;
   const font=parseFloat(getComputedStyle(el.querySelector('.pub-map-legend span')).fontSize);
   return {allIslands,fillsMap,font,mapHeight:canvas.height,clear:key.top>=canvas.bottom-1,fit:document.documentElement.scrollWidth<=innerWidth+1};
  });
  assert.ok(boxes.allIslands&&boxes.fillsMap&&boxes.font>=14&&boxes.mapHeight>=320&&boxes.clear&&boxes.fit,JSON.stringify({width,...boxes}));
  await page.screenshot({path:`qa-artifacts/map-cartography-${width}.png`});
  if(width<761)assert.ok(await page.locator('.pub-map-toolbar').evaluate(el=>el.getBoundingClientRect().height<=120),'phone toolbar stays within two rows');
 }
 await page.getByRole('button',{name:'Full screen',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'Show project locations',exact:true}).click();
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'Show all Vanuatu'}).click();
 assert.equal(await page.locator('.pub-map-all-themes').getAttribute('open'),null);
 await page.locator('.pub-map-all-themes summary').click();
 assert.notEqual(await page.locator('.pub-map-all-themes').getAttribute('open'),null);
 await page.locator('.pub-map-all-themes summary').click();
 await page.locator('.pub-map-choose select').selectOption({index:1});
 await page.locator('.pub-map-selection').waitFor();
 await page.locator('.pub-map-selection button').first().click();
 await page.waitForFunction(()=>document.activeElement?.id==='public-project-pa');
 await page.getByRole('button',{name:'Clear area selection'}).click();
 await page.setViewportSize({width:1440,height:1100});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.getByRole('button',{name:'Show all Vanuatu'}).click();
 await page.locator('.pub-map-canvas').scrollIntoViewIfNeeded();
 const point=await page.locator('.pub-map-recorded').evaluateAll(paths=>{
  for(const path of [...paths].sort((a,b)=>b.getBBox().width*b.getBBox().height-a.getBBox().width*a.getBBox().height)){
   const box=path.getBBox();
   for(let x=.15;x<1;x+=.1)for(let y=.15;y<1;y+=.1){
    const point=new DOMPoint(box.x+box.width*x,box.y+box.height*y);
    if(path.isPointInFill(point)){const screen=point.matrixTransform(path.getScreenCTM());return {x:screen.x,y:screen.y};}
   }
  }
 });
 assert.ok(point,'recorded council has a clickable interior');
 await page.mouse.click(point.x,point.y);
 await page.getByRole('button',{name:'Clear area selection'}).waitFor();
 await page.getByRole('button',{name:'Clear area selection'}).click();
 await page.locator('.leaflet-control-layers').hover();
 await page.getByText('Satellite',{exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.leaflet-control-attribution')?.textContent.includes('Esri'));
 await page.locator('.leaflet-control-layers').hover();
 await page.locator('.leaflet-control-layers').getByText('Overview',{exact:true}).click();
 await page.getByRole('button',{name:'FR',exact:true}).click();
 await page.getByRole('button',{name:'Voir tout le Vanuatu'}).waitFor();
 await page.locator('.pub-map-recorded').first().waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.pub-map-recorded').length===5);
 assert.equal(await page.locator('.pub-map-boundaries').count(),0);
 await page.locator('.leaflet-control-layers').hover();
 await page.getByText('Limites des conseils',{exact:true}).click();
 assert.equal(await page.locator('.pub-map-boundaries').count(),1,'optional shared boundaries render once');
 assert.deepEqual(errors,[]);
 console.log('Map cartography: 71 councils, geographic default, optional boundaries, correct counts, selection, base layers, EN/FR and five viewports passed.');
}finally{await browser.close();}
