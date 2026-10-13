import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReadMonitor } from '../src/lib/readAvailability.js';

const apiUrl = 'https://example.supabase.co';
const read = `${apiUrl}/rest/v1/v_projects?select=id`;
const setup = fetchImpl => createReadMonitor({ apiUrl, fetchImpl, wait: async () => {} });

test('temporary network and server failures recover before blocking the page', async () => {
  let calls = 0;
  const monitor = setup(async () => {
    calls++;
    if (calls === 1) throw new TypeError('Failed to fetch');
    return new Response('[]', { status: calls === 2 ? 503 : 200 });
  });
  assert.equal((await monitor.monitoredFetch(read)).status, 200);
  assert.equal(calls, 3);
  assert.equal(monitor.getFailure(), null);
});

test('persistent failed reads stay blocked until every failed request recovers', async () => {
  let status = 500;
  let calls = 0;
  const changes = [];
  const monitor = createReadMonitor({ apiUrl, wait: async () => {}, onChange: f => changes.push(f), fetchImpl: async () => { calls++; return new Response('[]', { status }); } });
  await monitor.monitoredFetch(read);
  assert.equal(calls, 3, 'retries are bounded');
  await monitor.monitoredFetch(`${apiUrl}/rest/v1/v_beneficiaries`);
  status = 200;
  await monitor.monitoredFetch(`${apiUrl}/rest/v1/v_risks_issues`);
  assert.equal(monitor.getFailure().status, 500, 'unrelated success cannot unblock failed data');
  await monitor.monitoredFetch(read);
  assert.equal(monitor.getFailure().status, 500);
  await monitor.monitoredFetch(`${apiUrl}/rest/v1/v_beneficiaries`);
  assert.equal(monitor.getFailure(), null);
  assert.equal(changes.at(-1), null, 'recovery notifies the mounted guard');
});

test('failed auth, writes and other services do not block data that already loaded', async () => {
  const monitor = setup(async () => { throw new TypeError('Network unavailable'); });
  for (const [url, init] of [[`${apiUrl}/auth/v1/token`, { method: 'POST' }], [read, { method: 'PATCH' }], ['https://other.example/rest/v1/test', undefined]]) {
    await assert.rejects(monitor.monitoredFetch(url, init));
    assert.equal(monitor.getFailure(), null);
  }
});

test('permission failures are not retried and still block missing data', async () => {
  let calls = 0;
  const monitor = setup(async () => { calls++; return new Response('{}', { status: 403 }); });
  await monitor.monitoredFetch(read);
  assert.equal(calls, 1);
  assert.equal(monitor.getFailure().status, 403);
});

test('cancelled reads and optional translation probes do not raise the guard', async () => {
  const cancelled = setup(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  await assert.rejects(cancelled.monitoredFetch(read));
  assert.equal(cancelled.getFailure(), null);
  const probe = setup(async () => new Response('{"code":"42703","message":"column i18n does not exist"}', { status: 400 }));
  await probe.monitoredFetch(read);
  assert.equal(probe.getFailure(), null);
});
