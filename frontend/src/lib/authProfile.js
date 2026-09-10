import { supabase } from '../supabaseClient';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolve the authenticated MERL profile after Supabase Auth sign-in.
 * A freshly-created/refreshed session can become visible to PostgREST a fraction
 * later than the auth event itself, so retry briefly before treating the account
 * as unlinked. This prevents valid Viewer and other read-only users being signed
 * straight back out because the first current_profile() call was momentarily empty.
 */
export async function loadCurrentProfile({ attempts = 4, delayMs = 150 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.rpc('current_profile');
    lastError = error || null;
    const profile = Array.isArray(data) ? data[0] : null;
    if (!error && profile?.id && profile?.role) {
      return { profile, error: null };
    }
    if (attempt < attempts - 1) await wait(delayMs * (attempt + 1));
  }
  return { profile: null, error: lastError };
}
