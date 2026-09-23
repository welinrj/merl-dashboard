import { supabase } from '../supabaseClient';

export async function adminAuth(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('admin-user-auth', {
    body: { action, ...payload },
  });
  if (error) {
    let detail = error.message;
    try {
      const response = error.context;
      const body = response && typeof response.json === 'function' ? await response.json() : null;
      if (body?.error) detail = body.error;
    } catch { /* retain the transport error */ }
    return { data: null, error: new Error(detail) };
  }
  return { data, error: null };
}
