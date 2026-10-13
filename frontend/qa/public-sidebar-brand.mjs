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
 await page.locator('.pbd-root .dsh-hamburger').click();
 const sidebar=page.locator('.pbd-root .dsh-side');
 await sidebar.locator('img.island-logo').waitFor();
 await page.waitForFunction(()=>{const img=document.querySelector('.pbd-root .dsh-brand img.island-logo');return img?.complete && img.naturalWidth>0;});
 assert.equal(await sidebar.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(21, 59, 88)');
 assert.equal(await sidebar.locator('.dsh-brand').evaluate(el=>getComputedStyle(el,'::before').display),'none');
 assert.equal(await sidebar.locator('.dsh-brand-title').innerText(),'MERL Portal');
 assert.equal(await sidebar.locator('.dsh-nav button').count(),1);
 assert.equal(await sidebar.locator('.dsh-nav button.active').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 127, 141)');
 assert.equal(await page.locator('.dsh-head .merl-partner-logos img').count(),2);
 assert.ok(reads.every(name=>name.startsWith('public_portal_')));
 await sidebar.getByRole('button',{name:'Close menu',exact:true}).click();
 assert.equal(await sidebar.evaluate(el=>el.classList.contains('open')),false);
 console.log('PASS Public phone menu uses Island resilience logo, navy/teal styling, close action and public-only navigation');
} finally {await browser.close();}
