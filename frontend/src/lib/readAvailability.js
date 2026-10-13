// Track unresolved data reads, rather than permanently latching any fetch error.
export function createReadMonitor({ apiUrl, fetchImpl = (...args) => fetch(...args), onChange = failure => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), retryDelays = [300, 900] }) {
  const failures = new Map();
  const getFailure = () => [...failures.values()].at(-1) ?? null;
  const update = (key, failure) => {
    if (failure) failures.set(key, failure);
    else if (!failures.delete(key)) return;
    onChange(getFailure());
  };
  const monitoredFetch = async (input, init) => {
    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    const method = String(init?.method ?? request?.method ?? 'GET').toUpperCase();
    const signal = init?.signal ?? request?.signal;
    const isRead = url.origin === new URL(apiUrl).origin && url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method);
    if (!isRead) return fetchImpl(input, init);
    const key = `${method}:${url.href}`;
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(input, init);
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        if (attempt < retryDelays.length) { await wait(retryDelays[attempt]); continue; }
        update(key, { status: 0, method });
        throw error;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retryDelays.length && !signal?.aborted) {
        await response.body?.cancel().catch(() => {});
        await wait(retryDelays[attempt]);
        continue;
      }
      if (signal?.aborted) return response;
      if (response.ok || response.status === 406) { update(key, null); return response; }
      // contentLocale retries an optional translation-column probe itself.
      if (response.status === 400) {
        const body = await response.clone().text().catch(() => '');
        if (/i18n/i.test(body) && (/42703/.test(body) || /does not exist/i.test(body) || /column/i.test(body))) return response;
      }
      update(key, { status: response.status, method });
      return response;
    }
  };
  return { monitoredFetch, getFailure };
}
