// worker.js — keep the French copy of the records up to date.
//
// The loop is deliberately dull: ask the database what is missing, translate a
// batch, write each result back, sleep. All the interesting decisions live in
// the database (what counts as missing, what a human has corrected, whether the
// English has moved on since) so that a second worker, a restart mid-batch, or
// a translation arriving after the officer edited the record are all ordinary
// cases rather than races.

import { makeProvider, BATCH_MAX } from './provider.js';
import { isTranslatable } from './protect.js';

const log = (level, msg, extra = {}) => {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call a SECURITY DEFINER RPC as the service role. */
async function rpc(cfg, name, args) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`${name} failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function createWorker(cfg) {
  const state = {
    provider: null,
    running: false,
    lastRunAt: null,
    lastError: null,
    translated: 0,
    skipped: 0,
    failures: 0,
  };

  state.provider = makeProvider(cfg.env);

  /** One pass: at most `batchLimit` fields. Returns how many were written. */
  async function runOnce() {
    if (!state.provider) return 0;

    const backlog = await rpc(cfg, 'translation_backlog', {
      p_lang: cfg.targetLang,
      p_limit: cfg.batchLimit,
    });
    if (!Array.isArray(backlog) || backlog.length === 0) return 0;

    // Anything that is not prose never reaches the engine. It stays in the
    // backlog — which is correct: it is not translated, and if the rule ever
    // changes it will be picked up then. Left unlogged per item to keep a
    // portfolio of project codes from filling the log every cycle.
    const work = backlog.filter((row) => isTranslatable(row.source_text));
    state.skipped += backlog.length - work.length;
    if (work.length === 0) return 0;

    let written = 0;
    for (let i = 0; i < work.length; i += BATCH_MAX) {
      const batch = work.slice(i, i + BATCH_MAX);
      let results;
      try {
        results = await state.provider.translate(
          batch.map((r) => r.source_text), cfg.targetLang);
      } catch (err) {
        state.failures += 1;
        state.lastError = err.message;
        log('error', 'batch failed', { error: err.message, size: batch.length });
        if (err.retryable) return written;   // back off; the rest stays queued
        continue;                            // a bad batch should not stop the pass
      }

      for (let j = 0; j < batch.length; j += 1) {
        const row = batch[j];
        const translated = results[j];
        if (!translated || translated === row.source_text) continue;
        try {
          // The database decides whether this still applies: it refuses the
          // write if the officer edited the English or corrected the French
          // while the batch was in flight.
          await rpc(cfg, 'save_machine_translation', {
            p_table: row.table_name,
            p_row_id: row.row_id,
            p_column: row.column_name,
            p_lang: cfg.targetLang,
            p_text: translated,
            p_source: row.source_text,
          });
          written += 1;
        } catch (err) {
          state.failures += 1;
          state.lastError = err.message;
          log('error', 'write failed', {
            table: row.table_name, column: row.column_name, error: err.message,
          });
        }
      }
    }

    state.translated += written;
    return written;
  }

  async function loop() {
    state.running = true;
    let backoff = cfg.pollSeconds;

    while (state.running) {
      try {
        const written = await runOnce();
        state.lastRunAt = new Date().toISOString();
        state.lastError = null;
        if (written > 0) log('info', 'translated', { count: written, lang: cfg.targetLang });
        // Drain a large backlog quickly, then settle back to the poll interval.
        backoff = written >= cfg.batchLimit ? 1 : cfg.pollSeconds;
      } catch (err) {
        state.lastError = err.message;
        log('error', 'pass failed', { error: err.message });
        backoff = Math.min(backoff * 2, cfg.maxBackoffSeconds);
      }
      await sleep(backoff * 1000);
    }
  }

  return {
    state,
    runOnce,
    start() {
      if (!state.provider) {
        log('warn', 'no translation provider configured; records stay in English');
        return;
      }
      log('info', 'translation worker started', {
        provider: state.provider.name, lang: cfg.targetLang, pollSeconds: cfg.pollSeconds,
      });
      loop();
    },
    stop() { state.running = false; },
  };
}

export function configFromEnv(env = process.env) {
  return {
    env,
    supabaseUrl: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    targetLang: env.TRANSLATE_TARGET_LANG || 'fr',
    batchLimit: Number(env.TRANSLATE_BATCH_LIMIT || 100),
    pollSeconds: Number(env.TRANSLATE_POLL_SECONDS || 60),
    maxBackoffSeconds: Number(env.TRANSLATE_MAX_BACKOFF_SECONDS || 900),
  };
}
