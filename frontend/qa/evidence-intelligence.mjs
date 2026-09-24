// Renders the Results Framework against a stub that returns one indicator per
// evidence state, and asserts the four signals the feature exists to show:
// is there evidence, does the document cover the indicator, is there a figure,
// and is that figure new / already reported / outdated.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq', HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const T = JSON.parse(readFileSync(process.env.STUB_FILE ?? './qa/fixture.json', 'utf8'));

const IND = [
  { id: 'i1', code: 'IND-01', state: 'new_progress',     expect: 'New progress found' },
  { id: 'i2', code: 'IND-02', state: 'already_reported', expect: 'Already reported' },
  { id: 'i3', code: 'IND-03', state: 'outdated',         expect: 'Outdated' },
  { id: 'i4', code: 'IND-04', state: 'conflicting',      expect: 'Conflicts with recorded figure' },
  { id: 'i5', code: 'IND-05', state: 'not_relevant',     expect: 'Does not cover this indicator' },
  { id: 'i6', code: 'IND-06', state: 'no_evidence',      expect: 'No evidence' },
];

T.v_project_indicators = IND.map((r, n) => ({
  id: r.id, project_id: 'pa', code: r.code, name: `Indicator ${n + 1}`, unit: 'hectares',
  baseline_value: 0, target_value: 1000, outcome_id: 'oc1', indicator_level: 'outcome',
  frequency: 'Quarterly', is_qualitative: false, higher_is_better: true, i18n: {},
}));
// Deliberately long, real-shaped filenames: the cell has to clamp them rather
// than let one report title set the height of the whole row.
const docsFor = (r) => [
  `Outcome 1.1_${r.code}_Terrestrial protected areas newly created_Q3 2026 Progress Report.docx`,
  `Back to Office Report ${r.code} — East Vanua-Lava and Mota Island 2026.pdf`,
  ...(r.id === 'i1' ? [`VCAPII 2026 Face Form — Progress PA ENV July 2026 ${r.code}.xlsx`] : []),
].map((title, n) => ({
  id: `d-${r.id}-${n}`, title, i18n: {}, document_type: 'monitoring_report',
  document_date: '2026-09-30', file_url: `storage://merl-indicator-evidence/pa/${r.id}/${n}.pdf`,
}));

T.v_indicator_evidence_status = IND.map((r) => ({
  indicator_id: r.id, project_id: 'pa', indicator_code: r.code, indicator_name: r.code, unit: 'hectares',
  // i1 holds more documents than the view returns, so the cell must say "+2 more".
  evidence_count: r.state === 'no_evidence' ? 0 : (r.id === 'i1' ? 5 : 2),
  evidence_state: r.state,
  reconciliation: r.state === 'no_evidence' ? null : r.state,
  reconciliation_detail: `detail for ${r.code}`, latest_analysis_id: `a-${r.id}`,
  recent_documents: r.state === 'no_evidence' ? [] : docsFor(r),
}));
T.v_evidence = [{
  id: 'e1', project_id: 'pa', indicator_id: 'i1', title: 'Q3 Progress Report.docx',
  document_type: 'progress_report', document_date: '2026-09-30', reporting_period: 'Q3 2026',
  file_url: 'storage://merl-indicator-evidence/pa/i1/x/report.docx', created_at: '2026-09-30T00:00:00Z', i18n: {},
}];
T.v_evidence_analysis = [{
  id: 'a-i1', evidence_id: 'e1', indicator_id: 'i1', project_id: 'pa', status: 'complete',
  relevance: 'relevant', relevance_reason: 'The report states a hectare figure for this indicator.',
  progress_found: true, extracted_value: 4120, extracted_unit: 'hectares', extracted_period: 'Q3 2026',
  evidence_quote: 'A total of 4,120 hectares were mapped during the quarter.',
  source_location: 'page 4, Table 2', confidence: 0.82, reconciliation: 'new_progress',
  reconciliation_detail: 'Currently recorded: 3757.41. This document reports 4120.',
  review_state: 'proposed', raw: {}, created_at: '2026-09-30T00:00:00Z',
}];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(([ref, tok, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: tok, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);

const unstubbed = [];
await ctx.route(`${HOST}/**`, async (r) => {
  const u = new URL(r.request().url()), p = u.pathname;
  if (p.endsWith('/rpc/current_profile')) return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: 'u1', email: 'a@b.c', full_name: 'Test Admin', role: 'system_admin' }]) });
  if (p.endsWith('/rpc/list_results_framework_editable_projects')) return r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify([{ project_id: 'pa' }]) });
  if (p.startsWith('/auth/v1/user')) return r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  if (p.startsWith('/rest/v1/rpc/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (p.startsWith('/rest/v1/')) {
    const rel = p.replace('/rest/v1/', '').split('/')[0];
    if (!(rel in T)) unstubbed.push(rel);
    let body = T[rel] ?? [];
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) body = body.filter((x) => String(x[k]) === v.slice(3));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`PAGEERROR ${String(e).slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`CONSOLE ${m.text().slice(0, 160)}`); });
// Google Fonts / unpkg are blocked by the sandbox CA. Pre-existing external
// assets, not application faults — the same exclusion sweep-controls.mjs makes.
const externalBlocked = [];
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/fonts\.googleapis|fonts\.gstatic|unpkg\.com/.test(u)) { externalBlocked.push(u); return; }
  errs.push(`REQFAIL ${r.failure()?.errorText} ${u.slice(0, 100)}`);
});

const fails = [];
const check = (ok, label) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails.push(label); };

const PORT = process.env.QA_PORT ?? '5199';
await page.goto(`http://127.0.0.1:${PORT}/#/results-framework?project=pa`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check(await page.locator('th', { hasText: 'Evidence' }).count() > 0, 'Evidence column header renders');

for (const r of IND) {
  const row = page.locator('tr', { has: page.locator('td', { hasText: r.code }) }).first();
  const badge = row.locator('.evi-badge').first();
  const text = (await badge.count()) ? (await badge.innerText()).trim() : '(none)';
  check(text.startsWith(r.expect), `${r.code} → "${r.expect}" (got "${text}")`);

  // The names of the documents behind the badge, not just that there are some.
  const names = await row.locator('.evi-cell-doc').allInnerTexts();
  const want = r.state === 'no_evidence' ? 0 : docsFor(r).length;
  check(names.length === want, `${r.code} names ${want} document(s) in the cell (got ${names.length})`);
  if (want) {
    check(names[0].trim() === docsFor(r)[0].title, `${r.code} shows the newest document's name (got ${JSON.stringify(names[0])})`);
  }
}

// 5 documents on file, 3 named, so the cell has to account for the other 2.
const i1 = page.locator('tr', { has: page.locator('td', { hasText: 'IND-01' }) }).first();
check((await i1.locator('.evi-cell-more').innerText()).trim() === '+2 more', 'cell counts the documents it did not name');
check(await page.locator('tr', { has: page.locator('td', { hasText: 'IND-06' }) })
  .first().locator('.evi-cell-doc').count() === 0, 'no document names where there is no evidence');

// The badge must open the panel and show the quoted sentence + reconciliation.
await page.locator('tr', { has: page.locator('td', { hasText: 'IND-01' }) }).first().locator('.evi-cell').click();
await page.waitForTimeout(800);
const panel = page.locator('.evi-panel');
check(await panel.count() > 0, 'panel opens on badge click');
const body = await panel.innerText().catch(() => '');
check(/4,?120/.test(body), 'panel shows the extracted figure');
check(body.includes('A total of 4,120 hectares were mapped'), 'panel shows the verbatim quote');
check(body.includes('Currently recorded'), 'panel shows the reconciliation against the recorded figure');
check(body.includes('page 4, Table 2'), 'panel shows where in the document it was found');
check(/82\s*%/.test(body), 'panel shows confidence');
check(await panel.locator('button', { hasText: 'Record as draft progress' }).count() > 0, 'accept action offered for new progress');

// No horizontal overflow at phone width (CLAUDE.md requirement).
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(500);
const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
check(sw <= iw + 1, `no horizontal overflow at 390px (${sw} vs ${iw})`);

const appErrs = errs.filter((e) => !/ERR_CERT_AUTHORITY_INVALID|Failed to load resource/.test(e));
console.log(`external assets blocked by sandbox CA (ignored): ${[...new Set(externalBlocked.map((u) => new URL(u).host))].join(', ') || 'none'}`);
check(appErrs.length === 0, `no application console/page errors (${appErrs.slice(0, 3).join(' | ') || 'none'})`);
check(unstubbed.length === 0, `no unstubbed views (${[...new Set(unstubbed)].join(',') || 'none'})`);

await ctx.unrouteAll({ behavior: 'ignoreErrors' });
await b.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall checks passed');
process.exitCode = fails.length ? 1 : 0;
