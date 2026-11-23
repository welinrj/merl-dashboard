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
  const routes=[['overview','/dashboards'],['projects','/project-setup'],['framework','/results-framework'],['portfolio','/analytics/project-portfolio?project=pa'],['update','/merl-reporting'],['review','/review'],['reports','/reports'],['admin','/admin']];
  const observations=[];
  for(const [width,height] of [[1440,900],[1024,768],[390,844]]) {
   await page.setViewportSize({width,height});
   for(const [name,path] of routes) {
    await page.goto('http://127.0.0.1:5199/#'+path);
    await page.waitForTimeout(1300);
    observations.push({name,width,...await page.evaluate(()=>({
      title:document.querySelector('main h1, main h2')?.textContent,
      font:getComputedStyle(document.body).fontFamily,
      bodyOverflow:document.documentElement.scrollWidth>innerWidth,
      headings:[...document.querySelectorAll('main h1,main h2')].slice(0,12).map(e=>e.textContent),
      smallText:[...document.querySelectorAll('main p,main label,main small,main a,main button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&parseFloat(getComputedStyle(e).fontSize)<12;}).slice(0,12).map(e=>({text:e.textContent?.slice(0,90),size:getComputedStyle(e).fontSize})),
      excerpt:document.querySelector('main')?.innerText.slice(0,2000)
    }))});
    await page.screenshot({path:`qa-artifacts/audit-${name}-${width}.png`});
   }
  }
  writeFileSync('qa-artifacts/audit-observations.json',JSON.stringify(observations,null,2));
  await context.close();
 }
} finally { await browser.close(); }
