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


let editable = true, failSave = false, saved;
const nodes = [
  { id: 'objective', project_id: 'pa', node_type: 'project_objective', title: 'Climate resilience', node_code: 'OBJ' },
  { id: 'oc-a', project_id: 'pa', parent_node_id: 'objective', node_type: 'outcome', title: 'Safer coastal homes', node_code: 'OC1' },
  { id: 'op-a', project_id: 'pa', parent_node_id: 'oc-a', node_type: 'output', title: 'Coastal protection', node_code: 'OP1' },
  { id: 'oc-b', project_id: 'pa', parent_node_id: 'objective', node_type: 'outcome', title: 'Healthy reefs', node_code: 'OC2' },
  { id: 'op-b', project_id: 'pa', parent_node_id: 'oc-b', node_type: 'output', title: 'Reef restoration', node_code: 'OP2' },
];
await context.route('**/rpc/list_results_framework_editable_projects', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(editable ? [{ project_id: 'pa' }] : []) }));
await context.route('**/rest/v1/v_framework_nodes*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nodes) }));
await context.route('**/rest/v1/v_project_indicators*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
  { ...fixture.v_project_indicators[0], framework_node_id: 'op-a' },
  { ...fixture.v_project_indicators[0], id: 'i2', code: 'IND-02', name: 'Reef restored', framework_node_id: 'op-b' },
]) }));
await context.route('**/rest/v1/v_indicator_progress*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.v_indicator_progress.map(row => ({ ...row, review_status: 'submitted' }))) }));
await context.route('**/rpc/patch_results_framework_row', async route => {
  saved = route.request().postDataJSON();
  return route.fulfill({ status: failSave ? 400 : 200, contentType: 'application/json', body: failSave ? JSON.stringify({ code: 'P0001', message: 'Test save rejected' }) : 'null' });
});
try {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5199/#/results-framework');
  const project = page.getByRole('combobox', { name: 'Project', exact: true });
  await project.selectOption('pa');
  if (!page.url().includes('project=pa')) throw new Error('Selected project was not retained in URL');
  const groups = page.locator('.rf2-result-group');
  await groups.first().waitFor();
  if (await groups.count() !== 2) throw new Error('Recorded outcomes must form two groups');
  if (await page.locator('.rf2-result-group[open]').count() !== 1) throw new Error('Only one outcome should start open');
  await groups.nth(1).locator('summary').first().click();
  await page.waitForTimeout(150);
  if (await page.locator('.rf2-result-group[open]').count() !== 1) throw new Error('Opening another outcome should close the previous one');
  await groups.first().locator('summary').first().click();
  const card = groups.first().locator('.rf2-result-card').first();
  await card.getByText('Awaiting approval', { exact: true }).waitFor();
  for (const field of ['Indicator', 'Baseline', 'Mid-term', 'Final target', 'Latest actual', 'Progress', 'Status', 'Narrative', 'Reporting']) {
    if (!(await card.getByRole('button', { name: `Edit ${field}: IND-01`, exact: true }).isVisible())) throw new Error(`Phone editing missing ${field}`);
  }
  await page.screenshot({ path: 'qa-artifacts/header-framework-phone.png', animations: 'disabled' });
  await card.getByRole('button', { name: 'Edit Final target: IND-01', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Content').fill('1200');
  failSave = true;
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  if (await dialog.getByLabel('Content').inputValue() !== '1200') throw new Error('Save failure lost edited content');
  await page.screenshot({ path: 'qa-artifacts/header-framework-save-error.png', animations: 'disabled' });
  failSave = false;
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  if (saved.p_changes.targets[0].numeric_value !== 1200 || saved.p_changes.progress || saved.p_changes.indicator) throw new Error('Target edit changed unrelated content');
  await page.locator('.rf2-save-feedback').waitFor();
  if (!/changes saved/i.test(await page.locator('.rf2-save-feedback').innerText())) throw new Error('Saved state must remain visible');
  await page.setViewportSize({ width: 1440, height: 900 });
  const table = page.getByRole('region', { name: 'Results framework table' });
  await table.waitFor();
  const sticky = await table.locator('th').first().evaluate(el => getComputedStyle(el).position);
  if (sticky !== 'sticky') throw new Error('Table headings must remain visible');
  await table.evaluate(el => { el.scrollLeft = 700; el.scrollTop = 100; });
  await page.screenshot({ path: 'qa-artifacts/header-framework-desktop.png', animations: 'disabled' });
  editable = false;
  await page.reload();
  await page.locator('.rf2-table').waitFor();
  if (await page.getByRole('button', { name: /^Edit / }).count()) throw new Error('Read-only user was offered editing');
  console.log('PASS Outcome grouping, every phone edit field, selected project URL, retry without data loss, partial target patch, sticky headings and read-only controls');
} finally { await browser.close(); }
