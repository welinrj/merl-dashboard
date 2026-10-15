// Regression for the user-approved 21st.dev hierarchy: title, chart with its
// value inside, context, and destination. No production data is modified.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
mkdirSync('qa-artifacts', { recursive: true });

const REF = 'ndntvncboeajanipafeq';
const HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(([ref, token, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: token, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);
await context.route(`${HOST}/**`, async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (path.endsWith('/rpc/current_profile')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'u1', full_name: 'Admin', role: 'system_admin' }]) });
  if (path.startsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (path.startsWith('/rest/v1/')) {
    const rel = path.replace('/rest/v1/', '').split('/')[0];
    let rows = fixture[rel] ?? [];
    for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter((row) => String(row[key]) === value.slice(3));
    if ((route.request().headers()['accept'] || '').includes('vnd.pgrst.object')) {
      const one = rows[0] ?? null;
      return route.fulfill({ status: one ? 200 : 406, contentType: 'application/json', body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});


let failCore = true, failRollup = true, failDocuments = false, saves = [];
const answer = (route, body, status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
const indicator = { ...fixture.v_project_indicators[0], id:'i1', code:'IND-01', name:'Restore reefs and coastal ecosystems across every participating community using verified monitoring data and community-led restoration', framework_node_id:'out', i18n:{fr:{name:'Restaurer les récifs et les écosystèmes côtiers'}} };
let progress = [{id:'g1',indicator_id:'i1',project_id:'pa',reporting_period:'Q2',cumulative_actual:20,achievement_pct:20,review_status:'submitted',period_end:'2026-06-30'}];
let targets=[];
await context.route('**/rpc/list_results_framework_editable_projects', r=>answer(r,[{project_id:'pa'}]));
await context.route('**/rest/v1/v_framework_nodes*', r=>failCore?answer(r,{message:'Test read failed'},500):answer(r,[{id:'out',project_id:'pa',node_type:'outcome',title:'Healthy reefs',node_code:'OC1'}]));
await context.route('**/rest/v1/v_project_indicators*', r=>answer(r,[indicator,{...indicator,id:'i2',code:'IND-02',name:'Second indicator'}]));
await context.route('**/rest/v1/v_indicator_progress*', r=>answer(r,progress));
await context.route('**/rest/v1/v_indicator_targets*', r=>answer(r,targets));
await context.route('**/rest/v1/v_reporting_periods*', r=>answer(r,[{project_id:'pa',period_label:'Q2',period_end:'2026-06-30',period_type:'quarterly',submission_status:'draft'}]));
await context.route('**/rest/v1/v_project_activities*', r=>answer(r,[{id:'a',project_id:'pa',framework_node_id:'out',code:'ACT-01',name:'Restore coastal buffer',status:'in_progress'}]));
await context.route('**/rest/v1/v_indicator_evidence_status*', r=>failRollup?answer(r,{message:'Test evidence read failed'},500):answer(r,[]));
await context.route('**/rest/v1/v_evidence*', r=>{
 const url=new URL(r.request().url());
 if(url.pathname.endsWith('/v_evidence_analysis'))return answer(r,[]);
 if(failDocuments)return answer(r,{message:'Test document read failed'},500);
 return answer(r,url.searchParams.get('indicator_id')==='eq.i1'?[{id:'doc',title:'First indicator document',file_url:'https://example.com/report.pdf'}]:[]);
});
await context.route('**/rpc/patch_results_framework_row', async r=>{
 const args=r.request().postDataJSON();saves.push(args);
 if(args.p_changes.progress){progress=progress.map(g=>g.id===args.p_progress_id?{...g,...args.p_changes.progress,review_status:'draft'}:g);}
 if(args.p_changes.targets)targets=args.p_changes.targets.map(t=>({...t,id:t.id||'t',indicator_id:args.p_indicator_id}));
 return answer(r,null);
});
try {
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5199/#/results-framework');
 const coreError=page.getByRole('alert').filter({hasText:'Results could not be loaded.'});
 await coreError.waitFor();
 if(await coreError.getByRole('button',{name:'Retry',exact:true}).count()!==1)throw new Error('Core error has no retry action');
 failCore=false;
 // Genuine transport failures retain the portal-wide guard and its recovery.
 await page.getByRole('alertdialog').getByRole('button').click();
 await page.locator('.rf2-table').waitFor();
 await page.locator('.rf2-desktop-activities').getByText('ACT-01 — Restore coastal buffer',{exact:true}).waitFor();
 const clamp=await page.locator('.rf2-indicator b').first().evaluate(el=>getComputedStyle(el).webkitLineClamp);
 if(clamp!=='none')throw new Error('Indicator text is clipped');
 const rollupError=page.getByRole('alert').filter({hasText:'Evidence could not be loaded.'});
 await rollupError.waitFor();failRollup=false;
 await rollupError.getByRole('button',{name:'Retry',exact:true}).click();
 await rollupError.waitFor({state:'hidden'});
 await page.screenshot({animations:'disabled',path:'qa-artifacts/header-results-audit-desktop.png'});
 await page.setViewportSize({width:360,height:800});
 const card=page.locator('.rf2-result-card').first();await card.waitFor();
 await card.getByRole('button',{name:'Edit Latest actual: IND-01',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Latest actual',{exact:true}).fill('25');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 const working=page.locator('.rf2-result-card').first().locator('.rf2-working');
 await working.getByText('Saved draft · Q2',{exact:true}).waitFor();
 await working.locator('summary').click();
 await working.getByRole('button',{name:'Edit Latest actual',exact:true}).click();
 if(await dialog.getByLabel('Latest actual',{exact:true}).inputValue()!=='25')throw new Error('Draft did not resume saved value');
 await dialog.getByLabel('Latest actual',{exact:true}).fill('30');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
 if(saves.slice(0,2).some(s=>s.p_progress_id!=='g1'))throw new Error('Draft resume created a new progress record');
 await page.locator('.rf2-result-card').first().getByRole('button',{name:'Edit Final target: IND-01',exact:true}).click();
 await dialog.getByLabel('Content',{exact:true}).fill('1,000.5');
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.rf2-result-card').first().getByRole('button',{name:'Edit Final target: IND-01',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('.rf2-edit-dialog textarea')?.value === '1,000.5',null,{timeout:5000});
 if(await dialog.getByLabel('Content',{exact:true}).inputValue()!=='1,000.5')throw new Error('Closing lost local draft');
 await page.reload();await page.locator('.rf2-result-card').first().waitFor();
 await page.locator('.rf2-result-card').first().getByRole('button',{name:'Edit Final target: IND-01',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('.rf2-edit-dialog textarea')?.value === '1,000.5',null,{timeout:5000});
 if(await dialog.getByLabel('Content',{exact:true}).inputValue()!=='1,000.5')throw new Error('Reload lost local draft');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'hidden'});
 if(saves.at(-1).p_changes.targets[0].numeric_value!==1000.5)throw new Error('Formatted target not numeric');
 await page.locator('.rf2-result-card').first().getByRole('button',{name:'View evidence',exact:true}).click();
 await page.locator('.evi-panel').getByText('First indicator document',{exact:true}).waitFor();
 failDocuments=true;
 await page.locator('.rf2-result-card').nth(1).getByRole('button',{name:'View evidence',exact:true}).click();
 const evidencePanel=page.locator('.evi-panel');await evidencePanel.getByRole('alert').waitFor();
 if(await evidencePanel.getByText('First indicator document',{exact:true}).count())throw new Error('Old indicator documents leaked into failed selection');
 failDocuments=false;await evidencePanel.getByRole('button',{name:'Retry',exact:true}).click();
 await evidencePanel.locator('.evi-empty').waitFor();
 await page.screenshot({animations:'disabled',path:'qa-artifacts/header-results-audit-phone.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.locator('.dsh-lang button[lang=fr]').click();
 await page.getByRole('heading',{name:'Cadre de résultats',exact:true}).waitFor();
 await page.getByRole('button',{name:'Modifier : Indicateur: IND-01',exact:true}).click();
 if(await dialog.getByLabel('Contenu',{exact:true}).inputValue()!==indicator.name)throw new Error('French editor opened translated source');
 await dialog.getByLabel('Unité',{exact:true}).fill('sites');
 await dialog.getByRole('button',{name:'Enregistrer',exact:true}).click();await dialog.waitFor({state:'hidden'});
 if(saves.at(-1).p_changes.indicator.name!==indicator.name)throw new Error('French unit edit overwrote original name');
 await page.screenshot({animations:'disabled',path:'qa-artifacts/header-results-audit-french.png'});
 if(errors.length)throw new Error(errors.join('; '));
 console.log('PASS Results retry, target formatting, source-language preservation, draft resume/reload, evidence failure isolation, desktop activities and full indicator text');
} finally {await browser.close();}
