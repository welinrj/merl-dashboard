// Anonymous phone sidebar must use the approved brand without exposing staff navigation.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{localStorage.setItem('merl.lang','en');});
 const reads=[];
 await context.route('https://ndntvncboeajanipafeq.supabase.co/**',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/rest/v1/')){
   const relation=url.pathname.split('/').pop();reads.push(relation);
   const body=relation==='public_portal_summary'?[{project_count:0}]:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify((req.headers().accept||'').includes('vnd.pgrst.object')?body[0]||null:body)});
  }
  return route.fulfill({status:401,contentType:'application/json',body:'{}'});
 });
 await context.route('https://services.arcgis.com/**',route=>route.abort());
 const page=await context.newPage();await page.goto('http://localhost:5199/');
 await page.locator('.pbd-root .dsh-hamburger').waitFor({timeout:20000});
 await page.locator('.pub-leaflet-wrap').waitFor({timeout:20000});
 await page.locator('.pub-leaflet-wrap').scrollIntoViewIfNeeded();
 // Exercise the menu over the map, including Leaflet's high-z-index children.
 await page.locator('.pub-leaflet-wrap').evaluate(el=>{
  const pane=document.createElement('div');
  pane.dataset.qa='leaflet-high-pane';
  pane.style.cssText='position:absolute;inset:0;z-index:1000;background:#acd3de';
  el.appendChild(pane);
 });
 await page.locator('.pbd-root .dsh-hamburger').click();
 await page.waitForFunction(()=>document.querySelector('.pbd-root .dsh-side.open')?.getBoundingClientRect().left>=-1);
 const sidebar=page.locator('.pbd-root .dsh-side');
 await sidebar.locator('img.island-logo').waitFor();
 await page.waitForFunction(()=>{const img=document.querySelector('.pbd-root .dsh-brand img.island-logo');return img?.complete && img.naturalWidth>0;});
 assert.equal(await sidebar.locator('img.island-logo').evaluate(el=>getComputedStyle(el).filter),'none');
 assert.equal(await sidebar.locator('img.island-logo').evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.equal(await sidebar.locator('.pbd-sidebar-access').count(),0);
 assert.equal(await sidebar.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(21, 59, 88)');
 assert.equal(await sidebar.locator('.dsh-brand').evaluate(el=>getComputedStyle(el,'::before').display),'none');
 assert.equal(await sidebar.locator('.dsh-brand-title').innerText(),'MERL Portal');
 assert.equal(await sidebar.locator('.dsh-nav button').count(),1);
 assert.equal(await sidebar.locator('.dsh-nav button.active').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 127, 141)');
 assert.equal(await page.locator('.dsh-head .merl-partner-logos img').count(),2);
 assert.ok(reads.every(name=>name.startsWith('public_portal_')));
 const stacking=await page.evaluate(()=>{
  const map=document.querySelector('.pub-leaflet-wrap').getBoundingClientRect();
  const side=document.querySelector('.pbd-root .dsh-side');
  const drawer=side.getBoundingClientRect();
  const y=Math.max(map.top+20,Math.min(map.bottom-20,map.top+map.height/2));
  const underDrawer=document.elementFromPoint(Math.max(map.left+10,drawer.left+10),y);
  const underBackdrop=document.elementFromPoint((drawer.right+map.right)/2,y);
  return {drawer:side.contains(underDrawer),backdrop:underBackdrop?.classList.contains('pbd-overlay'),
   mapRight:map.right,drawerRight:drawer.right,y,backdropHit:underBackdrop?.className};
 });
 assert.equal(stacking.drawer,true,'Sidebar covers high Leaflet panes');
 assert.equal(stacking.backdrop,true,`Backdrop covers the exposed map and its controls: ${JSON.stringify(stacking)}`);
 await sidebar.getByRole('button',{name:'Close menu',exact:true}).click();
 assert.equal(await sidebar.evaluate(el=>el.classList.contains('open')),false);
 console.log('PASS Public phone menu uses Island resilience logo, navy/teal styling, close action and public-only navigation');
} finally {await browser.close();}
