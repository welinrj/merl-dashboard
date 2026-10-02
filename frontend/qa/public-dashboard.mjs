// Public regression: one overview, public snapshot reads, finance, locations and filters.
import { chromium } from 'playwright';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const projects = [
  {id:'pa',code:'PUB-1',name:'Coastal Resilience',project_manager:'Lina Kalo',provinces:['SANMA'],primary_climate_theme:'Adaptation',docc_themes:['Adaptation','Mitigation'],lifecycle_status:'ongoing',budget_vuv:1000000,cumulative_expenditure_vuv:300000,utilisation_pct:30,progress_pct:40,published_beneficiaries:50,last_published_period:'2026 Q2',expected_primary_outcome:'Coastal communities are resilient',docc_image_url:'/project-images/vcap2.webp'},
  {id:'pb',code:'PUB-2',name:'Water Security',project_manager:'Tom Nalo',provinces:['TORBA','SANMA'],primary_climate_theme:'Water Security',lifecycle_status:'completed',budget_vuv:2000000,cumulative_expenditure_vuv:600000,utilisation_pct:30,progress_pct:100,published_beneficiaries:70,expected_primary_outcome:'Reliable water supply'},
];
const fixtures = {
  public_portal_summary:[{project_count:2,overall_progress_pct:70,published_beneficiaries:120,total_investment_vuv:3000000,total_utilised_vuv:900000,financial_utilisation_pct:30,updated_at:'2026-07-01T00:00:00Z'}],
  public_portal_projects:projects,
  public_portal_area_councils:[{province:'SANMA',area_council:'Big Bay Coast',project_count:2,project_ids:['pa','pb'],project_names:['Coastal Resilience','Water Security']},{province:'SANMA',area_council:'South Santo One (1)',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'SANMA',area_council:'South Santo Two (2)',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'MALAMPA',area_council:'West Ambrym',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'TORBA',area_council:'Mota Lava',project_count:1,project_ids:['pa'],project_names:['Coastal Resilience']},{province:'TORBA',area_council:'Torres',project_count:1,project_ids:['pb'],project_names:['Water Security']}],
  public_portal_kpis:[],
  public_portal_indicator_categories:[{project_id:'pa',category_key:'ecosystems',indicator_count:3},{project_id:'pa',category_key:'capacity',indicator_count:2},{project_id:'pb',category_key:'finance',indicator_count:4}],
  public_portal_indicator_details:[{indicator_id:'i1',project_id:'pa',project_name:'Coastal Resilience',category_key:'ecosystems',indicator_code:'COAST-1',indicator_name:'Mangrove restoration',target_value:20,unit:'ha'},{indicator_id:'i3',project_id:'pa',project_name:'Coastal Resilience',category_key:'capacity',indicator_code:'COAST-2',indicator_name:'Community training',target_value:null,target_text:null},{indicator_id:'i2',project_id:'pb',project_name:'Water Security',category_key:'finance',indicator_code:'WATER-1',indicator_name:'Financing arrangements',target_value:null,target_text:null}],
};
let failures = 0;
const check = (name, ok) => {console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failures++;};
const browser = await chromium.launch();
const context = await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(() => {localStorage.setItem('merl.lang','en');});
const reads = [];
await context.route(`${HOST}/**`, async route => {
  const request = route.request(), url = new URL(request.url());
  if(url.pathname.startsWith('/rest/v1/')) {
    const rel = url.pathname.split('/').pop(); reads.push(rel);
    if(request.method() !== 'GET' || !(rel in fixtures)) return route.fulfill({status:403,body:'{}'});
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
const go = async path => {await page.goto(`http://127.0.0.1:5199/${path}`,{waitUntil:'domcontentloaded'});await page.locator('.pbd-root .pbd-metrics').waitFor({timeout:15000});};
const metrics = page.locator('.pbd-metrics');
const hasMetric = async value => await metrics.getByText(value,{exact:true}).count()>=1;
try {
await go('');
check('bare URL resolves to the shared dashboard',new URL(page.url()).hash==='#/dashboards');
check('anonymous visitor sees one public overview',await page.getByRole('heading',{name:'Public Overview'}).count()===1);
check('sidebar contains only one public destination',await page.locator('.pbd-root .dsh-nav button').count()===1);
check('separate Projects and Results public pages are removed',await page.locator('.pbd-root .dsh-nav').getByRole('button',{name:/^(Projects|Results)$/}).count()===0);
check('only unfinished project count is shown',await hasMetric('1'));
check('only unfinished project funding is shown',await hasMetric('VT 1,000,000'));
check('only unfinished project utilisation is shown',await hasMetric('VT 300,000') && await hasMetric('30%'));
check('only unfinished project beneficiaries are shown',await hasMetric('50'));
check('only unfinished project cards are on the overview',await page.locator('.pbd-project-card').count()===1);
check('completed projects and their status filter are hidden',await page.getByRole('heading',{name:'Water Security'}).count()===0 && await page.locator('.pbd-filters select').first().locator('option[value="completed"]').count()===0);
check('project image is shown beside its matching name',await page.getByRole('heading',{name:'Coastal Resilience'}).locator('xpath=ancestor::header').locator('img[src$="/project-images/vcap2.webp"]').count()===1);
check('unfinished project managers are visible',await page.getByText('Lina Kalo',{exact:true}).count()===1 && await page.getByText('Tom Nalo',{exact:true}).count()===0);
check('all official themes are shown for multi-theme projects',await page.getByText('Adaptation, Mitigation',{exact:true}).count()===1);
check('implementation areas are visible',await page.getByRole('heading',{name:'Area Councils'}).count()===1 && await page.getByRole('button',{name:/Big Bay Coast/}).count()===1);
const areaFlap = page.getByRole('button',{name:/Big Bay Coast/}).locator('.pbd-area-flap-face');
check('Area Council names use the split-flap display',await areaFlap.count()===1 && (await areaFlap.evaluate(node=>getComputedStyle(node).animationName)).includes('pbd-area-flap'));
const autoAreaBefore = await page.locator('.pbd-area-list>button.is-auto-current').getAttribute('data-area-index');
await page.clock.fastForward(3300);
const autoAreaAfter = await page.locator('.pbd-area-list>button.is-auto-current').getAttribute('data-area-index');
check('Area Council directory advances automatically',autoAreaBefore!==autoAreaAfter);
await page.getByRole('button',{name:'Pause',exact:true}).click();
const pausedAreaIndex = await page.locator('.pbd-area-list>button').evaluateAll(rows=>rows.findIndex(row=>row.classList.contains('is-auto-current')));
await page.clock.fastForward(6500);
check('Area Council pause control stops automatic movement',await page.locator('.pbd-area-list>button').evaluateAll((rows,index)=>rows.findIndex(row=>row.classList.contains('is-auto-current'))===index,pausedAreaIndex));
await page.getByRole('button',{name:'Resume',exact:true}).click();
check('map legend categorises recorded areas by official themes',await page.locator('.pub-map-key').getByText('Areas by official thematic area',{exact:true}).count()===1 && await page.locator('.pub-map-key').getByText('Adaptation & Mitigation',{exact:true}).count()===1 && await page.locator('.pub-map-key').getByText('Theme not recorded',{exact:true}).count()===1);
check('only unfinished-project indicator categories and totals are shown',await page.getByText('What project indicators cover',{exact:true}).count()===1 && await page.locator('.pbd-activity-category').count()===2 && await page.locator('.pbd-activity-section').getByText('5 indicators',{exact:true}).count()===1);
await page.locator('.pbd-activity-ecosystems').click();
check('category opens activity, target and implementing project',await page.locator('.pbd-activity-details').getByText('Mangrove restoration').count()===1 && await page.locator('.pbd-activity-details').getByText('20 ha').count()===1 && await page.locator('.pbd-activity-details').getByText('Coastal Resilience').count()===1);
await page.locator('.pbd-activity-capacity').click();
check('missing targets are identified without inventing values',await page.locator('.pbd-activity-details').getByText('Not recorded').count()===1);
await page.locator('.pbd-filters select').nth(1).selectOption('Mitigation');
check('theme filter includes a project under either official theme',await page.locator('.pbd-project-card').count()===1 && await page.getByRole('heading',{name:'Coastal Resilience'}).count()===1);
check('indicator category totals follow the selected projects',await page.locator('.pbd-activity-category').count()===2 && await page.locator('.pbd-activity-section').getByText('5 indicators',{exact:true}).count()===1);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.locator('.pbd-filters select').nth(2).selectOption('Torba');
check('province filter never restores a completed project',await page.locator('.pbd-project-card').count()===0 && await page.getByRole('heading',{name:'Water Security'}).count()===0);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.locator('.pbd-search input').fill('Coastal Resilience');
check('search filters projects on the same page',await page.locator('.pbd-project-card').count()===1);
await page.getByRole('button',{name:'Reset',exact:true}).click();
await page.getByRole('button',{name:/Big Bay Coast/}).click();
check('area selection filters the same unfinished-project overview',await page.getByText(/Showing projects recorded in/).count()===1 && await page.locator('.pbd-project-card').count()===1);
await page.getByRole('button',{name:'Clear area selection'}).click();
fixtures.public_portal_summary[0] = {...fixtures.public_portal_summary[0],published_beneficiaries:150,updated_at:'2026-09-08T08:01:00Z'};
fixtures.public_portal_projects[0] = {...fixtures.public_portal_projects[0],published_beneficiaries:80};
const beforeRefresh = reads.filter(x=>x==='public_portal_summary').length;
await page.clock.fastForward(61_000);
await page.waitForFunction(() => [...document.querySelectorAll('.pbd-metric strong')].some(node => node.textContent?.trim() === '80'),null,{timeout:15000});
check('unfinished-project figures refresh without a page reload',await hasMetric('80'));
check('automatic refresh reads the snapshot again',reads.filter(x=>x==='public_portal_summary').length>beforeRefresh);
check('anonymous reads use only public snapshot tables',reads.every(x=>x in fixtures));
check('no browser exception',errors.length===0);
check('header contains one credentials form',await page.locator('.pbd-root .dsh-head form.pbd-header-login').count()===1);
await page.goto('http://127.0.0.1:5199/#/project-setup',{waitUntil:'domcontentloaded'});
await page.locator('.pbd-root .pbd-metrics').waitFor({timeout:15000});
check('anonymous private route returns to the one public overview',new URL(page.url()).hash==='#/dashboards');
for(const width of [1024,768,390,360,320]) {
  await page.setViewportSize({width,height:844});
  await go('#/dashboards');
  check(`${width}px: no page-wide horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
  if(width<=760) {
    const menu=page.getByRole('button',{name:'Open menu'});
    await menu.click();
    check(`${width}px: mobile menu opens`,await page.locator('.pbd-root .dsh-side.open').count()===1);
    await page.getByRole('button',{name:'Close menu'}).click();
    check(`${width}px: mobile menu closes`,await page.locator('.pbd-root .dsh-side.open').count()===0);
  }
}
} finally { await browser.close(); }
if(failures) process.exit(1);
console.log('Public overview browser checks passed.');
