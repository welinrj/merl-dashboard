# translate-service

Keeps the French copy of the MERL records up to date.

The portal's interface is translated in the frontend bundle. The records inside
it — project names, indicator statements, risk narratives, everything an officer
types into a form — live in the database, and migration `0036` gives each of
those rows an `i18n` column to hold their French. This service is what fills it.

## How it works

```
  translation_backlog()  ─→  translation engine  ─→  save_machine_translation()
     what is missing            DeepL / Google            write it back
     or has gone stale          / LibreTranslate
```

Every interesting decision is in the database, not here:

- **What is missing** — a field with text and no translation, or one whose
  English has been edited since the stored French was produced (`i18n._src`
  records the English that was translated).
- **What must not be touched** — a translation an officer has corrected by hand
  is marked `human` and never offered again.
- **Whether a result still applies** — the write carries the source text it was
  translated from, and the database refuses it if the record changed while the
  batch was in flight.

That means a restart mid-batch, two workers running at once, or a translation
arriving after the officer edited the record are ordinary cases rather than
races. This service can be stopped, restarted or scaled without coordination.

## The portal works without it

If no provider is configured the worker idles and logs one warning. Records then
render in the language they were entered in, which is what the frontend falls
back to anyway — the same posture as the Redis cache sidecar. Supabase Cloud
staging runs without this service.

## What is never sent to the engine

Government records print into official reports, so two rules apply before
anything leaves the server (`protect.js`, and the tests in `test/`):

1. **Whole values that are not prose are never sent** — project and record codes
   (`VCRP-001`, `RSK-01`), bare acronyms, figures, dates, URLs and file paths.
2. **Inside prose, protected tokens are shielded** — the six provinces,
   `Vanuatu`, `DoCC`, donor acronyms and embedded record codes are wrapped in an
   ignore tag the engine is told to leave alone, then unwrapped.

Person names, organisation and agency names, acronym columns and place-name
columns are not in the registry at all, so they never reach this service.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `SUPABASE_URL` | — | **Required.** Base URL of the Supabase/PostgREST endpoint. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Required.** The backlog and write RPCs are granted to `service_role` only. |
| `TRANSLATE_PROVIDER` | _unset_ | `deepl`, `google`, `libretranslate`, or unset to idle. |
| `TRANSLATE_API_KEY` | — | Required for `deepl` and `google`. |
| `TRANSLATE_ENDPOINT` | provider default | Override the API base URL (a self-hosted LibreTranslate, or DeepL's free tier). |
| `TRANSLATE_TARGET_LANG` | `fr` | Language to produce. |
| `TRANSLATE_BATCH_LIMIT` | `100` | Fields claimed per pass. |
| `TRANSLATE_POLL_SECONDS` | `60` | Idle interval. A full batch drains immediately instead of waiting. |
| `TRANSLATE_MAX_BACKOFF_SECONDS` | `900` | Ceiling for the exponential backoff after a failed pass. |
| `PORT` | `8081` | Health endpoint. |

The service-role key is the database's superuser-equivalent. It belongs in the
server's `.env`, never in the frontend build, and this container is not exposed
through the proxy.

## Health

`GET /health` reports what the worker has actually been doing, so a stalled
translation queue is visible without opening a shell:

```json
{
  "status": "ok",
  "provider": "deepl",
  "lang": "fr",
  "lastRunAt": "2026-08-26T02:14:03.118Z",
  "lastError": null,
  "translated": 412,
  "skipped": 57,
  "failures": 0
}
```

`skipped` counts fields deliberately not sent (codes, figures, links). It is
expected to be non-zero and to grow.

Coverage from the database side is `public.translation_coverage('fr')`, which
returns translated / pending / corrected counts.

## Tests

```
npm test
```

The protection rules are the part of this service that could quietly corrupt an
official record, so that is where the tests are. The rest is a poll loop.
