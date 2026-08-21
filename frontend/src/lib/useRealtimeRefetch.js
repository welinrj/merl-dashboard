// =============================================================================
// useRealtimeRefetch — subscribe to Supabase Postgres changes on a table and
// re-run a fetch callback whenever a row changes, so dashboards reflect new
// data without a manual refresh (ToR: "real-time information").
// =============================================================================
// Mirrors the channel pattern already used in Datasets.jsx. The table must be
// on the `supabase_realtime` publication (see migration 0026) for events to
// arrive; if it isn't, this is simply inert — the page still works, it just
// won't push-update. `schema` defaults to the `merl` app schema.
//
//   useRealtimeRefetch('srf_activities', load);
//
// `onChange` should be stable (wrap it in useCallback) so the subscription
// isn't torn down and rebuilt on every render.

import { useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useRealtimeRefetch(table, onChange, { schema = 'merl' } = {}) {
  useEffect(() => {
    if (!table || typeof onChange !== 'function') return undefined;
    const channel = supabase
      .channel(`rt-${schema}-${table}`)
      .on('postgres_changes', { event: '*', schema, table }, () => { onChange(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table, schema, onChange]);
}

export default useRealtimeRefetch;
