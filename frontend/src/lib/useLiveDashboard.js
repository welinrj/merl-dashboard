import { useEffect, useState } from 'react';

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
