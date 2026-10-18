// Public regression: one overview, public snapshot reads, finance, locations and filters.
import { chromium } from 'playwright';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
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
const proxyUrl=process.env.MAP_QA_PROXY?new URL(process.env.MAP_QA_PROXY):null;
const browser=await chromium.launch({executablePath:process.env.PW_EXECUTABLE||undefined,proxy:proxyUrl?{server:`${proxyUrl.protocol}//${proxyUrl.host}`,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const context=await browser.newContext({ignoreHTTPSErrors:Boolean(proxyUrl),viewport:{width:1440,height:1100}});
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
// A real vector basemap is exercised below. No API key or paid endpoint.
context.on('request',request=>{if(request.url().includes('tiles.openfreemap.org'))tileRequests++;});
if(process.env.MAP_QA_BRIDGE){
 const run=promisify(execFile);
 await context.route('https://tiles.openfreemap.org/**',async route=>{
  try{
   const {stdout}=await run('curl',['--fail','--silent','--location','--max-time','25',route.request().url()],{encoding:'buffer',maxBuffer:8*1024*1024});
   await route.fulfill({status:200,body:stdout});
  }catch{await route.abort();}
 });
}
const page=await context.newPage();
if(process.env.MAP_QA_BRIDGE)page.on('console',message=>{if(message.type()==='error')console.error(message.text().slice(0,240));});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
mkdirSync('qa-artifacts',{recursive:true});
try{
 await page.goto('http://127.0.0.1:5199/#/dashboards',{waitUntil:'domcontentloaded'});
 console.log('Portal opened');
 await page.locator('.maplibregl-canvas').waitFor({timeout:30000});
 // Inspect the mounted map ref through React only in QA; no production debug API.
 const mapEval=async(fn,arg)=>page.locator('.pub-maplibre').evaluate((el,{code,arg})=>{
  let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];
  while(fiber){
   let hook=fiber.memoizedState;
   while(hook){const value=hook.memoizedState?.current;
    if(value&&typeof value.getStyle==='function'&&typeof value.queryRenderedFeatures==='function')return (new Function('map','arg',code))(value,arg);
    hook=hook.next;
   }
   fiber=fiber.return;
  }
  throw new Error('Map instance not mounted');
 },{code:`return (${fn.toString()})(map,arg)`,arg});
 const waitMap=async()=>{
  for(let i=0;i<150;i++){
   if(await mapEval(async map=>(await map.getSource('councils')?.getData())?.features?.filter(f=>f.properties.projectCount>0).length===5))return;
   await page.waitForTimeout(100);
  }
  throw new Error('Coverage not ready');
 };
 await waitMap();
 console.log('Coverage ready');
 assert.equal(await mapEval(async map=>(await map.getSource('councils').getData()).features.length),71);
 assert.equal(await mapEval(map=>map.getLayoutProperty('council-borders','visibility')),'none');
 for(let i=0;i<150&&tileRequests===0;i++)await page.waitForTimeout(100);
 assert.ok(tileRequests>0,'MapLibre requests OpenFreeMap basemap');
 if(process.env.MAP_QA_REQUIRE_BASEMAP){
  for(let i=0;i<300;i++){
   if(await mapEval(map=>Boolean(map.getSource('openmaptiles'))&&map.isSourceLoaded('openmaptiles')))break;
   await page.waitForTimeout(100);
  }
  assert.equal(await mapEval(map=>Boolean(map.getSource('openmaptiles'))&&map.isSourceLoaded('openmaptiles')),true,'real OpenFreeMap vector tiles loaded');
 }
 await page.waitForFunction(()=>document.querySelector('.pub-map-neutral')?.textContent.includes('66'));
 for(const [width,height] of [[1920,1100],[1440,1100],[768,1100],[390,844],[360,780]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.getByRole('button',{name:'Show all Vanuatu'}).click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('.pub-coverage-map').scrollIntoViewIfNeeded();
  const boxes=await page.locator('.pub-coverage-map').evaluate(el=>{
   const canvas=el.querySelector('.pub-map-canvas').getBoundingClientRect(),key=el.querySelector('.pub-map-key').getBoundingClientRect();
   const canvasPresent=Boolean(el.querySelector('.maplibregl-canvas'));
   const font=parseFloat(getComputedStyle(el.querySelector('.pub-map-legend span')).fontSize);
   return {canvasPresent,font,mapHeight:canvas.height,clear:key.top>=canvas.bottom-1,fit:document.documentElement.scrollWidth<=innerWidth+1};
  });
  const extent=await mapEval(async map=>{
   const features=(await map.getSource('councils').getData()).features;
   const points=[];const visit=c=>{if(typeof c[0]==='number')points.push(map.project(c));else c.forEach(visit);};
   features.forEach(f=>visit(f.geometry.coordinates));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),canvas=map.getCanvas();
   return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys),width:canvas.clientWidth,height:canvas.clientHeight};
  });
  assert.ok(extent.left>=0&&extent.right<=extent.width&&extent.top>=0&&extent.bottom<=extent.height&&extent.bottom-extent.top>=extent.height*.6,JSON.stringify({width,...extent}));
  assert.ok(boxes.canvasPresent&&boxes.font>=14&&boxes.mapHeight>=320&&boxes.clear&&boxes.fit,JSON.stringify({width,...boxes}));
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
 const point=await mapEval(async map=>{
  const f=(await map.getSource('councils').getData()).features.find(f=>f.properties.ADM2_EN==='Big Bay Coast');
  // The widest interior span is already used by council labels.
  const labels=(await map.getSource('council-labels').getData()).features;
  const centre=labels.find(l=>l.properties.ADM2_EN===f.properties.ADM2_EN).geometry.coordinates;
  const p=map.project(centre),rect=map.getCanvas().getBoundingClientRect();
  return {x:rect.left+p.x,y:rect.top+p.y};
 });
 await page.mouse.click(point.x,point.y);
 await page.getByRole('button',{name:'Clear area selection'}).waitFor();
 await page.getByRole('button',{name:'Clear area selection'}).click();
 await page.getByLabel('Basemap',{exact:true}).selectOption('satellite');
 await page.waitForFunction(()=>document.querySelector('.maplibregl-ctrl-attrib')?.textContent.includes('Esri'));
 // An unavailable tile service retains selectable council coverage.
 await context.route('https://tiles.openfreemap.org/**',route=>route.abort());
 await page.getByLabel('Basemap',{exact:true}).selectOption('street');
 await page.getByRole('status').filter({hasText:'Basemap unavailable'}).waitFor();
 await waitMap();
 assert.equal(await mapEval(map=>Boolean(map.getLayer('fallback-land'))),true);
 await context.unroute('https://tiles.openfreemap.org/**');
 await page.getByLabel('Basemap',{exact:true}).selectOption('light');
 await page.getByRole('button',{name:'FR',exact:true}).click();
 await page.getByRole('button',{name:'Voir tout le Vanuatu'}).waitFor();
 await waitMap();
 await page.getByLabel('Limites des conseils',{exact:true}).check();
 assert.equal(await mapEval(map=>map.getLayoutProperty('council-borders','visibility')),'visible');
 assert.deepEqual(errors,[]);
 console.log('MapLibre cartography: OpenFreeMap requested, 71 councils, shared borders, selection, fallback, satellite, EN/FR and five viewports passed.');
}catch(error){await page.screenshot({path:'qa-artifacts/map-failure.png'});console.error('Page errors:',errors);throw error;}finally{await browser.close();}
