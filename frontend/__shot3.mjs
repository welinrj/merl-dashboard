import { chromium } from 'playwright';
const REF='ndntvncboeajanipafeq', HOST=`https://${REF}.supabase.co`;
const now=Math.floor(Date.now()/1000);
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',email:'meo@docc.gov.vu',role:'authenticated',aud:'authenticated',iat:now,exp:now+99999})}.sig`;
const P={id:'p1',code:'VCRP-001',name:'Vanuatu Coastal Resilience Programme',status:'at_risk',
  category:'Climate Change Adaptation',project_type:'Adaptation',donor:'GCF',currency:'VUV',
  budget_vuv:480000000,spent_vuv:210000000,start_date:'2025-01-01',end_date:'2027-12-31',
  provinces:['SHEFA','TAFEA'],coverage_type:'Multi-Province',lead_agency:'DoCC',registration_status:'approved'};
const T={
 v_projects:[P],
 v_project_indicators:[{id:'i1',project_id:'p1',code:'IND-01',name:'Households with a climate plan',indicator_level:'outcome',frequency:'Quarterly',baseline_value:120,target_value:900,unit:'households'}],
 v_indicator_progress:[{id:'g1',project_id:'p1',indicator_id:'i1',indicator_code:'IND-01',indicator_name:'Households with a climate plan',reporting_period:'Q2 2026',period_target:400,cumulative_actual:260,final_target:900,achievement_pct:65,performance_status:'attention_required'}],
 v_project_activities:[{id:'a1',project_id:'p1',code:'ACT-01',name:'Community planning workshops',status:'in_progress',output_code:'OUT-01',planned_start_date:'2026-01-05',planned_end_date:'2026-03-31',physical_progress_pct:55}],
 v_risks_issues:[{id:'r1',project_id:'p1',code:'RSK-01',type:'risk',category:'environmental',description:'Cyclone season delays coastal works',likelihood:4,impact:4,risk_rating:'high',status:'monitoring',due_date:'2026-09-30',mitigation:'Pre-position materials before November'}],
 v_reporting_periods:[{id:'rp1',project_id:'p1',period_label:'Q2 2026',period_type:'quarterly',period_start:'2026-04-01',period_end:'2026-06-30',submission_status:'submitted',submitted_at:'2026-07-04T02:00:00Z',reporting_officer_name:'Marie Tari',review_comments:null}],
 v_beneficiaries:[{id:'b1',project_id:'p1',reporting_period:'Q2 2026',total_direct:3120,female:1680,male:1400,youth:640,persons_with_disability:95}],
 v_financial_progress:[{id:'f1',project_id:'p1',reporting_period:'Q2 2026',cumulative_expenditure:210000000,period_expenditure:64000000}],
};
const shots=process.argv[3].split(',').map(s=>s.split('|'));
const lng=process.argv[2];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.addInitScript(([l,ref,tok,exp])=>{
  localStorage.setItem('merl.lang',l);
  localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify({access_token:tok,token_type:'bearer',expires_in:99999,expires_at:exp,refresh_token:'r',user:{id:'u1',email:'meo@docc.gov.vu',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}}));
},[lng,REF,jwt,now+99999]);
await ctx.route(`${HOST}/**`, async (r)=>{
  const p=new URL(r.request().url()).pathname;
  let body=[];
  if(p.endsWith('/rpc/current_profile')) body=[{id:'u1',email:'meo@docc.gov.vu',full_name:'DoCC M&E Officer',role:'docc_me_officer'}];
  else if(p.startsWith('/auth/v1/user')) body={id:'u1',email:'meo@docc.gov.vu',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'};
  else if(p.startsWith('/rest/v1/')) body=T[p.replace('/rest/v1/','').split('/')[0]]??[];
  await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const page=await ctx.newPage();
const errs=[];
page.on('pageerror',e=>errs.push(String(e.stack||e).slice(0,700)));
for(const [path,h,name] of shots){
  await page.setViewportSize({width:1440,height:Number(h)});
  await page.goto(`http://localhost:5199/#${path}`,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForTimeout(2500);
  await page.screenshot({path:`/tmp/i18ntool/${name}-${lng}.png`});
  const txt=(await page.locator('body').innerText().catch(()=>'')).slice(0,220).replace(/\s+/g,' ');
  console.log(`${lng} ${path.padEnd(19)} url=${page.url().replace('http://localhost:5199','')} ${errs.length?'ERR '+errs.join(';'):'ok'} :: ${txt}`);
  errs.length=0;
}
await b.close();
