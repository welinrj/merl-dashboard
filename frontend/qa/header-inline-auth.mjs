import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const user = {id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'};
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const context = await browser.newContext({viewport:{width:1440,height:900}});
await context.addInitScript(() => localStorage.setItem('merl.lang','en'));
let loginCalls = 0;
await context.route(`${HOST}/**`,async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const json = (body,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path === '/auth/v1/token') {
    loginCalls++;
    const body = request.postDataJSON();
    if(body.email !== 'test@example.com' || body.password !== 'correct-test-password') return json({message:'Invalid login credentials'},400);
    return json({access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,user});
  }
  if(path === '/auth/v1/user') return json(user);
  if(path.startsWith('/auth/v1/logout')) return route.fulfill({status:204,body:''});
  if(path.endsWith('/rpc/current_profile')) return json([{id:'u1',email:'test@example.com',full_name:'Test Officer',role:'system_admin'}]);
  if(path.startsWith('/rest/v1/')) {
    const relation = path.split('/').pop();
    const rows = fixture[relation] ?? (relation === 'public_portal_summary' ? [{project_count:0,overall_progress_pct:null,published_beneficiaries:null,total_investment_vuv:null}] : []);
    const single = (request.headers().accept||'').includes('vnd.pgrst.object');
    return json(single ? rows[0] ?? null : rows);
  }
  return json([]);
});
await context.route('https://services.arcgis.com/**',route=>route.abort());
await context.route('https://unpkg.com/**',route=>route.abort());
const page = await context.newPage();
try {
  await page.goto('http://localhost:5199/#/dashboards',{waitUntil:'domcontentloaded'});
  const form = page.locator('.pbd-header-login');
  await form.waitFor({timeout:15000});
  await form.getByLabel('Email').fill('test@example.com');
  await form.getByLabel('Password').fill('correct-test-password');
  await form.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.locator('.dsh-user').first().waitFor({timeout:20000});
  if(new URL(page.url()).hash !== '#/dashboards') throw new Error('Login did not preserve the shared dashboard route');
  if(await page.locator('.pbd-root').count()) throw new Error('Authenticated user remained on the public view');
  if(loginCalls !== 1) throw new Error(`Expected one authentication request, got ${loginCalls}`);
  console.log('PASS Header credentials open the existing authenticated workspace');
  await page.locator('.dsh-user').first().click();
  await page.getByRole('button',{name:/Sign out|Log ?out/i}).first().click();
  await page.locator('.pbd-header-login').waitFor({timeout:15000});
  if(new URL(page.url()).hash !== '#/dashboards') throw new Error('Sign-out did not return to the shared public route');
  console.log('PASS Sign-out returns to the public header login');
} finally {
  await browser.close();
}
