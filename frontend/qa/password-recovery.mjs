import { chromium } from 'playwright';
const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+3600})}.sig`;
const user = {id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'};
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
try {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  let updates = 0, profiles = 0, logout = 0;
  await context.route(`${HOST}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (body,status=200) => route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path === '/auth/v1/user') {
      if(request.method() === 'PUT') {
        if(request.postDataJSON().password !== 'new-test-password') throw new Error('Incorrect reset payload');
        updates++;
      }
      return json(user);
    }
    if(path === '/auth/v1/logout') { logout++; return route.fulfill({status:204,body:''}); }
    if(path.endsWith('/rpc/current_profile')) { profiles++; return json([]); }
    if(path === '/auth/v1/recover') return json({code:'over_email_send_rate_limit',message:'Email rate limit exceeded'},429);
    return json([]);
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:5199/#access_token=${token}&refresh_token=mock-refresh&token_type=bearer&expires_in=3600&type=recovery`);
  await page.getByLabel('New password',{exact:true}).waitFor({timeout:15000});
  if(profiles) throw new Error('Profile gate ran before password recovery');
  await page.getByLabel('New password',{exact:true}).fill('new-test-password');
  await page.getByLabel('Confirm new password').fill('new-test-password');
  await page.getByRole('button',{name:'Change password',exact:true}).click();
  await page.getByText('Password changed successfully.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Return to sign in'}).click();
  await page.locator('.pbd-root').waitFor({timeout:15000});
  if(updates !== 1 || logout !== 1) throw new Error('Recovery did not update once and end the session');
  if(page.url().includes('access_token')) throw new Error('Recovery tokens remain in URL');
  console.log('PASS Recovery URL survives SDK consumption before the profile gate');
  await page.goto('http://localhost:5199/#error=access_denied&error_code=otp_expired');
  await page.getByRole('alert').filter({hasText:'expired or is incomplete'}).waitFor();
  if(await page.getByRole('button',{name:'Change password',exact:true}).count()) throw new Error('Expired link permits a password update');
  await page.getByRole('button',{name:'Return to sign in'}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
  await page.getByRole('button',{name:'Forgot?',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('test@example.com');
  await page.getByRole('button',{name:'Send recovery link',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Too many recovery requests'}).waitFor();
  if(await page.locator('.pbd-header-login-success').count()) throw new Error('Failed email request reported success');
  console.log('PASS Expired links and failed email delivery display actionable errors');
} finally { await browser.close(); }
