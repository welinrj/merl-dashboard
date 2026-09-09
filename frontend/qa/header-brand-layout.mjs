import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const HOST = 'https://ndntvncboeajanipafeq.supabase.co';
const REF = 'ndntvncboeajanipafeq';
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json', 'utf8'));
const now = Math.floor(Date.now() / 1000);
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'u1',role:'authenticated',aud:'authenticated',iat:now,exp:now+99999})}.sig`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function setup(authenticated) {
  const context = await browser.newContext({ viewport: {width:1440,height:900} });
  await context.addInitScript(([ref, token, exp, auth]) => {
    localStorage.setItem('merl.lang', 'en');
    if (auth) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token:token,token_type:'bearer',expires_in:99999,expires_at:exp,refresh_token:'r',
      user:{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}
    }));
  }, [REF,jwt,now+99999,authenticated]);
  await context.route(`${HOST}/**`, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.startsWith('/auth/v1/user')) return route.fulfill({status:authenticated?200:401,contentType:'application/json',body:JSON.stringify(authenticated?{id:'u1',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2025-01-01T00:00:00Z'}:{})});
    if (path.startsWith('/auth/v1/')) return route.fulfill({status:401,contentType:'application/json',body:'{}'});
    if (path.endsWith('/rpc/current_profile')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'u1',full_name:'Admin',role:'system_admin'}])});
    if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (path.startsWith('/rest/v1/')) {
      const rel = path.replace('/rest/v1/','').split('/')[0];
      let rows = authenticated ? fixture[rel] ?? [] : rel === 'public_portal_summary' ? [{project_count:0,overall_progress_pct:null,published_beneficiaries:null,total_investment_vuv:null}] : [];
      for (const [key,value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
      const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]??null:rows)});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await context.route('https://services.arcgis.com/**', route => route.abort());
  await context.route('https://unpkg.com/**', route => route.abort());
  return context;
}

async function check(page, label, { authenticated, width }) {
  const result = await page.locator('.dsh-head').evaluate(header => {
    const group = header.querySelector('.merl-partner-logos');
    const images = [...group.querySelectorAll('img')];
    const state = group.querySelector('.merl-partner-state');
    const title = state?.querySelector('.merl-partner-state-name');
    const crest = state?.querySelector('.merl-partner-crest');
    const docc = group.querySelector('.merl-partner-docc');
    const mfat = group.querySelector('.merl-partner-mfat');
    const rect = el => el.getBoundingClientRect();
    const h = rect(header), g = rect(group);
    const fits = (a,b) => a.left >= b.left-1 && a.right <= b.right+1 && a.top >= b.top-1 && a.bottom <= b.bottom+1;
    const overlaps = (a,b) => a.left < b.right-1 && a.right > b.left+1 && a.top < b.bottom-1 && a.bottom > b.top+1;
    const boxes = images.map(rect);
    const controls = header.querySelector('.dsh-head-actions');
    const menu = header.querySelector('.dsh-hamburger');
    const visible = el => el && getComputedStyle(el).display !== 'none';
    const padding = parseFloat(getComputedStyle(header).paddingLeft) || 0;
    const titleBox = title && rect(title);
    return {
      imageCount:images.length,
      imagesLoaded:images.every(i=>i.complete && i.naturalWidth>0),
      proportions:images.every(i=>getComputedStyle(i).objectFit==='contain'),
      nationalTitle:title?.textContent?.trim(),
      nationalTitleVisible:!!titleBox && titleBox.width>0 && titleBox.height>0 && getComputedStyle(title).visibility!=='hidden',
      nationalTitleInside:!!titleBox && fits(titleBox,rect(state)) && fits(rect(state),g),
      nationalTitleBesideCrest:!!titleBox && titleBox.left>=rect(crest).right-1 && Math.abs((titleBox.top+titleBox.bottom-rect(crest).top-rect(crest).bottom)/2)<=4,
      nationalTitleBeforeDoCC:group.firstElementChild===state && state.nextElementSibling===docc && docc.nextElementSibling===mfat && !overlaps(titleBox,rect(docc)),
      leftAligned:Math.abs(g.left-h.left-padding)<=2,
      centered:Math.abs((g.left+g.right-h.left-h.right)/2)<=2,
      sameRow:!!controls && Math.abs((g.top+g.bottom-controls.getBoundingClientRect().top-controls.getBoundingClientRect().bottom)/2)<=3,
      inside:fits(g,h) && boxes.every(b=>fits(b,g)),
      distinct:boxes.every((b,i)=>boxes.slice(i+1).every(c=>!overlaps(b,c))),
      controlsClear:!controls || !overlaps(g,rect(controls)),
      controlsInside:!controls || fits(rect(controls),h),
      menuClear:!visible(menu) || (!overlaps(g,rect(menu)) && (!controls || !overlaps(rect(menu),rect(controls)))),
      horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+2,
      headerWordmark:!!header.querySelector('.pbd-head-brand'),
    };
  });
  const mobile = width <= 760;
  const expected = {
    imageCount:3, imagesLoaded:true, proportions:true,
    nationalTitle:'The republic of Vanuatu', nationalTitleVisible:true,
    nationalTitleInside:true, nationalTitleBesideCrest:true, nationalTitleBeforeDoCC:true,
    leftAligned:!mobile || width<=520, centered:mobile,
    sameRow:width>1180,
    inside:true, distinct:true, controlsClear:true, controlsInside:true,
    menuClear:true, horizontalOverflow:false, headerWordmark:false,
  };
  for (const [key,value] of Object.entries(result)) {
    if (value!==expected[key]) throw new Error(`${label}: ${key} expected ${expected[key]}, got ${value}`);
  }
  const sidebar = page.locator('.dsh-side .dsh-brand-title');
  if (!(await sidebar.textContent()).includes('MERL')) throw new Error(`${label}: sidebar MERL identity missing`);
  console.log(`PASS ${label}`);
}

try {
  for (const authenticated of [false,true]) {
    const context = await setup(authenticated);
    const page = await context.newPage();
    for (const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[320,720]]) {
      await page.setViewportSize({width,height});
      await page.goto('http://127.0.0.1:5199/#/dashboards', {waitUntil:'domcontentloaded'});
      await page.locator(authenticated?'.dsh-user':'.pbd-header-login').waitFor({timeout:15000});
      await page.locator('.merl-partner-logos img').first().evaluate(img => img.decode());
      await check(page, `${authenticated?'Workspace':'Public'} ${width}px`, {authenticated,width});
      if (width<=760) {
        const menu=page.locator('.dsh-head .dsh-hamburger');
        await menu.click();
        if (!await page.locator('.dsh-side').evaluate(el=>el.classList.contains('open'))) throw new Error('Mobile menu did not open');
        await menu.click();
      }
      if (!authenticated) {
        if (await page.locator('.dsh-head form.pbd-header-login').count()!==1) throw new Error('Public sign-in was lost or duplicated');
        await page.locator('.pbd-header-login input[type="email"]').fill('test@example.com');
        await page.locator('.pbd-header-login input[type="password"]').fill('test-password');
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
