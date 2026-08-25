// provider.js — the translation engine, behind one small interface.
//
// Which engine is a deployment decision, not an application one: DoCC may move
// from a hosted API to something inside the server room without the worker
// changing. Each provider takes an array of strings and returns an array of
// translations in the same order.

import { protectText, unprotect } from './protect.js';

const BATCH_MAX = 40;          // requests are cheaper in batches; keep them small
                               // enough that one failure costs little.

class TranslationError extends Error {
  constructor(message, { retryable = false, status } = {}) {
    super(message);
    this.name = 'TranslationError';
    this.retryable = retryable;
    this.status = status;
  }
}

const classify = (status) =>
  new TranslationError(`Translation API returned ${status}`, {
    status,
    // 429 rate limit and 5xx are worth retrying; 4xx means our request is wrong.
    retryable: status === 429 || status >= 500,
  });

// ── DeepL ────────────────────────────────────────────────────────────────────
// tag_handling=xml plus ignore_tags=x is what makes the <x> spans from
// protect.js survive untouched.
function deeplProvider({ apiKey, endpoint }) {
  const url = endpoint
    || (apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');

  return {
    name: 'deepl',
    async translate(texts, targetLang) {
      const body = new URLSearchParams();
      body.set('source_lang', 'EN');
      body.set('target_lang', targetLang.toUpperCase());
      body.set('tag_handling', 'xml');
      body.set('ignore_tags', 'x');
      body.set('preserve_formatting', '1');
      for (const t of texts) body.append('text', protectText(t));

      const res = await fetch(`${url}/v2/translate`, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      if (!res.ok) throw classify(res.status);
      const json = await res.json();
      return json.translations.map((t) => unprotect(t.text));
    },
  };
}

// ── Google Cloud Translation (v2) ────────────────────────────────────────────
// Google's equivalent of an ignore tag is an HTML <span translate="no">.
function googleProvider({ apiKey, endpoint }) {
  const url = endpoint || 'https://translation.googleapis.com/language/translate/v2';
  const toNoTranslate = (s) =>
    protectText(s).replace(/<x>/g, '<span translate="no">').replace(/<\/x>/g, '</span>');

  return {
    name: 'google',
    async translate(texts, targetLang) {
      const res = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: texts.map(toNoTranslate),
          source: 'en',
          target: targetLang,
          format: 'html',
        }),
      });
      if (!res.ok) throw classify(res.status);
      const json = await res.json();
      return json.data.translations.map((t) =>
        unprotect(String(t.translatedText).replace(/<\/?span[^>]*>/g, '')));
    },
  };
}

// ── LibreTranslate ───────────────────────────────────────────────────────────
// Self-hostable, for a deployment that may not send project text off-site.
// It has no ignore-tag support, so protected spans are swapped for opaque
// placeholders and put back afterwards.
function libreProvider({ endpoint, apiKey }) {
  const url = endpoint || 'http://libretranslate:5000';

  return {
    name: 'libretranslate',
    async translate(texts, targetLang) {
      const out = [];
      for (const text of texts) {
        const keep = [];
        const masked = protectText(text).replace(/<x>(.*?)<\/x>/g, (_, term) => {
          keep.push(term);
          return `␂${keep.length - 1}␃`;
        });
        const res = await fetch(`${url}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: masked, source: 'en', target: targetLang, format: 'text',
            ...(apiKey ? { api_key: apiKey } : {}),
          }),
        });
        if (!res.ok) throw classify(res.status);
        const json = await res.json();
        out.push(String(json.translatedText)
          .replace(/␂(\d+)␃/g, (_, i) => keep[Number(i)] ?? ''));
      }
      return out;
    },
  };
}

/**
 * Build the provider named by TRANSLATE_PROVIDER. Returns null when none is
 * configured — the worker then idles rather than crash-looping, so a
 * deployment without a translation key still runs and simply shows the
 * English, which is exactly the fallback the frontend already expects.
 */
export function makeProvider(env = process.env) {
  const name = (env.TRANSLATE_PROVIDER || '').toLowerCase();
  const apiKey = env.TRANSLATE_API_KEY || '';
  const endpoint = env.TRANSLATE_ENDPOINT || '';

  if (!name || name === 'none') return null;
  if (name !== 'libretranslate' && !apiKey) return null;

  if (name === 'deepl') return deeplProvider({ apiKey, endpoint });
  if (name === 'google') return googleProvider({ apiKey, endpoint });
  if (name === 'libretranslate') return libreProvider({ endpoint, apiKey });
  throw new Error(`Unknown TRANSLATE_PROVIDER: ${name}`);
}

export { BATCH_MAX, TranslationError };
