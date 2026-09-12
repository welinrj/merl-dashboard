import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF='ndntvncboeajanipafeq', HOST=`https://${REF}.supabase.co`;
const now=Math.floor(Date.now()/1000);
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+99999})}.sig`;
const T=JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

const pages=[
  ['Overview','/dashboards',/Dashboard Overview|MERL Dashboard/i],
  ['Project Setup','/project-setup',/Project Registration/i],
  ['Results & Indicators','/analytics/results',/Results|Indicators/i],
  ['Project Portfolio Analysis','/analytics/project-portfolio?project=pa',/Project Portfolio Analysis/i],
  ['Financial Analysis','/analytics/financial',/Financial/i],
  ['Geographic Coverage','/analytics/geographic',/Area Council Coverage|Geographic/i],
  ['Reports','/reports',/Reports/i],
  ['Review','/review',/Review|Approval/i],
];

async function authContext(){
  const ctx=await browser.newContext({viewport:{width:1365,height:900}});
  await ctx.addInitScript(([ref,tok,exp])=>{
    localStorage.setItem('merl.lang','en');
    localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify({
      access_token:tok,token_type:'bearer',expires_in:99999,expires_at:exp,refresh_token:'r',
      user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}
    }));
  },[REF,jwt,now+99999]);
  await ctx.route(`${HOST}/**`,async route=>{
    const req=route.request(), u=new URL(req.url()), p=u.pathname;
    if(p.endsWith('/rpc/current_profile')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'u1',email:'admin@docc.gov.vu',full_name:'Audit Admin',role:'system_admin'}])});
    if(p.startsWith('/auth/v1/user')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'})});
    if(p.startsWith('/rest/v1/rpc/')) return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if(p.startsWith('/rest/v1/')){
      const rel=p.replace('/rest/v1/','').split('/')[0];
      if(!(rel in T)) return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST205',message:`unstubbed view ${rel}`})});
      let body=T[rel]??[];
      for(const [k,v] of u.searchParams) if(v.startsWith('eq.')) body=body.filter(x=>String(x[k])===v.slice(3));
      const single=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      const payload=single?(body[0]??null):body;
      return route.fulfill({status:single&&!payload?406:200,contentType:'application/json',body:JSON.stringify(payload)});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  });
  return ctx;
}

let failures=0;
const check=(name,ok,detail='')=>{console.log(`${ok?'✓':'✗'} ${name}${detail?' — '+detail:''}`);if(!ok)failures++;};

const ctx=await authContext();
const page=await ctx.newPage();
for(const [name,path,heading] of pages){
  const errors=[];
  page.removeAllListeners('pageerror');
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://localhost:5199/#${path}`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(1400);
  const body=(await page.locator('body').innerText()).replace(/\s+/g,' ');
  const blocked=/This section could not be loaded/i.test(body);
  const blank=body.trim().length<80;
  const hasHeading=heading.test(body);
  check(name,!blocked&&!blank&&errors.length===0&&hasHeading,
    blocked?'data-unavailable modal':blank?'blank screen':errors[0]||(!hasHeading?'expected page content missing':''));
}
await ctx.close();

// Anonymous public dashboard smoke test using approved snapshot tables only.
const pub=await browser.newContext({viewport:{width:1365,height:900}});
const publicFixtures={
  public_portal_summary:[{project_count:1,overall_progress_pct:50,published_beneficiaries:10,total_investment_vuv:1000000,updated_at:'2026-09-12T00:00:00Z'}],
  public_portal_projects:[{id:'pub1',code:'PUB-1',name:'Published Project',provinces:['SANMA'],primary_climate_theme:'Adaptation',lifecycle_status:'ongoing',budget_vuv:1000000,progress_pct:50,published_beneficiaries:10}],
  public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Coast',project_count:1,project_ids:['pub1'],project_names:['Published Project']}],
  public_portal_kpis:[],
  public_portal_project_inventory:[{total_projects:20,approved_projects:1,other_projects:19}],
};
await pub.route(`${HOST}/**`,async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(p.startsWith('/rest/v1/')){
    const rel=p.replace('/rest/v1/','').split('/')[0];
    if(!(rel in publicFixtures)) return route.fulfill({status:403,contentType:'application/json',body:'{}'});
    const rows=publicFixtures[rel];
    const single=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]:rows)});
  }
  if(p.startsWith('/auth/v1/')) return route.fulfill({status:401,contentType:'application/json',body:'{}'});
  return route.fulfill({status:403,contentType:'application/json',body:'{}'});
});
const pp=await pub.newPage();
const publicErrors=[];
pp.on('pageerror',e=>publicErrors.push(String(e)));
await pp.goto('http://localhost:5199/#/dashboards',{waitUntil:'domcontentloaded',timeout:20000});
await pp.waitForTimeout(1400);
const pbody=(await pp.locator('body').innerText()).replace(/\s+/g,' ');
check('Public Dashboard',/Public Dashboard/i.test(pbody)&&!/This section could not be loaded/i.test(pbody)&&publicErrors.length===0,publicErrors[0]||'');
await pub.close();

await browser.close();
if(failures) process.exit(1);
console.log('Nine-page smoke audit passed.');
