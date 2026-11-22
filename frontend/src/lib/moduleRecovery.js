// A tab opened before a deployment can request a deleted, content-hashed page
// chunk. WebKit reports this as "Importing a module script failed." Refresh the
// HTML once, preserving the hash route and all saved session/draft storage.
export const MODULE_RECOVERY_KEY = 'merl:module-recovery';
export const MODULE_RECOVERY_COOLDOWN = 5 * 60 * 1000;

export function isModuleLoadError(error) {
  const message = typeof error === 'string' ? error : error?.message;
  return typeof message === 'string' && /(?:failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk [\w-]+ failed|unable to preload css for)/i.test(message);
}

export function freshPageUrl(href, now = Date.now()) {
  const url = new URL(href);
  // GitHub Pages caches index.html despite its HTML cache-control meta tags.
  // Change only the shell query, retaining the exact project/period hash.
  url.searchParams.set('_merl_refresh', String(now));
  return url.href;
}

export function recoverModuleLoad(error, browser = typeof window === 'undefined' ? undefined : window, now = Date.now()) {
  if (!browser || !isModuleLoadError(error) || browser.navigator.onLine === false) return false;
  try {
    const previous = Number(browser.sessionStorage.getItem(MODULE_RECOVERY_KEY));
    if (previous > 0 && now - previous < MODULE_RECOVERY_COOLDOWN) return false;
    // Write before navigating. If storage is unavailable, show the manual
    // recovery instead of risking a reload loop on every page load.
    browser.sessionStorage.setItem(MODULE_RECOVERY_KEY, String(now));
    browser.location.replace(freshPageUrl(browser.location.href, now));
    return true;
  } catch {
    return false;
  }
}

/** @template T @param {() => Promise<T>} load @param {Window} [browser] @returns {Promise<T>} */
export async function loadPageModule(load, browser) {
  try {
    return await load();
  } catch (error) {
    if (recoverModuleLoad(error, browser)) {
      // Keep Suspense's loading state while navigation fetches the new shell.
      // Do not render a red error screen or a bogus empty lazy component.
      return new Promise(() => {});
    }
    throw error;
  }
}
