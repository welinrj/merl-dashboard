// Public-only regression: approved snapshots, filtering, navigation, and sign-in boundary.
import { chromium } from 'playwright';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const projects = [
  {id:'pa',code:'PUB-1',name:'Coastal Resilience',provinces:['Sanma'],primary_climate_theme:'Coastal Resilience',lifecycle_status:'ongoing',budget_vuv:1000000,progress_pct:40,last_published_period:'Q1 2026',expected_primary_outcome:'Coastal communities are resilient'},
  {id:'pb',code:'PUB-2',name:'Water Security',provinces:['Torba'],primary_climate_theme:'Water Security',lifecycle_status:'completed',budget_vuv:2000000,progress_pct:100,last_published_period:'Q2 2026',expected_primary_outcome:'Reliable water supply'},
];
const fixtures = {
  public_portal_summary:[{project_count:2,overall_progress_pct:70,published_beneficiaries:120,total_investment_vuv:3000000,updated_at:'2026-07-01T00:00:00Z'}],
  public_portal_projects:projects,
  public_portal_area_councils:[{province:'Sanma',area_council:'Big Bay Coast',project_count:1,project_names:['Coastal Resilience']},{province:'Torba',area_council:'Torres',project_count:1,project_names:['Water Security']}],
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
    if(request.method() !== 'GET') return route.fulfill({status:403,body:'{}'});
    if(!(rel in fixtures)) return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'not available to anonymous users'})});
    const rows = fixtures[rel];
    const single = (request.headers().accept||'').includes('vnd.pgrst.object');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]:rows)});
  }
  if(url.pathname.startsWith('/auth/v1/')) return route.fulfill({status:401,contentType:'application/json',body:'{}'});
  return route.fulfill({status:403,body:'{}'});
});
// The coverage component has a documented error state when the external map service is offline.
await context.route('https://services.arcgis.com/**',route=>route.abort());
await context.route('https://unpkg.com/**',route=>route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5199/#/',{waitUntil:'domcontentloaded'});
await page.locator('.pbd-root .pbd-kpis').waitFor({timeout:15000});
check('anonymous visitor opens public dashboard',await page.getByRole('heading',{name:'Public Dashboard'}).count()===1);
check('approved project count is 2',await page.locator('.pbd-kpis').getByText('2',{exact:true}).count()===1);
check('approved beneficiaries are shown',await page.locator('.pbd-kpis').getByText('120',{exact:true}).count()===1);
check('approved progress is shown',await page.locator('.pbd-kpis').getByText('70%',{exact:true}).count()===1);
check('no internal editing or approval navigation',await page.getByRole('button',{name:/project setup|risk analysis|review & approval|administration/i}).count()===0);
await page.locator('.pbd-filters select').nth(2).selectOption('Sanma');
check('province filter reduces the portfolio',await page.locator('.pbd-kpis').getByText('1',{exact:true}).count()===1);
check('unsupported filtered beneficiaries are unavailable',await page.locator('.pbd-kpis').getByText('—',{exact:true}).count()>=1);
await page.getByRole('button',{name:'Reset',exact:true}).click();
check('reset restores published total',await page.locator('.pbd-kpis').getByText('2',{exact:true}).count()===1);
await page.locator('.pbd-search input').fill('Water Security');
check('search filters published projects',await page.locator('.pbd-kpis').getByText('1',{exact:true}).count()===1);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Projects'}).click();
await page.getByRole('button',{name:/Coastal Resilience PUB-1/i}).click();
check('published project details open',await page.getByRole('heading',{name:'Published project details'}).count()===1);
await page.getByRole('button',{name:'Back to projects'}).click();
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Results'}).click();
check('public results navigation works',await page.getByRole('heading',{name:'Results',exact:true}).count()>0);
await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:'Geographic Coverage'}).click();
check('coverage navigation works',await page.locator('.pub-leaflet-wrap').count()===1);
check('no browser exception',errors.length===0);
check('public dashboard reads only approved snapshot tables',reads.filter(x=>x.startsWith('public_portal_')).every(x=>x in fixtures));
await page.getByRole('link',{name:'Sign in to MERL'}).first().click();
check('sign-in opens existing protected login',new URL(page.url()).hash.startsWith('#/login'));
await page.setViewportSize({width:390,height:844});
await page.goto('http://localhost:5199/#/');
await page.locator('.pbd-root .pbd-kpis').waitFor({timeout:15000});
check('mobile has no page-wide horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
await page.getByRole('button',{name:'Open menu'}).click();
check('mobile menu opens',await page.locator('.pbd-root .dsh-side.open').count()===1);
await page.getByRole('button',{name:'Close menu'}).click();
check('mobile menu closes',await page.locator('.pbd-root .dsh-side.open').count()===0);
await browser.close();
if(failures) process.exit(1);
console.log('Public dashboard browser checks passed.');
