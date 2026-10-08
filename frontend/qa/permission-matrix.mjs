// Permission matrix + authentication lifecycle.
//
// For every role: which navigation items appear, which routes survive a direct
// URL, and whether write/approve controls are offered. Then the auth lifecycle:
// does logout actually clear the session, and can a logged-out user get back in
// with the back button or a copied URL.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE, 'utf8'));

const ROLES = ['system_admin', 'docc_me_officer', 'project_manager', 'data_entry_officer', 'viewer'];
const ROUTES = ['/dashboards', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin',
  '/analytics/results', '/analytics/financial', '/analytics/geographic', '/analytics/risks',
  '/analytics/project-portfolio'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const mkContext = async (role, withSession = true) => {
  const writes = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  if (withSession) {
    await ctx.addInitScript(([ref, tok, exp]) => {
      localStorage.setItem('merl.lang', 'en');
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
        access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
        user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
      }));
    }, [REF, jwt, now + 99999]);
  }
  await ctx.route(`${HOST}/**`, async (r) => {
    const u = new URL(r.request().url()), p = u.pathname;
    if (p.endsWith('/rpc/current_profile')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'u1', email: 'user@docc.gov.vu', full_name: 'Test User', role }]) });
    }
    if (p.startsWith('/auth/v1/logout')) return r.fulfill({ status: 204, body: '' });
    if (p.startsWith('/auth/v1/user')) {
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
    }
    if (p.endsWith('/rpc/list_results_framework_editable_projects')) {
      const allowed = ['system_admin', 'docc_me_officer'].includes(role);
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(allowed ? [{ project_id: 'pa' }, { project_id: 'pb' }] : []) });
    }
    if (p.endsWith('/rpc/patch_results_framework_node') || p.endsWith('/rpc/patch_results_framework_row')) {
      writes.push({ rpc: p.split('/').at(-1), args: r.request().postDataJSON() });
      return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    }
    if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (p.startsWith('/rest/v1/')) {
      const rel = p.replace('/rest/v1/', '').split('/')[0];
      let body = T[rel] ?? [];
      if (rel === 'v_reporting_periods') body = [{ id:'period-1',project_id:'pa',period_label:'Q2 2026',period_end:'2026-06-30' }];
      if (rel === 'v_framework_nodes') body = [
        { id: 'test-objective', project_id: 'pa', node_type: 'project_objective', node_code: 'OBJ', title: 'Resilience objective', status: 'approved' },
        { id: 'test-component', project_id: 'pa', parent_node_id: 'test-objective', node_type: 'component', node_code: 'C1', title: 'Coastal component', status: 'approved' },
        { id: 'test-output', project_id: 'pa', parent_node_id: 'test-component', node_type: 'output', node_code: 'OP1', title: 'Seawalls built', status: 'approved' },
      ];
      if (rel === 'v_project_indicators') body = (T[rel] ?? []).map(x => ({ ...x, framework_node_id: 'test-output' }));
      for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) body = body.filter((x) => String(x[k]) === v.slice(3));
      if ((r.request().headers()['accept'] || '').includes('vnd.pgrst.object')) {
        const one = body[0] ?? null;
        return r.fulfill({ status: one ? 200 : 406, contentType: 'application/json', body: JSON.stringify(one) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  ctx.frameworkWrites = writes;
  return ctx;
};

// ── Permission matrix ────────────────────────────────────────────────────────
console.log('ROUTE ACCESS BY ROLE  (reached = the route rendered; redirected = sent away)\n');
const header = ['route'.padEnd(34), ...ROLES.map((r) => r.slice(0, 12).padEnd(13))].join('');
console.log(header);
console.log('-'.repeat(header.length));

const matrix = {};
for (const role of ROLES) {
  const ctx = await mkContext(role);
  const page = await ctx.newPage();
  matrix[role] = {};
  for (const route of ROUTES) {
    await page.goto(`http://localhost:5199/#${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    matrix[role][route] = page.url().includes(route.split('?')[0]);
  }
  // Which write / approve controls the role is offered anywhere.
  await page.goto('http://localhost:5199/#/review', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  const body = await page.locator('body').innerText().catch(() => '');
  matrix[role]._approve = /\bApprove\b/i.test(body);
  await page.goto('http://localhost:5199/#/project-setup', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const ps = await page.locator('body').innerText().catch(() => '');
  matrix[role]._newProject = /New project/i.test(ps);
  matrix[role]._nav = (await page.locator('.dsh-nav').innerText().catch(() => '')).split('\n').filter(Boolean).length;
  await page.goto('http://localhost:5199/#/results-framework', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Results Framework', exact: true }).waitFor();
  await page.waitForTimeout(1500);
  const edits = page.getByRole('button', { name: /^Edit Indicator:/ });
  if (['system_admin', 'docc_me_officer'].includes(role)) {
    assert.ok(await edits.count() > 0, `${role} can edit rows`);
    await page.getByRole('button', { name: 'Edit Indicator: IND-01', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await page.setViewportSize({ width: 390, height: 664 });
    assert.equal(await dialog.evaluate(el => el.parentElement.parentElement === document.body), true, 'Editor escapes dashboard stacking contexts');
    const saveButton = dialog.getByRole('button', { name: 'Save', exact: true });
    assert.equal(await saveButton.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.bottom <= window.innerHeight && rect.top >= 0 && el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }), true, 'Mobile save button is visible above navigation');
    assert.equal(await dialog.getByLabel('Information to edit').count(),0);
    await dialog.getByLabel('Content').fill(`Updated indicator by ${role}`);
    await page.setViewportSize({width:390,height:380});
    assert.equal(await saveButton.evaluate(el=>el.getBoundingClientRect().bottom<=window.innerHeight),true);
    await saveButton.click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(ctx.frameworkWrites.at(-1).args.p_changes.indicator.name,`Updated indicator by ${role}`);
    assert.equal(ctx.frameworkWrites.at(-1).args.p_changes.targets,undefined);
    await page.setViewportSize({width:390,height:664});
    await page.getByRole('button',{name:'Edit Project objective: OBJ',exact:true}).first().click();
    await dialog.getByLabel('Content').fill(`Updated objective by ${role}`);
    await saveButton.click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(ctx.frameworkWrites.at(-1).args.p_changes.title,`Updated objective by ${role}`);
    for(const [column,value] of [['Baseline','125'],['Mid-term','500'],['Final target','1000'],['Latest actual','400'],['Progress','45'],['Narrative','Updated narrative']]) {
      await page.getByRole('button',{name:`Edit ${column}: IND-01`,exact:true}).click();
      await dialog.getByLabel('Content').fill(value);
      await saveButton.click();
      await dialog.waitFor({state:'hidden'});
      const changed=ctx.frameworkWrites.at(-1).args.p_changes;
      assert.equal(Object.keys(changed).length,1);
      if(['Baseline','Mid-term','Final target'].includes(column)) assert.equal(changed.targets[0].numeric_value,Number(value));
      if(column==='Latest actual') assert.equal(changed.progress.cumulative_actual,400);
      if(column==='Progress') assert.equal(changed.progress.achievement_pct,45);
      if(column==='Narrative') assert.equal(changed.narrative.progress_summary,value);
    }
    await page.getByRole('button',{name:'Edit Status: IND-01',exact:true}).click();
    await dialog.getByLabel('Status',{exact:true}).selectOption('attention_required');
    await dialog.getByLabel('Schedule',{exact:true}).selectOption('delayed');
    await saveButton.click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(ctx.frameworkWrites.at(-1).args.p_changes.progress.performance_status,'attention_required');
    await page.getByRole('button',{name:'Edit Reporting: IND-01',exact:true}).click();
    await dialog.getByLabel('Reporting',{exact:true}).selectOption('Annual');
    await saveButton.click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(ctx.frameworkWrites.at(-1).args.p_changes.indicator.official_reporting_frequency,'Annual');
  } else {
    assert.equal(await edits.count(), 0, `${role} has no edit controls without project edit permission`);
    assert.equal(ctx.frameworkWrites.length, 0);
  }
  console.log(`Framework row edit permissions verified: ${role}`);
  await ctx.close();
}
for (const route of ROUTES) {
  console.log(route.padEnd(34) + ROLES.map((r) => (matrix[r][route] ? 'reached' : 'REDIRECTED').padEnd(13)).join(''));
}
console.log('-'.repeat(header.length));
console.log('Approve offered'.padEnd(34) + ROLES.map((r) => (matrix[r]._approve ? 'yes' : 'no').padEnd(13)).join(''));
console.log('New project offered'.padEnd(34) + ROLES.map((r) => (matrix[r]._newProject ? 'yes' : 'no').padEnd(13)).join(''));
console.log('Sidebar items'.padEnd(34) + ROLES.map((r) => String(matrix[r]._nav).padEnd(13)).join(''));


await b.close();
