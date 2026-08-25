// The worker loop: what it sends, what it refuses to send, and what it does
// when the database rejects a write that arrived too late.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.js';

const BASE = 'https://db.example.test';

/** Stand in for PostgREST: serve a backlog, record the writes. */
function stubFetch({ backlog, failWrites = new Set() }) {
  const writes = [];
  let served = false;
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).endsWith('/rpc/translation_backlog')) {
      const rows = served ? [] : backlog;
      served = true;
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (String(url).endsWith('/rpc/save_machine_translation')) {
      if (failWrites.has(body.p_column)) {
        return new Response('conflict', { status: 409 });
      }
      writes.push(body);
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected call: ${url}`);
  };
  return { impl, writes };
}

const cfgWith = (env) => ({
  env,
  supabaseUrl: BASE,
  serviceKey: 'service-key',
  targetLang: 'fr',
  batchLimit: 100,
  pollSeconds: 60,
  maxBackoffSeconds: 900,
});

// A provider that just marks the text, so assertions read clearly.
const fakeProviderEnv = { TRANSLATE_PROVIDER: 'libretranslate', TRANSLATE_ENDPOINT: 'http://lt.test' };

test('non-prose fields never reach the engine', async () => {
  const backlog = [
    { table_name: 'projects', row_id: 'r1', column_name: 'name', source_text: 'Water Security Torba' },
    { table_name: 'projects', row_id: 'r2', column_name: 'code', source_text: 'VCRP-001' },
    { table_name: 'projects', row_id: 'r3', column_name: 'name', source_text: '350000000' },
    { table_name: 'projects', row_id: 'r4', column_name: 'name', source_text: 'https://docc.gov.vu' },
  ];
  const { impl, writes } = stubFetch({ backlog });
  const sent = [];
  global.fetch = async (url, init) => {
    if (String(url).startsWith('http://lt.test')) {
      sent.push(JSON.parse(init.body).q);
      return new Response(JSON.stringify({ translatedText: 'TRADUIT' }), { status: 200 });
    }
    return impl(url, init);
  };

  const worker = createWorker(cfgWith(fakeProviderEnv));
  const written = await worker.runOnce();

  assert.equal(sent.length, 1, 'only the prose field was translated');
  assert.match(sent[0], /Water Security/);
  assert.equal(written, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].p_source, 'Water Security Torba');
  assert.equal(worker.state.skipped, 3);
});

test('the source text is sent back with the translation so the database can refuse a stale write', async () => {
  const backlog = [
    { table_name: 'risks_issues', row_id: 'r9', column_name: 'description',
      source_text: 'Cyclone season delays coastal works' },
  ];
  const { impl, writes } = stubFetch({ backlog });
  global.fetch = async (url, init) => {
    if (String(url).startsWith('http://lt.test')) {
      return new Response(JSON.stringify({ translatedText: 'La saison cyclonique retarde les travaux' }), { status: 200 });
    }
    return impl(url, init);
  };

  const worker = createWorker(cfgWith(fakeProviderEnv));
  await worker.runOnce();

  assert.equal(writes[0].p_table, 'risks_issues');
  assert.equal(writes[0].p_column, 'description');
  assert.equal(writes[0].p_lang, 'fr');
  assert.equal(writes[0].p_source, 'Cyclone season delays coastal works');
  assert.equal(writes[0].p_text, 'La saison cyclonique retarde les travaux');
});

test('a rejected write is counted and does not stop the pass', async () => {
  const backlog = [
    { table_name: 'projects', row_id: 'r1', column_name: 'description', source_text: 'A description that will be rejected.' },
    { table_name: 'projects', row_id: 'r2', column_name: 'name', source_text: 'Coastal Mangrove Protection' },
  ];
  const { impl, writes } = stubFetch({ backlog, failWrites: new Set(['description']) });
  global.fetch = async (url, init) => {
    if (String(url).startsWith('http://lt.test')) {
      return new Response(JSON.stringify({ translatedText: 'TRADUIT' }), { status: 200 });
    }
    return impl(url, init);
  };

  const worker = createWorker(cfgWith(fakeProviderEnv));
  const written = await worker.runOnce();

  assert.equal(written, 1, 'the second field still got through');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].p_column, 'name');
  assert.equal(worker.state.failures, 1);
});

test('with no provider configured the worker idles instead of failing', async () => {
  const worker = createWorker(cfgWith({}));
  assert.equal(worker.state.provider, null);
  assert.equal(await worker.runOnce(), 0);
});

test('an unchanged translation is not written back', async () => {
  const backlog = [
    { table_name: 'projects', row_id: 'r1', column_name: 'name', source_text: 'Coastal Mangrove Protection' },
  ];
  const { impl, writes } = stubFetch({ backlog });
  global.fetch = async (url, init) => {
    if (String(url).startsWith('http://lt.test')) {
      // engine returns the input untouched
      return new Response(JSON.stringify({ translatedText: 'Coastal Mangrove Protection' }), { status: 200 });
    }
    return impl(url, init);
  };
  const worker = createWorker(cfgWith(fakeProviderEnv));
  assert.equal(await worker.runOnce(), 0);
  assert.equal(writes.length, 0);
});
