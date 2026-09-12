// Public regression: shared entry, aggregate inventory, approved data, refresh, filters and access.
import { chromium } from 'playwright';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const projects = [
  {id:'pa',code:'PUB-1',name:'Coastal Resilience',provinces:['SANMA'],primary_climate_theme:'Coastal Resilience',lifecycle_status:'ongoing',budget_vuv:1000000,progress_pct:40,published_beneficiaries:50,last_published_period:'Q1 2026',expected_primary_outcome:'Coastal communities are resilient'},
  {id:'pb',code:'PUB-2',name:'Water Security',provinces:['TORBA','SANMA'],primary_climate_theme:'Water Security',lifecycle_status:'completed',budget_vuv:2000000,progress_pct:100,published_beneficiaries:70,last_published_period:'Q2 2026',expected_primary_outcome:'Reliable water supply'},
];
const fixtures = {
  public_portal_summary:[{project_count:2,overall_progress_pct:70,published_beneficiaries:120,total_investment_vuv:3000000,updated_at:'2026-07-01T00:00:00Z'}],
  public_portal_projects:projects,
  public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Coast',project_count:2,project_ids:['pa','pb'],project_names:['Coastal Resilience','Water Security']},{province:'TORBA',area_council:'Torres',project_count:1,project_ids:['pb'],project_names:['Water Security']}],
  public_portal_project_inventory:[{total_projects:24,approved_projects:12,other_projects:12}],
};
let failures = 0;
const check = (name, ok) => {console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failures++;};
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(() => {localStorage.setItem('merl.lang','en');});
const reads = [];
await context.route(`${HOST}/**`, async route => {
  const request = route.request(), url = new URL(request.url());
  if(url.pathname.startsWith('/rest/v1/')) {
    const rel = url.pathname.split('/').pop(); reads.push(rel);
    if(request.method() !== 'GET' && !(rel==='public_portal_project_inventory' && request.method()==='POST')) return route.fulfill({status:403,body:'{}'});
    if(!(rel in fixtures)) return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'not available to anonymous users'})});
    const rows = fixtures[rel];
    const single = (request.headers().accept||'').includes('vnd.pgrst.object');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]:rows)});
  }
  if(url.pathname.startsWith('/auth/v1/')) return route.fulfill({status:401,contentType:'application/json',body:'{}'});
  return route.fulfill({status:403,body:'{}'});
});
await context.route('https://services.arcgis.com/**',route=>route.abort());
await context.route('https://unpkg.com/**',route=>route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-09-08T08:00:00Z')});
const go = async path => {await page.goto(`http://localhost:5199/${path}`,{waitUntil:'domcontentloaded'});await page.locator('.pbd-root .pbd-kpis').waitFor({timeout:15000});};
const kpis = page.locator('.pbd-kpis');
const has = async value => await kpis.getByText(value,{exact:true}).count()>=1;
const waitForKpis = async values => {
  try {
    await page.waitForFunction(expected => expected.every(value => [...document.querySelectorAll('.pbd-kpis .kpi-card-value')].some(node => node.textContent?.trim() === value)),values,{timeout:15000});
    return true;
  } catch {
    console.log('KPI reconciliation diagnostic:', await kpis.locator('.kpi-card-value').allTextContents());
    return false;
  }
};
try {
await go('');
check('bare URL resolves to the shared dashboard',new URL(page.url()).hash==='#/dashboards');
check('anonymous visitor sees public dashboard',await page.getByRole('heading',{name:'Public Dashboard'}).count()===1);
check('inventory counts all 24 records',await has('24'));
check('inventory distinguishes approved and other records',await kpis.getByText(/12 approved for public view.*12 other \/ demo/).count()===1);
check('approved beneficiaries are shown',await has('120'));
check('approved progress is shown',await has('70%'));
check('no internal editing or approval navigation',await page.getByRole('button',{name:/project setup|risk analysis|review & approval|administration/i}).count()===0);
const provinceChart = page.locator('.pbd-root .pbd-bars').first();
const provinceCount = async name => provinceChart.locator('.pbd-bar-row').filter({has:page.locator('span').filter({hasText:new RegExp(`^${name}$`)})}).locator('strong').textContent();
check('uppercase province records populate the chart',await provinceCount('Sanma')==='2' && await provinceCount('Torba')==='1');
check('coverage counts distinct provinces',await page.locator('.pbd-summary').first().getByText('2 / 6',{exact:true}).count()===1);
await provinceChart.getByRole('button',{name:/Torba/}).click();
check('province chart drills down to matching projects',await page.locator('.pdir-item').filter({hasText:'Water Security'}).count()===1);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await go('?utm_source=chatgpt.com#/dashboards');
check('requested tracked URL opens the same public dashboard',await page.getByRole('heading',{name:'Public Dashboard'}).count()===1);
await go('#/public');
check('old public bookmark resolves to the shared entry',new URL(page.url()).hash==='#/dashboards');
await go('#/dashboards');
await page.locator('.pbd-filters select').nth(2).selectOption('Sanma');
check('province filter reduces the portfolio',await has('2'));
check('filtered progress uses published project results',await has('70%'));
check('filtered beneficiaries use published project results',await has('120'));
check('filtered investment uses selected projects',await has('VT 3,000,000'));
await page.getByRole('button',{name:'Reset',exact:true}).click();
check('reset restores inventory and published results',await has('24') && await has('120'));
await page.locator('.pbd-search input').fill('Water Security');
check('search filters published projects',await has('1'));
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Projects'}).click();
await page.locator('.pdir-item').filter({hasText:'Coastal Resilience'}).getByRole('button',{name:/About this project/}).click();
check('published project details open',await page.getByRole('heading',{name:'Published project details'}).count()===1);
await page.getByRole('button',{name:'Back to projects'}).click();
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Results'}).click();
check('public results navigation works',await page.getByRole('heading',{name:'Results',exact:true}).count()>0);
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Public Overview'}).click();
fixtures.public_portal_summary[0] = {...fixtures.public_portal_summary[0],overall_progress_pct:80,published_beneficiaries:150,updated_at:'2026-09-08T08:01:00Z'};
fixtures.public_portal_projects[0] = {...fixtures.public_portal_projects[0],progress_pct:60,published_beneficiaries:80};
const beforeRefresh = reads.filter(x=>x==='public_portal_summary').length;
await page.clock.fastForward(61_000);
check('approved results update together without page reload',await waitForKpis(['80%','150']));
check('automatic refresh reads the approved snapshot again',reads.filter(x=>x==='public_portal_summary').length>beforeRefresh);
await page.locator('.pbd-filters select').nth(2).selectOption('Sanma');
check('refreshed filtered values reconcile',await waitForKpis(['80%','150']));
await page.getByRole('button',{name:'Reset',exact:true}).click();
check('manual refresh remains available',await page.getByRole('button',{name:'Refresh',exact:true}).count()===1);
check('anonymous reads use only approved snapshots and aggregate inventory',reads.every(x=>x in fixtures));
check('no browser exception',errors.length===0);
check('header contains one credentials form',await page.locator('.pbd-root .dsh-head form.pbd-header-login').count()===1);
check('public page has no duplicate sign-in links',await page.locator('.pbd-root a[href="#/login"]').count()===0);
await page.goto('http://localhost:5199/#/login',{waitUntil:'domcontentloaded'});
await page.locator('.lg2-root').waitFor({timeout:15000});
check('existing protected login remains available',new URL(page.url()).hash==='#/login');
await page.getByRole('link',{name:'Back to public dashboard'}).click();
await page.locator('.pbd-root .pbd-kpis').waitFor({timeout:15000});
check('back to public uses the shared route',new URL(page.url()).hash==='#/dashboards');
await page.goto('http://localhost:5199/#/project-setup',{waitUntil:'domcontentloaded'});
await page.locator('.lg2-root').waitFor({timeout:15000});
check('anonymous private route requires login',await page.locator('.lg2-root').count()===1);
check('anonymous private route does not render workspace',await page.locator('.dsh-main .ovx-kpis').count()===0);
for(const width of [1024,768,390,360,320]) {
  await page.setViewportSize({width,height:844});
  await go('#/dashboards');
  check(`${width}px: no page-wide horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
  if(width<=760) {
    const menu=page.getByRole('button',{name:'Open menu'});
    check(`${width}px: menu is not covered by the login`,await menu.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===el||el.contains(hit);}));
    await menu.click();
    check(`${width}px: mobile menu opens`,await page.locator('.pbd-root .dsh-side.open').count()===1);
    await page.getByRole('button',{name:'Close menu'}).click();
    check(`${width}px: mobile menu closes`,await page.locator('.pbd-root .dsh-side.open').count()===0);
  }
}
} finally { await browser.close(); }
if(failures) process.exit(1);
console.log('Public dashboard browser checks passed.');
