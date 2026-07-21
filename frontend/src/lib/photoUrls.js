// Signed-URL helper for the (private) activity-photos storage bucket.
//
// The bucket used to be public and photo URLs were built synchronously with
// `getPublicUrl`. It is now private, so object access requires short-lived
// signed URLs generated with the caller's own token (RLS-checked). This helper
// batch-signs many paths in one request and returns a path -> URL map, so pages
// that render galleries don't fan out one network call per image.
import { supabase } from '../supabaseClient';

export const PHOTO_BUCKET = 'activity-photos';
// One hour: long enough for a browsing/slideshow session, short enough that a
// leaked URL expires quickly.
export const PHOTO_URL_TTL = 3600;

/**
 * Batch-sign storage paths for a private bucket.
 * @param {string[]} paths            object paths to sign
 * @param {string}   [bucket]         bucket id (defaults to activity-photos)
 * @param {number}   [ttl]            signed-URL lifetime in seconds
 * @returns {Promise<Map<string,string>>} map of path -> signed URL (missing or
 *          errored paths are simply omitted)
 */
export async function signPhotoPaths(paths, bucket = PHOTO_BUCKET, ttl = PHOTO_URL_TTL) {
  const unique = [...new Set((paths || []).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, ttl);
  if (error || !data) return map;
  for (const row of data) {
    if (row?.signedUrl && !row.error) map.set(row.path, row.signedUrl);
  }
  return map;
}
