// Exercise the built sidebar with synthetic auth/data; never write live records.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
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
  await page.goto('http://127.0.0.1:5199/#/dashboards');
  await page.locator('.dsh:not(.pbd-root) .dsh-nav a').first().waitFor();
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[640,768],[390,844],[360,640],[390,380]]) {
   await page.setViewportSize({width,height});
   const sidebar=page.locator('#workspace-navigation');
   if(width<=760)await page.locator(width<=560?'.dsh-mobile-nav button':'.dsh-hamburger').click();
   await sidebar.waitFor({state:'visible'});
   // Wait for the existing drawer transition before measuring its placement.
   await page.waitForFunction(()=>document.querySelector('#workspace-navigation').getBoundingClientRect().left>=-1);
   const actual=await sidebar.evaluate(el=>{
    const css=getComputedStyle(el), rect=el.getBoundingClientRect();
    const nav=el.querySelector('.dsh-nav'), heading=el.querySelector('.dsh-nav-group-title');
    return {background:css.backgroundColor,borderRadius:css.borderRadius,top:rect.top,bottom:rect.bottom,left:rect.left,width:rect.width,
     decoration:[getComputedStyle(el,'::before').content,getComputedStyle(el,'::after').content],
     titleSize:parseFloat(getComputedStyle(heading).fontSize),navOverflow:nav.scrollWidth-nav.clientWidth,
     linkCount:nav.querySelectorAll('a').length,activeCount:nav.querySelectorAll('a.active[aria-current="page"]').length,
     iconWidths:[...nav.querySelectorAll('a svg')].map(icon=>icon.getBoundingClientRect().width)};
   });
   assert.equal(actual.background,'rgb(255, 255, 255)');
   assert.equal(actual.borderRadius,'0px');
   assert.equal(actual.titleSize,11,'Section heading must not inherit global h2 size');
   assert(actual.decoration.every(value=>value==='none'));
   assert.equal(actual.linkCount,8);assert.equal(actual.activeCount,1);
   assert(actual.iconWidths.every(value=>Math.abs(value-22)<.05), `Consistent icon width: ${actual.iconWidths}`);
   assert(actual.navOverflow<=1,'Navigation labels must fit their own column');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No body overflow');
   const header=await page.locator('.dsh-head').boundingBox();
   assert(actual.top>=header.y+header.height-1,'Sidebar begins below header');
   if(width<=760){
    const bottom=width<=560?await page.locator('.dsh-mobile-nav').boundingBox():{y:height};
    assert(actual.bottom<=bottom.y+1,'Sidebar must clear bottom navigation');
    const last=sidebar.locator('.dsh-nav a').last();await last.scrollIntoViewIfNeeded();
    const lastRect=await last.boundingBox();assert(lastRect.y+lastRect.height<=bottom.y+1,'Last item must be reachable');
    await page.screenshot({path:`qa-artifacts/sidebar-${language}-${width}x${height}.png`});
    await page.locator('.dsh-side-close').click();
    assert.equal(await page.locator('.dsh-side.open').count(),0);
   }else{
    assert.equal(await page.locator('.dsh-side-close').isVisible(),false);
    await page.screenshot({path:`qa-artifacts/sidebar-${language}-${width}x${height}.png`});
   }
   console.log(`PASS Sidebar ${language} ${width}x${height}`);
  }
  await context.close();
 }
} finally { await browser.close(); }
