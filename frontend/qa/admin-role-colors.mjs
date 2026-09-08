import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// All requests use controlled fixtures. No production accounts or data are changed.
const REF = 'ndntvncboeajanipafeq';
const HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+99999})}.sig`;
const users = [
  {id:'u1',full_name:'Test Administrator',email:'admin@example.test',role:'system_admin',organisation:'DoCC',active:true,has_login:true},
  {id:'u2',full_name:'Test M&E Officer',email:'meo@example.test',role:'docc_me_officer',organisation:'DoCC',active:true,has_login:true},
  {id:'u3',full_name:'Test Manager',email:'manager@example.test',role:'project_manager',organisation:'Project',active:true,has_login:true},
  {id:'u4',full_name:'Test Viewer',email:'viewer@example.test',role:'viewer',organisation:'DoCC',active:true,has_login:true},
];
const expected = {admin:'rgb(255, 241, 242)',meo:'rgb(239, 246, 255)',manager:'rgb(239, 250, 245)',viewer:'rgb(248, 250, 252)'};
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
try {
  const ctx = await browser.newContext({viewport:{width:1280,height:900}});
  await ctx.addInitScript(([ref,token,exp]) => {
    localStorage.setItem('merl.lang','en');
    localStorage.setItem(`sb-${ref}-auth-token`,JSON.stringify({access_token:token,token_type:'bearer',expires_in:99999,expires_at:exp,refresh_token:'r',user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}}));
  },[REF,jwt,now+99999]);
  await ctx.route(`${HOST}/**`,async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body = [];
    if(path.endsWith('/rpc/current_profile')) body = [{id:'u1',full_name:'Test Administrator',email:'admin@example.test',role:'system_admin'}];
    else if(path.startsWith('/auth/v1/user')) body = {id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'};
    else if(path.startsWith('/rest/v1/v_admin_users')) body = users;
    else if(path.startsWith('/rest/v1/v_my_permissions')) body = [{code:'admin.users'},{code:'admin.manage'}];
    if((route.request().headers()['accept']||'').includes('vnd.pgrst.object')) {
      const one = Array.isArray(body) ? body[0] ?? null : body;
      return route.fulfill({status:one?200:406,contentType:'application/json',body:JSON.stringify(one)});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:5199/#/admin',{waitUntil:'domcontentloaded'});
  const table = page.locator('section.adt').first();
  await table.locator('.adt-row-group').first().waitFor({timeout:20000});
  assert.equal(await table.locator('.adt-row-group').count(),4);
  for(const [tone,background] of Object.entries(expected)) {
    const row = table.locator(`tbody[data-user-role="${tone}"]`);
    assert.equal(await row.count(),1,`${tone} row exists`);
    const cell = row.locator('tr').first().locator('td').first();
    const before = await cell.evaluate(el => ({background:getComputedStyle(el).backgroundColor,accent:getComputedStyle(el).boxShadow}));
    assert.equal(before.background,background,`${tone} background`);
    assert.match(before.accent,/inset/,`${tone} accent`);
    await cell.hover();
    const hovered = await cell.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(hovered,background,`${tone} hover remains visible`);
    await page.mouse.move(0,0);
  }
  await table.locator('.adt-filter select').first().selectOption('project_manager');
  assert.equal(await table.locator('.adt-row-group').count(),1);
  assert.equal(await table.locator('tbody[data-user-role="manager"]').count(),1);
  await table.locator('.adt-search input').fill('no matching user');
  assert.equal(await table.locator('.adt-row-group').count(),0);
  await table.locator('.adt-search input').fill('');
  const manager = table.locator('tbody[data-user-role="manager"]');
  await manager.locator('input[type="checkbox"]').check();
  assert.equal(await manager.locator('input[type="checkbox"]').isChecked(),true);
  // The selected checkbox has focus, so the row correctly retains its focus tint.
  // Move both focus and pointer outside the row before testing its resting colour.
  await table.locator('.adt-search input').focus();
  await page.mouse.move(0,0);
  assert.equal(await manager.locator('td').first().evaluate(el=>getComputedStyle(el).backgroundColor),expected.manager);
  await manager.locator('summary').click();
  assert.ok(await manager.locator('.adt-row-menu-list button').count()>0,'row actions remain available');
  await ctx.close();
  console.log('PASS: four role colours, hover, filtering, search, selection and row menu.');
} finally {
  await browser.close();
}
