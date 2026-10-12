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
// Supabase's real cross-tab event listener rechecks a session without remounting.
try {
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const session={access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_at:now+3600,user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};
 await context.addInitScript(session=>{localStorage.setItem('merl.lang','en');localStorage.setItem('sb-ndntvncboeajanipafeq-auth-token',JSON.stringify(session));},session);
 let profileCalls=0,role='system_admin',deny=false;
 await context.route(`${HOST}/**`,async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path.endsWith('/rpc/current_profile')){profileCalls++;await new Promise(r=>setTimeout(r,120));return json(deny?[]:[{id:'u1',email:'test@example.com',full_name:'Test officer',role}]);}
  if(path==='/auth/v1/logout')return route.fulfill({status:204,body:''});
  if(path==='/auth/v1/user')return json(session.user);
  if(path.startsWith('/rest/v1/'))return json(path.endsWith('/v_projects')?[{id:'pa',code:'VCAP2',name:'Test coastal project',has_results_framework:true,status:'active',currency:'VUV',provinces:[]}]:[]);
  return json([]);
 });
 const page=await context.newPage();
 await page.goto('http://localhost:5199/#/project-setup');
 await page.getByRole('heading',{name:'Find your project',exact:true}).waitFor({timeout:20000});
 const menu=page.locator('.dsh-mobile-nav button');
 await menu.click();
 await page.locator('.dsh-side.open').waitFor();
 const before=profileCalls;
 await page.evaluate(session=>{const channel=new BroadcastChannel('sb-ndntvncboeajanipafeq-auth-token');channel.postMessage({event:'TOKEN_REFRESHED',session});setTimeout(()=>channel.close(),500);},session);
 await page.waitForResponse(r=>r.url().endsWith('/rpc/current_profile'));
 await page.waitForTimeout(300);
 assert(profileCalls>before);assert.equal(await page.locator('.dsh-side.open').count(),1);
 await page.setViewportSize({width:390,height:690});
 assert.equal(await page.locator('.dsh-side.open').count(),1);
 const overlay=page.locator('.dsh-overlay');
 await overlay.dispatchEvent('pointerdown',{clientX:350,clientY:500,pointerId:1,pointerType:'touch'});
 await overlay.dispatchEvent('pointermove',{clientX:350,clientY:380,pointerId:1,pointerType:'touch'});
 await overlay.dispatchEvent('click',{detail:1});
 assert.equal(await page.locator('.dsh-side.open').count(),1);
 await overlay.dispatchEvent('pointerdown',{clientX:350,clientY:400,pointerId:2,pointerType:'touch'});
 await overlay.dispatchEvent('click',{detail:1});
 assert.equal(await page.locator('.dsh-side.open').count(),0);
 await page.locator('.dsh-user').click();
 await page.evaluate(session=>{const channel=new BroadcastChannel('sb-ndntvncboeajanipafeq-auth-token');channel.postMessage({event:'SIGNED_IN',session});setTimeout(()=>channel.close(),500);},session);
 await page.waitForResponse(r=>r.url().endsWith('/rpc/current_profile'));
 await page.waitForTimeout(300);
 assert.equal(await page.locator('.dsh-account-backdrop').count(),1);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.dsh-account-backdrop').count(),0);
 role='viewer';
 await page.evaluate(session=>{const channel=new BroadcastChannel('sb-ndntvncboeajanipafeq-auth-token');channel.postMessage({event:'TOKEN_REFRESHED',session});setTimeout(()=>channel.close(),500);},session);
 await page.waitForResponse(r=>r.url().endsWith('/rpc/current_profile'));
 await page.getByText('You can view this project.',{exact:false}).waitFor({timeout:15000});
 assert.equal(await page.getByRole('button',{name:'Edit project manager',exact:true}).count(),0);
 deny=true;
 await page.evaluate(session=>{const channel=new BroadcastChannel('sb-ndntvncboeajanipafeq-auth-token');channel.postMessage({event:'TOKEN_REFRESHED',session});setTimeout(()=>channel.close(),500);},session);
 await page.locator('.pbd-root').waitFor({timeout:15000});
 console.log('PASS Phone menus survive session renewal and resizing; drags do not dismiss; taps/Escape close; revoked access still signs out');
}finally{await browser.close();}
