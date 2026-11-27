import { useCallback, useEffect, useRef, useState } from 'react';

// Recheck while visible and when returning to the app. Works without relying
// on a project's optional Supabase Realtime publication configuration.
export function useLiveDashboard() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRevision(value => value + 1); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);
  return revision;
}

// Call inside the loading effect: returns true when this run was triggered only
// by a live recheck (the 60-second timer, window focus or reconnect). Pages use
// it to refresh quietly, keeping what is on screen instead of blanking to a
// loading state, closing open panels or showing an error for a passing blip.
export function useLiveRefreshFlag(revision) {
  const last = useRef(revision);
  return useCallback(() => {
    const background = last.current !== revision;
    last.current = revision;
    return background;
  }, [revision]);
}
